import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { blindIndex, encryptPII } from "@/lib/encryption";
import { errorJson, limitByIp, readJsonObject, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { signBystanderToken } from "@/lib/tokens";
import { PhoneVerificationError, phoneErrorMessage, verifyPhoneProof } from "@/lib/phone-verification";

/**
 * Turns a verified phone number into a bystander token.
 *   { phoneProof } -> { success, token }
 * (`phoneProof` comes from /api/phone/verify with purpose "bystander".)
 * The token authorises filing one incident report; it is not a member session.
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "bystanderVerifyIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    let phone: string;
    try {
      ({ phone } = await verifyPhoneProof(body.phoneProof, { purpose: "bystander" }));
    } catch (error) {
      if (error instanceof PhoneVerificationError) {
        return errorJson(phoneErrorMessage(error), 401);
      }
      throw error;
    }

    if (!(await rateLimit("bystanderVerifyPhone", blindIndex(phone))).success) {
      return tooMany("Too many verification attempts for this number.");
    }

    const mobileNumberHash = blindIndex(phone);
    const bystander = await prisma.bystander.upsert({
      where: { mobileNumberHash },
      create: { mobileNumber: encryptPII(phone)!, mobileNumberHash, verified: true },
      update: { verified: true },
    });

    return NextResponse.json({ success: true, token: await signBystanderToken(bystander.id) });
  } catch (error) {
    console.error("Bystander verification error:", error);
    return errorJson("Internal server error", 500);
  }
}
