import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, limitByIp, readJsonObject, unauthorized } from "@/lib/http";
import { getSessionUser } from "@/lib/auth-guard";
import { verifyPendingTwoFactorToken, signPhoneProofToken } from "@/lib/tokens";
import { parseE164 } from "@/lib/phone";
import { sha256Hex } from "@/lib/crypto";
import { encryptPII } from "@/lib/encryption";
import { OTP_PURPOSES, isAllowedNumber, type OtpPurpose } from "@/lib/otp/config";
import { Msg91WidgetError, verifyWidgetAccessToken } from "@/lib/msg91-widget";

/**
 * Confirms a phone number using MSG91's OTP Widget (src/components/Msg91WidgetOtp.tsx sends the code and
 * checks it client-side; this route asks MSG91's server to confirm the resulting access-token before we
 * trust it -- see src/lib/msg91-widget.ts for exactly what that check does and does not guarantee today).
 *
 * On success returns a single-use `proof` for the next call (login / register / bystander / change-phone).
 *
 * Single-use enforcement: the widget gives us no challenge id of its own, so we use a hash of the
 * access-token as one, in the same PhoneOtp table the old code-based flow used for the same purpose (its
 * consumedAt/proofUsedAt columns are exactly the replay guard signPhoneProofToken's downstream check
 * relies on). The row's PRIMARY KEY collision is what stops the same access-token being redeemed twice.
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "otpVerifyIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const purpose = body.purpose as OtpPurpose;
    if (!OTP_PURPOSES.includes(purpose)) return errorJson("Invalid request", 400);

    const phone = parseE164(body.phone);
    if (!phone || !isAllowedNumber(phone)) return errorJson("Invalid phone number", 400);
    if (typeof body.accessToken !== "string" || !body.accessToken) return errorJson("Missing access token", 400);

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

    const { phone: confirmedPhone } = await verifyWidgetAccessToken(body.accessToken, phone);

    const challengeId = sha256Hex(body.accessToken).slice(0, 36); // matches the id column's expected shape
    try {
      await prisma.phoneOtp.create({
        data: {
          id: challengeId,
          purpose,
          phoneEnc: encryptPII(confirmedPhone)!,
          userId: userId ?? null,
          codeHash: challengeId, // no code exists in this flow; the row exists only for the replay guard
          channel: "widget",
          expiresAt: new Date(Date.now() + 10 * 60_000),
          consumedAt: new Date(), // MSG91 already confirmed the code; this row is "pre-consumed"
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        return errorJson("This verification was already used. Please request a new code.", 401);
      }
      throw error;
    }

    const proof = await signPhoneProofToken({ challengeId, phone: confirmedPhone, purpose, userId });
    return NextResponse.json({ success: true, proof, phone: confirmedPhone });
  } catch (error) {
    if (error instanceof Msg91WidgetError) {
      const status = error.reason === "unconfigured" ? 503 : error.reason === "network" ? 502 : 401;
      return errorJson(
        error.reason === "unconfigured"
          ? "Phone verification is not available right now. Please contact support."
          : "Phone verification failed. Please try again.",
        status,
        // TEMPORARY (pre-launch live debugging only): server logs weren't surfacing which of the three
        // rejection paths fired, so exposing the real reason here directly -- remove before real users
        // ever hit this route, since it leaks internal detail about the verification check.
        { debug: { reason: error.reason, detail: error.message } }
      );
    }
    console.error("OTP verify error:", error);
    return errorJson("Internal server error", 500);
  }
}
