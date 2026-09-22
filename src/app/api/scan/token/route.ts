import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bearerToken, verifyBystanderToken } from "@/lib/tokens";
import { errorJson, tooMany, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

const CAPTURE_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Issues a single-use token that lets a verified bystander file exactly one report within 5 minutes. */
export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    const bystander = token ? await verifyBystanderToken(token) : null;
    if (!bystander) return unauthorized();

    if (!(await rateLimit("captureTokenBystander", bystander.bystanderId)).success) return tooMany();

    const captureToken = randomUUID();
    await prisma.captureToken.create({
      data: {
        token: captureToken,
        bystanderId: bystander.bystanderId,
        expiresAt: new Date(Date.now() + CAPTURE_TOKEN_TTL_MS),
      },
    });

    return NextResponse.json({ success: true, captureToken });
  } catch (error) {
    console.error("Capture token error:", error);
    return errorJson("Failed to generate capture token", 500);
  }
}
