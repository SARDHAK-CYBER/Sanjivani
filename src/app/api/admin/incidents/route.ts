import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { decryptPIIOrNull } from "@/lib/encryption";
import { cleanString, errorJson, readJsonObject, unauthorized } from "@/lib/http";
import { INCIDENT_STATUSES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) return unauthorized();

    const limit = Math.min(Math.max(Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "200", 10) || 200, 1), 500);
    const incidents = await prisma.incident.findMany({
      select: {
        id: true,
        assetId: true,
        bystanderId: true,
        selfieUrl: true,
        scenePhotoUrl: true,
        scenePhotoUrl2: true,
        scenePhotoUrl3: true,
        scenePhotoUrl4: true,
        latitude: true,
        longitude: true,
        ipAddress: true,
        deviceFingerprint: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        asset: {
          select: {
            identifier: true,
            assetType: true,
            user: { select: { fullName: true, uii: true, email: true, contactNumber: true } },
          },
        },
        bystander: { select: { mobileNumber: true, verified: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Decrypt only what an admin needs in order to call the owner / reporter; strip the ciphertext.
    return NextResponse.json(
      incidents.map(({ asset, bystander, ...incident }) => {
        const { contactNumber, ...owner } = asset.user;
        return {
          ...incident,
          asset: { identifier: asset.identifier, assetType: asset.assetType, user: owner },
          bystander: { mobileNumber: decryptPIIOrNull(bystander.mobileNumber) ?? "Unknown", verified: bystander.verified },
          ownerContact: decryptPIIOrNull(contactNumber) ?? "Unknown",
        };
      })
    );
  } catch (error) {
    console.error("Error fetching incidents:", error);
    return errorJson("Failed to fetch incidents", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorized();

    const body = await readJsonObject(request);
    const id = body ? cleanString(body.id, 64) : null;
    const status = body?.status;
    if (!id || typeof status !== "string") return errorJson("Missing id or status", 400);
    if (!(INCIDENT_STATUSES as readonly string[]).includes(status)) return errorJson("Invalid status", 400);

    const result = await prisma.incident.updateMany({ where: { id }, data: { status } });
    if (result.count === 0) return errorJson("Incident not found", 404);

    await writeAudit(request, admin.id, "INCIDENT_STATUS_CHANGED", `Incident ID: ${id} -> ${status}`);
    return NextResponse.json({ id, status });
  } catch (error) {
    console.error("Error updating incident:", error);
    return errorJson("Failed to update incident", 500);
  }
}
