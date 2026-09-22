import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, readJsonObject, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTotpEnrollToken } from "@/lib/tokens";
import { TwoFactorError, completeEnrollment } from "@/lib/two-factor";
import { setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

/**
 * Finishes enrolment: the user types the first code their app shows. On success the authenticator is active,
 * recovery codes are returned (shown once), earlier sessions are signed out, and this browser is signed in.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const claims = body && typeof body.enrollToken === "string" ? await verifyTotpEnrollToken(body.enrollToken) : null;
    if (!claims || !body) return errorJson("Session expired, please login again", 401);

    const user = await prisma.user.findUnique({ where: { id: claims.id } });
    if (!user || user.tokenVersion !== claims.tokenVersion) return errorJson("Session expired, please login again", 401);

    if (!(await rateLimit("totpEnroll", user.id)).success) return tooMany();

    let recoveryCodes: string[];
    try {
      recoveryCodes = await completeEnrollment(user.id, body.code);
    } catch (error) {
      if (error instanceof TwoFactorError) return errorJson(error.message, 400, { reason: error.reason });
      throw error;
    }

    await writeAudit(request, user.id, claims.recovery ? "TOTP_RECOVERED" : "TOTP_ENROLLED");

    // completeEnrollment bumped tokenVersion, so read the row again for the session.
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return setSessionCookie(NextResponse.json({ success: true, role: fresh.role, recoveryCodes }), fresh);
  } catch (error) {
    console.error("TOTP confirm error:", error);
    return errorJson("Internal server error", 500);
  }
}
