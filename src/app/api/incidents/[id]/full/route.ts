import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptPIIOrNull } from "@/lib/encryption";
import { bearerToken, verifyBystanderToken } from "@/lib/tokens";
import { errorJson, unauthorized } from "@/lib/http";
import { PII_RELEASABLE_STATUSES, PII_RELEASE_DELAY_SECONDS } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

/**
 * The emergency details a bystander needs to help: allergies and who to call. Deliberately
 * excludes the home address (nothing in the response flow needs it), and is only released to the
 * bystander who filed this report, after the review delay, and if an admin has not blocked it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = bearerToken(request);
    const bystander = token ? await verifyBystanderToken(token) : null;
    if (!bystander) return unauthorized();

    const { id } = await params;
    const incident = await prisma.incident.findFirst({
      where: { id, bystanderId: bystander.bystanderId },
      select: {
        status: true,
        createdAt: true,
        asset: {
          select: {
            userId: true,
            user: {
              select: {
                allergies: true,
                emergencyContact: true,
                guardianRelation: true,
                guardianName: true,
                guardianContact: true,
              },
            },
          },
        },
      },
    });
    if (!incident) return errorJson("Incident not found", 404);

    if (incident.status === "BLOCKED") return errorJson("Release blocked by Admin intervention.", 403);
    if (!(PII_RELEASABLE_STATUSES as readonly string[]).includes(incident.status)) {
      return errorJson("Details are not available for this report.", 403);
    }

    const elapsedMs = Date.now() - incident.createdAt.getTime();
    if (elapsedMs < PII_RELEASE_DELAY_SECONDS * 1000) {
      const retryAfter = Math.ceil((PII_RELEASE_DELAY_SECONDS * 1000 - elapsedMs) / 1000);
      return errorJson("PII release pending delay window", 425, { retryAfter });
    }

    const owner = incident.asset.user;
    await writeAudit(request, incident.asset.userId, "BYSTANDER_FULL_PII_RELEASED", `Incident ID: ${id}`);

    return NextResponse.json({
      success: true,
      allergies: decryptPIIOrNull(owner.allergies),
      emergencyContact: decryptPIIOrNull(owner.emergencyContact),
      guardianRelation: decryptPIIOrNull(owner.guardianRelation),
      guardianName: decryptPIIOrNull(owner.guardianName),
      guardianContact: decryptPIIOrNull(owner.guardianContact),
    });
  } catch (error) {
    console.error("Full PII fetch error:", error);
    return errorJson("Failed to fetch full PII", 500);
  }
}
