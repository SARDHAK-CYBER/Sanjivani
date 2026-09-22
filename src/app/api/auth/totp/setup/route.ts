import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, readJsonObject, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTotpEnrollToken } from "@/lib/tokens";
import { beginEnrollment } from "@/lib/two-factor";

/**
 * Starts authenticator enrolment: returns a fresh secret and the otpauth:// URI for the QR code. Requires the
 * enrolment token, which is only issued after password + a phone code (see /api/auth/login).
 * Calling it again returns the same pending secret; nothing changes for the account until /confirm succeeds.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const claims = body && typeof body.enrollToken === "string" ? await verifyTotpEnrollToken(body.enrollToken) : null;
    if (!claims) return errorJson("Session expired, please login again", 401);

    const user = await prisma.user.findUnique({ where: { id: claims.id } });
    if (!user || user.tokenVersion !== claims.tokenVersion) return errorJson("Session expired, please login again", 401);

    if (!(await rateLimit("totpEnroll", user.id)).success) return tooMany();

    const { secret, uri } = await beginEnrollment(user);
    return NextResponse.json({ success: true, secret, uri });
  } catch (error) {
    console.error("TOTP setup error:", error);
    return errorJson("Internal server error", 500);
  }
}
