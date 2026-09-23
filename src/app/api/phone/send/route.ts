import { NextResponse } from "next/server";
import { cleanString, errorJson, limitByIp, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { getSessionUser } from "@/lib/auth-guard";
import { decryptPIIOrNull } from "@/lib/encryption";
import { parseE164, maskPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { verifyPendingTwoFactorToken } from "@/lib/tokens";
import { verifyCaptcha } from "@/lib/turnstile";
import { OTP_PURPOSES, OtpConfigError, isAllowedNumber, phoneLimitKey, type OtpPurpose } from "@/lib/otp/config";
import { OtpError, sendOtp } from "@/lib/otp/service";

/**
 * Starts (or continues) a phone verification: sends a one-time code by SMS (Fast2SMS).
 *
 * Who chooses the number depends on the purpose:
 *   login         the account's own number (never typed, never revealed); needs the password-step tempToken
 *   change-phone  the number typed by a signed-in member
 *   register      the number typed by the applicant (anonymous)  } CAPTCHA-protected when Turnstile is configured
 *   bystander     the number typed by the reporter (anonymous)   }
 *
 * Every send costs money, so this is where the abuse controls live: per-IP, per-number and per-account
 * limits, a daily circuit breaker, a country allowlist (default +91 only) and optional CAPTCHA.
 */
export async function POST(request: Request) {
  try {
    const { ip, blocked } = await limitByIp(request, "otpSendIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const purpose = body.purpose as OtpPurpose;
    if (!OTP_PURPOSES.includes(purpose)) return errorJson("Invalid purpose", 400);
    const resendChallengeId = cleanString(body.challengeId, 64) ?? undefined;

    let userId: string | undefined;
    let phone: string | null = null;

    if (purpose === "login") {
      const pending = typeof body.tempToken === "string" ? await verifyPendingTwoFactorToken(body.tempToken) : null;
      if (!pending) return errorJson("Session expired, please login again", 401);
      const user = await prisma.user.findUnique({ where: { id: pending.id } });
      if (!user || user.tokenVersion !== pending.tokenVersion) return errorJson("Session expired, please login again", 401);
      phone = parseE164(decryptPIIOrNull(user.contactNumber));
      if (!phone) return errorJson("This account has no phone number. Please contact the C2 administrator.", 403);
      userId = user.id;
      if (!(await rateLimit("otpSendUser", user.id)).success) return tooMany();
    } else if (purpose === "change-phone") {
      const user = await getSessionUser();
      if (!user) return unauthorized();
      phone = parseE164(body.phone);
      userId = user.id;
      if (!(await rateLimit("otpSendUser", user.id)).success) return tooMany();
    } else {
      phone = parseE164(body.phone);
      // Anonymous callers must pass the bot check before we spend money (a resend continues a challenge that already passed it).
      if (!resendChallengeId && !(await verifyCaptcha(body.captchaToken, ip))) {
        return errorJson("Security check failed. Please refresh and try again.", 400);
      }
    }

    if (!phone) return errorJson("Enter a valid mobile number, e.g. +91 98765 43210.", 400);
    if (!isAllowedNumber(phone)) return errorJson("Only Indian (+91) mobile numbers are supported right now.", 400);

    if (!(await rateLimit("otpGlobal", "all")).success) {
      console.error("OTP daily circuit breaker tripped (OTP_DAILY_LIMIT).");
      return errorJson("Verification is temporarily unavailable. Please try again later.", 503);
    }
    if (!(await rateLimit("otpSendPhone", phoneLimitKey(phone))).success) {
      return tooMany("Too many codes were requested for this number. Please try again later.");
    }

    const result = await sendOtp({ purpose, phone, userId, resendChallengeId });
    return NextResponse.json({ success: true, ...result, phoneHint: maskPhone(phone) });
  } catch (error) {
    if (error instanceof OtpConfigError) {
      console.error("OTP is not configured:", error.message);
      return errorJson("Phone verification is not available right now. Please contact support.", 503);
    }
    if (error instanceof OtpError) {
      const status = error.reason === "send_failed" ? 502 : error.reason === "not_found" ? 400 : 429;
      return errorJson(error.message, status, error.extra.retryAfter ? { retryAfter: error.extra.retryAfter } : {});
    }
    console.error("OTP send error:", error);
    return errorJson("Internal server error", 500);
  }
}
