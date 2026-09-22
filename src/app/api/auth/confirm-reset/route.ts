import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, sha256Hex } from "@/lib/crypto";
import { errorJson, limitByIp, readJsonObject } from "@/lib/http";
import { decryptPIIOrNull } from "@/lib/encryption";
import { validatePassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "resetConfirmIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    const token = body && typeof body.token === "string" && /^[a-f0-9]{64}$/.test(body.token) ? body.token : null;
    if (!token) return errorJson("Invalid or expired reset token", 400);

    const resetToken = sha256Hex(token);
    const user = await prisma.user.findUnique({ where: { resetToken } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return errorJson("Invalid or expired reset token", 400);
    }

    const passwordError = validatePassword(body!.password, {
      fullName: user.fullName,
      dob: decryptPIIOrNull(user.dob),
      email: user.email,
    });
    if (passwordError) return errorJson(passwordError, 400);

    const passwordHash = await hashPassword(body!.password as string);

    // Single-use even under concurrency: only one request can match the still-valid token.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, resetToken, resetTokenExpiry: { gt: new Date() } },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        // Invalidates every session issued before the reset.
        tokenVersion: { increment: 1 },
      },
    });
    if (count === 0) return errorJson("Invalid or expired reset token", 400);

    await writeAudit(request, user.id, "PASSWORD_RESET_COMPLETED");
    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Confirm reset error:", error);
    return errorJson("Internal server error", 500);
  }
}
