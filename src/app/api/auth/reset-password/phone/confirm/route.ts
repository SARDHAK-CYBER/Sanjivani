import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { cleanString, errorJson, limitByIp, readJsonObject } from "@/lib/http";
import { decryptPIIOrNull } from "@/lib/encryption";
import { validatePassword } from "@/lib/password";
import { OtpError, checkCode } from "@/lib/otp/service";
import { writeAudit } from "@/lib/audit";

/**
 * Forgot password, by SMS, step 2: { email, challengeId, code, password }. The code (sent to the account's own phone)
 * proves ownership, so the new password is set in the same request. The password is validated first so a typo there
 * does not burn the single-use code. All sessions are signed out; two-factor is untouched, so sign-in still needs the
 * authenticator app. The phone was just proven, so an administrator is not asked for a second texted code afterwards.
 */
export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "resetConfirmIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    const email = body ? cleanString(body.email, 254)?.toLowerCase() : null;
    const challengeId = body ? cleanString(body.challengeId, 64) : null;
    if (!body || !email || !challengeId) return errorJson("Invalid request", 400);

    const user = await prisma.user.findUnique({ where: { email } });
    // Same answer as a wrong code: nothing here says whether the account exists.
    if (!user) return errorJson("That code is incorrect or has expired. Please request a new one.", 400);

    const passwordError = validatePassword(body.password, { fullName: user.fullName, dob: decryptPIIOrNull(user.dob), email: user.email });
    if (passwordError) return errorJson(passwordError, 400);

    try {
      await checkCode({ challengeId, code: body.code, purpose: "password-reset", userId: user.id });
    } catch (error) {
      if (error instanceof OtpError) {
        await writeAudit(request, user.id, "PASSWORD_RESET_FAILED", `Code check: ${error.reason}`);
        return errorJson(error.message, error.reason === "locked" ? 429 : 400, {
          reason: error.reason,
          ...(error.extra.attemptsLeft !== undefined ? { attemptsLeft: error.extra.attemptsLeft } : {}),
        });
      }
      throw error;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.password as string), resetToken: null, resetTokenExpiry: null, tokenVersion: { increment: 1 } },
    });
    await writeAudit(request, user.id, "PASSWORD_RESET_BY_PHONE");
    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset-by-SMS confirm error:", error);
    return errorJson("Internal server error", 500);
  }
}
