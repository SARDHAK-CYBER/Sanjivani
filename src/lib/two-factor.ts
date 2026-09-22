import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptPIIOrNull, derivedKey, encryptPII } from "@/lib/encryption";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";

/**
 * Authenticator-app two-factor authentication for accounts: enrolment, code checking with replay
 * protection, and one-time recovery codes. (Phone codes sent through MSG91 are used to *prove the phone*
 * at registration/scans and to authorise enrolment or recovery; see src/lib/otp.)
 */

export const TOTP_ISSUER = "Sanjivani";
export const RECOVERY_CODE_COUNT = 8;

export class TwoFactorError extends Error {
  constructor(public readonly reason: "no_pending" | "invalid", message: string) {
    super(message);
    this.name = "TwoFactorError";
  }
}

type TotpFields = { id: string; totpSecretEnc: string | null; totpEnabledAt: Date | null; totpLastStep: number | null };

export const isTotpEnabled = (user: Pick<TotpFields, "totpSecretEnc" | "totpEnabledAt">) =>
  Boolean(user.totpSecretEnc && user.totpEnabledAt);

// ── Recovery codes ─────────────────────────────────────────────────────────────────────────────────
// 10 characters from Crockford's base32 (no I, L, O, U): ~50 bits, shown as XXXXX-XXXXX. High enough entropy
// that a keyed hash is sufficient at rest; guessing is capped by the attempt limits at login.
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

/** Canonical form of what a person typed (case, spaces, hyphens, look-alike letters), or null if not a code. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(cleaned) ? cleaned : null;
}

export function hashRecoveryCode(normalized: string): string {
  return crypto.createHmac("sha256", derivedKey("sanjivani:recovery-code:v1")).update(normalized).digest("hex");
}

const newRecoveryCodes = () => Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
const recoveryRows = (userId: string, codes: string[]) =>
  codes.map((code) => ({ userId, codeHash: hashRecoveryCode(normalizeRecoveryCode(code)!) }));

export const recoveryCodesRemaining = (userId: string) => prisma.recoveryCode.count({ where: { userId, usedAt: null } });

/** Spends a recovery code if it is valid and unused. */
export async function consumeRecoveryCode(userId: string, input: unknown): Promise<boolean> {
  const normalized = normalizeRecoveryCode(input);
  if (!normalized) return false;
  const claimed = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1;
}

/** Replaces all recovery codes with a fresh set; returns the plaintext codes (the only time they are visible). */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: recoveryRows(userId, codes) }),
  ]);
  return codes;
}

// ── Enrolment ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Returns the secret to show in the QR code, holding it as "pending" until the user proves their app can produce
 * codes. Idempotent: while a pending secret exists it is returned again, so a repeated call (a double-fired
 * effect, a page refresh) can never leave the screen and the server with different secrets.
 */
export async function beginEnrollment(user: { id: string; email: string }): Promise<{ secret: string; uri: string }> {
  const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { totpPendingEnc: true } });
  let secret = decryptPIIOrNull(existing?.totpPendingEnc);

  if (!secret) {
    const fresh = generateTotpSecret();
    // Only the first of two concurrent callers wins the write; the other reads the winner's secret.
    const claimed = await prisma.user.updateMany({ where: { id: user.id, totpPendingEnc: null }, data: { totpPendingEnc: encryptPII(fresh) } });
    if (claimed.count === 1) {
      secret = fresh;
    } else {
      const winner = await prisma.user.findUnique({ where: { id: user.id }, select: { totpPendingEnc: true } });
      secret = decryptPIIOrNull(winner?.totpPendingEnc);
      if (!secret) throw new Error("Could not start authenticator setup");
    }
  }
  return { secret, uri: otpauthUri({ secret, account: user.email, issuer: TOTP_ISSUER }) };
}

/**
 * Confirms enrolment with a code from the new app, activates it, and issues recovery codes. Any previous
 * authenticator and recovery codes stop working, and every existing session is signed out (tokenVersion).
 */
export async function completeEnrollment(userId: string, code: unknown): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpPendingEnc: true } });
  const pendingEnc = user?.totpPendingEnc;
  const secret = decryptPIIOrNull(pendingEnc);
  if (!pendingEnc || !secret) throw new TwoFactorError("no_pending", "Setup was not started. Please begin again.");

  const step = verifyTotp(secret, code);
  if (step === null) throw new TwoFactorError("invalid", "That code is not correct. Check your app and your phone's clock, then try again.");

  const codes = newRecoveryCodes();
  await prisma.$transaction(async (tx) => {
    // Claim the pending secret so two simultaneous confirmations cannot both activate it.
    const claimed = await tx.user.updateMany({
      where: { id: userId, totpPendingEnc: pendingEnc },
      data: { totpSecretEnc: pendingEnc, totpPendingEnc: null, totpEnabledAt: new Date(), totpLastStep: step, tokenVersion: { increment: 1 } },
    });
    if (claimed.count === 0) throw new TwoFactorError("no_pending", "Setup was not started. Please begin again.");
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({ data: recoveryRows(userId, codes) });
  });
  return codes;
}

// ── Checking codes at sign-in ──────────────────────────────────────────────────────────────────────

/**
 * Verifies an authenticator code. Each 30-second step can be used once per account: the step is claimed
 * atomically, so a code that was just accepted (or shoulder-surfed) is useless afterwards.
 */
export async function verifyTotpForUser(user: TotpFields, code: unknown): Promise<boolean> {
  const secret = decryptPIIOrNull(user.totpSecretEnc);
  if (!secret || !user.totpEnabledAt) return false;

  const step = verifyTotp(secret, code, { afterStep: user.totpLastStep });
  if (step === null) return false;

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

// ── Administration (used by the scripts) ────────────────────────────────────────────────────────────

/** Sets up an authenticator for `user` immediately (no confirmation step) and returns what to hand over. */
export async function provisionTotp(user: { id: string; email: string }) {
  const secret = generateTotpSecret();
  const recoveryCodes = newRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: encryptPII(secret), totpPendingEnc: null, totpEnabledAt: new Date(), totpLastStep: null, tokenVersion: { increment: 1 } },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.recoveryCode.createMany({ data: recoveryRows(user.id, recoveryCodes) }),
  ]);
  return { secret, uri: otpauthUri({ secret, account: user.email, issuer: TOTP_ISSUER }), recoveryCodes };
}

/** Removes the authenticator and recovery codes and signs the user out everywhere. */
export async function resetTwoFactor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null, totpLastStep: null, tokenVersion: { increment: 1 } },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}
