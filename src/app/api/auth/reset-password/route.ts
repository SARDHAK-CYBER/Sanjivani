import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { cleanString, errorJson, limitByIp, readJsonObject } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { mailConfigured, sendMail } from "@/lib/mail";
import { writeAudit } from "@/lib/audit";

const GENERIC = { success: true, message: "If an account exists, a reset link has been sent." };
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Base URL used in emailed links. Never derived from the request: a forged Host header would poison the link. */
function appUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export async function POST(request: Request) {
  try {
    const { blocked } = await limitByIp(request, "resetRequestIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    const email = body ? cleanString(body.email, 254)?.toLowerCase() : null;
    if (!email) return errorJson("Email is required", 400);

    // Rate-limited and answered identically whether or not the account exists (no enumeration).
    if (!(await rateLimit("resetRequestEmail", email)).success) return NextResponse.json(GENERIC);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json(GENERIC);

    const token = randomToken(32);
    await prisma.user.update({
      where: { id: user.id },
      // Only the hash is stored: a database leak must not yield working reset links.
      data: { resetToken: sha256Hex(token), resetTokenExpiry: new Date(Date.now() + TOKEN_TTL_MS) },
    });

    const base = appUrl();
    if (!base) {
      console.error("NEXT_PUBLIC_APP_URL is not set; cannot build a password reset link in production.");
      return NextResponse.json(GENERIC);
    }
    const resetUrl = `${base}/reset-password/${token}`;

    if (mailConfigured()) {
      await sendMail({
        to: email,
        subject: "Reset your Sanjivani password",
        text: `Use the link below to choose a new password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not ask for this, ignore this email; your password has not changed.`,
      }).catch((error) => console.error("Password reset email failed:", (error as Error).message));
    } else {
      // The response stays generic (no account enumeration), so a missing mail setup must be loud in the logs.
      console.error("SMTP is not configured (SMTP_HOST / SMTP_FROM): password reset emails cannot be sent.");
    }

    await writeAudit(request, user.id, "PASSWORD_RESET_REQUESTED");
    return NextResponse.json(GENERIC);
  } catch (error) {
    console.error("Reset password error:", error);
    return errorJson("Internal server error", 500);
  }
}
