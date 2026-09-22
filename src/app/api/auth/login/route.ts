import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { comparePassword } from "@/lib/crypto";
import { decryptPIIOrNull } from "@/lib/encryption";
import { parseE164, maskPhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { cleanString, errorJson, limitByIp, readJsonObject, tooMany } from "@/lib/http";
import { signPendingTwoFactorToken, signTotpEnrollToken, verifyPendingTwoFactorToken } from "@/lib/tokens";
import { PhoneVerificationError, phoneErrorMessage, verifyPhoneProof } from "@/lib/phone-verification";
import { isTotpEnabled, recoveryCodesRemaining, consumeRecoveryCode, verifyTotpForUser } from "@/lib/two-factor";
import { setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

/**
 * Sign-in takes two steps.
 *
 *  1. { email, password }  ->  { tempToken, method, ... }   (no session yet)
 *
 *  2. { tempToken, ... }, one of:
 *       totpCode      6-digit code from the authenticator app              -> session
 *       recoveryCode  one-time recovery code (app unavailable)             -> session
 *       phoneProof    proof from /api/phone/verify (a code sent by MSG91)  -> enrolment token, NOT a session
 *
 * `method` tells the browser what to ask for: "totp" if the account has an authenticator, "enroll" if it still
 * has to set one up. Setting one up (or replacing a lost one) requires the password AND a code sent to the
 * account's own phone. Without that, anyone who learned a password could simply enrol their own app.
 * Administrators cannot replace an authenticator through the phone; another administrator resets it (scripts/reset-2fa.ts).
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    return typeof body.tempToken === "string"
      ? await secondStep(request, body)
      : await verifyPassword(request, body);
  } catch (error) {
    console.error("Login error:", error);
    return errorJson("Internal server error", 500);
  }
}

async function verifyPassword(request: Request, body: Record<string, unknown>) {
  const { blocked } = await limitByIp(request, "loginIp");
  if (blocked) return blocked;

  const email = cleanString(body.email, 254)?.toLowerCase();
  const password = typeof body.password === "string" && body.password.length <= 128 ? body.password : null;
  if (!email || !password) return errorJson("Missing credentials", 400);

  // Counted per *attempt*, before the password is checked, so guessing one account's password is
  // capped no matter how many IPs the guesses come from.
  if (!(await rateLimit("loginAccount", email)).success) return tooMany("Too many login attempts. Please wait.");

  const user = await prisma.user.findUnique({ where: { email } });
  // Always runs a hash comparison (against a dummy for unknown/password-less accounts).
  const passwordMatches = await comparePassword(password, user?.passwordHash);
  if (!user || !passwordMatches) {
    if (user) await writeAudit(request, user.id, "LOGIN_FAILED");
    return errorJson("Invalid credentials", 401);
  }

  const phone = parseE164(decryptPIIOrNull(user.contactNumber));
  if (!phone) {
    return errorJson("This account has no verified phone number. Please contact the C2 administrator.", 403);
  }

  return NextResponse.json({
    success: true,
    requires2FA: true,
    tempToken: await signPendingTwoFactorToken(user),
    method: isTotpEnabled(user) ? "totp" : "enroll",
    canRecoverByPhone: user.role !== "ADMIN",
    // Masked, for on-screen display only. The real number is never sent to the browser -- /api/phone/send
    // looks it up itself from tempToken and sends the code server-side.
    phoneHint: maskPhone(phone),
  });
}

async function secondStep(request: Request, body: Record<string, unknown>) {
  const { blocked } = await limitByIp(request, "twoFactorIp");
  if (blocked) return blocked;

  const pending = await verifyPendingTwoFactorToken(String(body.tempToken));
  if (!pending) return errorJson("Session expired, please login again", 401);

  const user = await prisma.user.findUnique({ where: { id: pending.id } });
  if (!user || user.tokenVersion !== pending.tokenVersion) {
    return errorJson("Session expired, please login again", 401);
  }

  if (body.phoneProof !== undefined) return phoneStep(request, body, user);
  if (!isTotpEnabled(user)) {
    return errorJson("Set up your authenticator app first.", 403, { reason: "enroll_required" });
  }
  return codeStep(request, body, user);
}

/** Password + a code sent to the account's phone: allowed to (re-)enrol an authenticator. */
async function phoneStep(request: Request, body: Record<string, unknown>, user: User) {
  const phone = parseE164(decryptPIIOrNull(user.contactNumber));
  if (!phone) return errorJson("This account has no verified phone number.", 403);

  const recovery = isTotpEnabled(user);
  // Checked BEFORE the proof is spent, and refused outright for administrators: a stolen password plus a
  // SIM swap must not be enough to replace an admin's second factor.
  if (recovery && user.role === "ADMIN") {
    return errorJson("Administrators cannot reset their authenticator by phone. Ask another administrator to reset it.", 403);
  }

  try {
    await verifyPhoneProof(body.phoneProof, { purpose: "login", phone, userId: user.id });
  } catch (error) {
    if (error instanceof PhoneVerificationError) {
      await writeAudit(request, user.id, "LOGIN_2FA_FAILED", `Phone proof: ${error.reason}`);
      return errorJson(phoneErrorMessage(error), 401);
    }
    throw error;
  }

  await writeAudit(request, user.id, recovery ? "TOTP_RECOVERY_STARTED" : "TOTP_ENROLLMENT_STARTED");
  return NextResponse.json({ success: true, enrollToken: await signTotpEnrollToken(user, recovery), recovery });
}

/** Authenticator code or recovery code: completes the sign-in. */
async function codeStep(request: Request, body: Record<string, unknown>, user: User) {
  // Six digits are guessable, so attempts are capped hard per account, whichever IP they come from.
  if (!(await rateLimit("totpAttemptShort", user.id)).success || !(await rateLimit("totpAttemptDaily", user.id)).success) {
    return tooMany("Too many incorrect codes. Please wait before trying again, or use a recovery code.");
  }

  let via: "totp" | "recovery";
  let ok: boolean;
  if (typeof body.totpCode === "string") {
    via = "totp";
    ok = await verifyTotpForUser(user, body.totpCode);
  } else if (typeof body.recoveryCode === "string") {
    via = "recovery";
    ok = await consumeRecoveryCode(user.id, body.recoveryCode);
  } else {
    return errorJson("Enter the code from your authenticator app.", 400);
  }

  if (!ok) {
    await writeAudit(request, user.id, "LOGIN_2FA_FAILED", `Method: ${via}`);
    return errorJson(via === "totp" ? "That code is incorrect or already used." : "That recovery code is invalid or already used.", 401);
  }

  const remaining = via === "recovery" ? await recoveryCodesRemaining(user.id) : undefined;
  await writeAudit(request, user.id, via === "totp" ? "LOGGED_IN_WITH_TOTP" : "LOGGED_IN_WITH_RECOVERY_CODE", remaining === undefined ? undefined : `Recovery codes left: ${remaining}`);

  return setSessionCookie(NextResponse.json({ success: true, role: user.role, ...(remaining !== undefined && { recoveryCodesRemaining: remaining }) }), user);
}
