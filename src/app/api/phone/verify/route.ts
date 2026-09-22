import { NextResponse } from "next/server";
import { errorJson, limitByIp, readJsonObject, unauthorized } from "@/lib/http";
import { getSessionUser } from "@/lib/auth-guard";
import { verifyPendingTwoFactorToken } from "@/lib/tokens";
import { OTP_PURPOSES, type OtpPurpose } from "@/lib/otp/config";
import { OtpError, checkCode } from "@/lib/otp/service";

/**
 * Checks a code against the challenge started by /api/phone/send. On success returns a single-use
 * `proof` for the next call (login / register / bystander / change-phone).
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "otpVerifyIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const purpose = body.purpose as OtpPurpose;
    if (!OTP_PURPOSES.includes(purpose)) return errorJson("Invalid request", 400);
    if (typeof body.challengeId !== "string" || !body.challengeId) return errorJson("Invalid request", 400);

    // Authenticated purposes may only confirm a number for the caller's own account.
    let userId: string | undefined;
    if (purpose === "login") {
      const pending = typeof body.tempToken === "string" ? await verifyPendingTwoFactorToken(body.tempToken) : null;
      if (!pending) return errorJson("Session expired, please login again", 401);
      userId = pending.id;
    } else if (purpose === "change-phone") {
      const user = await getSessionUser();
      if (!user) return unauthorized();
      userId = user.id;
    }

    const { proof, phone } = await checkCode({ challengeId: body.challengeId, code: body.code, purpose, userId });
    return NextResponse.json({ success: true, proof, phone });
  } catch (error) {
    if (error instanceof OtpError) {
      const status = error.reason === "invalid" ? 400 : error.reason === "locked" ? 429 : 400;
      return errorJson(error.message, status, { reason: error.reason, ...(error.extra.attemptsLeft !== undefined ? { attemptsLeft: error.extra.attemptsLeft } : {}) });
    }
    console.error("OTP verify error:", error);
    return errorJson("Internal server error", 500);
  }
}
