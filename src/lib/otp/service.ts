import crypto, { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptPII, derivedKey, encryptPII } from "@/lib/encryption";
import { signPhoneProofToken } from "@/lib/tokens";
import { deliverCode, OtpSendError } from "@/lib/otp/transport";
import { availableChannels, type OtpChannel, type OtpPurpose } from "@/lib/otp/config";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000;
/** Wrong guesses allowed per challenge, counted across resends. */
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 3;
/** Minimum gap between sends within one challenge. Configurable with OTP_RESEND_COOLDOWN_SECONDS. */
export const resendCooldownSeconds = () => {
  const configured = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30;
};

export type OtpFailure = "send_failed" | "cooldown" | "too_many_sends" | "expired" | "invalid" | "locked" | "not_found";

export class OtpError extends Error {
  constructor(
    public readonly reason: OtpFailure,
    message: string,
    public readonly extra: { retryAfter?: number; attemptsLeft?: number } = {}
  ) {
    super(message);
    this.name = "OtpError";
  }
}

/** A uniformly random zero-padded numeric code (crypto.randomInt is unbiased). */
export function generateCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * Keyed hash of a code, bound to its challenge id: a stolen database row cannot be brute-forced
 * offline without the server key, and a code for one challenge never matches another.
 */
export function hashCode(challengeId: string, code: string): string {
  return crypto.createHmac("sha256", derivedKey("sanjivani:otp-code:v1")).update(`${challengeId}:${code}`).digest("hex");
}

const safeEqualHex = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export type SendInput = {
  purpose: OtpPurpose;
  phone: string; // E.164
  userId?: string;
  channel: OtpChannel;
  /** Continue an existing challenge (send a fresh code) instead of starting a new one. */
  resendChallengeId?: string;
};

export type SendOutput = { challengeId: string; channel: OtpChannel; resendAfterSeconds: number };

/** Delivers the code, falling back from WhatsApp to SMS if WhatsApp cannot be sent. Returns the channel used. */
async function deliverWithFallback(channel: OtpChannel, phone: string, code: string): Promise<OtpChannel> {
  try {
    await deliverCode(channel, phone, code);
    return channel;
  } catch (error) {
    if (!(error instanceof OtpSendError)) throw error;
    console.error(`OTP delivery over ${channel} failed:`, error.message);
    if (channel === "whatsapp" && availableChannels().includes("sms")) {
      await deliverCode("sms", phone, code); // a failure here propagates as OtpSendError
      return "sms";
    }
    throw error;
  }
}

export async function sendOtp(input: SendInput): Promise<SendOutput> {
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  let challengeId: string;

  if (input.resendChallengeId) {
    const row = await prisma.phoneOtp.findUnique({ where: { id: input.resendChallengeId } });
    const stillOpen = row && !row.consumedAt && row.expiresAt > now;
    if (!row || !stillOpen || row.purpose !== input.purpose || (row.userId ?? undefined) !== input.userId) {
      throw new OtpError("not_found", "This verification has expired. Please start again.");
    }
    if (decryptPII(row.phoneEnc) !== input.phone) {
      throw new OtpError("not_found", "This verification has expired. Please start again.");
    }
    if (row.sendCount >= MAX_SENDS) {
      throw new OtpError("too_many_sends", "Too many codes requested. Please start again in a few minutes.");
    }
    const waitMs = resendCooldownSeconds() * 1000 - (now.getTime() - row.lastSentAt.getTime());
    if (waitMs > 0) {
      throw new OtpError("cooldown", "Please wait before requesting another code.", { retryAfter: Math.ceil(waitMs / 1000) });
    }

    // Conditional update: two simultaneous resends cannot both pass the cooldown / send-count checks.
    challengeId = row.id;
    const updated = await prisma.phoneOtp.updateMany({
      where: {
        id: row.id,
        consumedAt: null,
        sendCount: { lt: MAX_SENDS },
        lastSentAt: { lte: new Date(now.getTime() - resendCooldownSeconds() * 1000) },
      },
      data: { codeHash: hashCode(row.id, code), sendCount: { increment: 1 }, lastSentAt: now, expiresAt, channel: input.channel },
    });
    if (updated.count === 0) {
      throw new OtpError("cooldown", "Please wait before requesting another code.", { retryAfter: resendCooldownSeconds() });
    }
  } else {
    challengeId = randomUUID();
    await prisma.phoneOtp.create({
      data: {
        id: challengeId,
        purpose: input.purpose,
        phoneEnc: encryptPII(input.phone)!,
        userId: input.userId ?? null,
        codeHash: hashCode(challengeId, code),
        channel: input.channel,
        expiresAt,
        lastSentAt: now,
      },
    });
  }

  let usedChannel: OtpChannel;
  try {
    usedChannel = await deliverWithFallback(input.channel, input.phone, code);
  } catch (error) {
    if (!input.resendChallengeId) await prisma.phoneOtp.delete({ where: { id: challengeId } }).catch(() => {});
    if (error instanceof OtpSendError) {
      throw new OtpError("send_failed", "We could not send the code. Please try again, or use the other option.");
    }
    throw error;
  }

  if (usedChannel !== input.channel) {
    await prisma.phoneOtp.update({ where: { id: challengeId }, data: { channel: usedChannel } }).catch(() => {});
  }
  return { challengeId, channel: usedChannel, resendAfterSeconds: resendCooldownSeconds() };
}

export type CheckInput = { challengeId: string; code: unknown; purpose: OtpPurpose; userId?: string };

/**
 * Checks a code. On success returns a single-use phone-proof token asserting "this number was verified
 * for this purpose". Every path that reaches the comparison first spends an attempt atomically, so
 * concurrent guessing cannot exceed MAX_ATTEMPTS.
 */
export async function checkCode(input: CheckInput): Promise<{ proof: string; phone: string }> {
  const code = typeof input.code === "string" ? input.code.replace(/\s+/g, "") : "";
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    throw new OtpError("invalid", `Enter the ${OTP_LENGTH}-digit code.`);
  }

  const now = new Date();
  const row = await prisma.phoneOtp.findUnique({ where: { id: input.challengeId } });
  // Same answer for "no such challenge" and "someone else's challenge".
  if (!row || row.purpose !== input.purpose || (row.userId ?? undefined) !== input.userId || row.consumedAt) {
    throw new OtpError("not_found", "This verification has expired. Please request a new code.");
  }

  const reserved = await prisma.phoneOtp.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    if (row.expiresAt <= now) throw new OtpError("expired", "That code has expired. Please request a new one.");
    throw new OtpError("locked", "Too many wrong attempts. Please request a new code.");
  }

  if (!safeEqualHex(row.codeHash, hashCode(row.id, code))) {
    throw new OtpError("invalid", "That code is incorrect.", { attemptsLeft: Math.max(MAX_ATTEMPTS - (row.attempts + 1), 0) });
  }

  // Exactly one request can flip consumedAt, so one correct code yields one proof.
  const consumed = await prisma.phoneOtp.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count === 0) throw new OtpError("not_found", "This verification has expired. Please request a new code.");

  const phone = decryptPII(row.phoneEnc)!;
  const proof = await signPhoneProofToken({ challengeId: row.id, phone, purpose: row.purpose, userId: row.userId ?? undefined });
  return { proof, phone };
}
