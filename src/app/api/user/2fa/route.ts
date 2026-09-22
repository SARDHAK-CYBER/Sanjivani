import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-guard";
import { errorJson, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { isTotpEnabled, recoveryCodesRemaining, regenerateRecoveryCodes, verifyTotpForUser } from "@/lib/two-factor";
import { writeAudit } from "@/lib/audit";

/** Two-factor status for the signed-in member. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    return NextResponse.json({
      enabled: isTotpEnabled(user),
      enabledAt: user.totpEnabledAt,
      recoveryCodesRemaining: await recoveryCodesRemaining(user.id),
    });
  } catch (error) {
    console.error("2FA status error:", error);
    return errorJson("Internal server error", 500);
  }
}

/** { action: "regenerate-recovery-codes", code }: replaces the recovery codes; needs a current authenticator code. */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await readJsonObject(request);
    if (!body || body.action !== "regenerate-recovery-codes") return errorJson("Invalid request", 400);
    if (!isTotpEnabled(user)) return errorJson("Two-factor authentication is not set up.", 400);

    if (!(await rateLimit("totpAttemptShort", user.id)).success || !(await rateLimit("totpAttemptDaily", user.id)).success) {
      return tooMany("Too many incorrect codes. Please wait before trying again.");
    }
    if (!(await verifyTotpForUser(user, body.code))) return errorJson("That code is incorrect or already used.", 401);

    const recoveryCodes = await regenerateRecoveryCodes(user.id);
    await writeAudit(request, user.id, "RECOVERY_CODES_REGENERATED");
    return NextResponse.json({ success: true, recoveryCodes });
  } catch (error) {
    console.error("2FA update error:", error);
    return errorJson("Internal server error", 500);
  }
}
