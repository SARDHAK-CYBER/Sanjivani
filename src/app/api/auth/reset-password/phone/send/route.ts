import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { cleanString, errorJson, limitByIp, readJsonObject } from "@/lib/http";
import { decryptPIIOrNull } from "@/lib/encryption";
import { parseE164 } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { OtpConfigError, isAllowedNumber, phoneLimitKey } from "@/lib/otp/config";
import { OtpError, resendCooldownSeconds, sendOtp } from "@/lib/otp/service";
import { writeAudit } from "@/lib/audit";

/**
 * Forgot password, by SMS: sends a 6-digit code to the phone number registered on the account. Works for members and
 * administrators alike, and needs no email server. The number is looked up from the account, never typed, and the
 * answer is the same whether or not the account exists (an unknown email gets a decoy challenge that can never verify).
 * Resetting the password does not bypass two-factor: sign-in still asks for the authenticator app.
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "otpSendIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    const email = body ? cleanString(body.email, 254)?.toLowerCase() : null;
    if (!email) return errorJson("Email is required", 400);
    const resendChallengeId = body ? (cleanString(body.challengeId, 64) ?? undefined) : undefined;

    const decoy = () => NextResponse.json({ success: true, challengeId: randomUUID(), resendAfterSeconds: resendCooldownSeconds() });

    if (!(await rateLimit("resetSmsEmail", email)).success) {
      return errorJson("Too many reset attempts for this account. Please try again in an hour.", 429);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const phone = user ? parseE164(decryptPIIOrNull(user.contactNumber)) : null;
    if (!user || !phone || !isAllowedNumber(phone)) return decoy();

    if (!(await rateLimit("otpGlobal", "all")).success) {
      console.error("OTP daily circuit breaker tripped (OTP_DAILY_LIMIT).");
      return errorJson("Verification is temporarily unavailable. Please try again later.", 503);
    }
    if (!(await rateLimit("otpSendPhone", phoneLimitKey(phone))).success) return decoy();

    const result = await sendOtp({ purpose: "password-reset", phone, userId: user.id, resendChallengeId });
    await writeAudit(request, user.id, "PASSWORD_RESET_CODE_SENT");
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof OtpConfigError) {
      console.error("OTP is not configured:", error.message);
      return errorJson("Phone verification is not available right now. Use the email link instead, or contact support.", 503);
    }
    if (error instanceof OtpError) {
      const status = error.reason === "send_failed" ? 502 : error.reason === "not_found" ? 400 : 429;
      return errorJson(error.message, status, error.extra.retryAfter ? { retryAfter: error.extra.retryAfter } : {});
    }
    console.error("Reset-by-SMS send error:", error);
    return errorJson("Internal server error", 500);
  }
}
