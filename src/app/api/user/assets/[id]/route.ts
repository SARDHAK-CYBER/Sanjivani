import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guard";
import { cleanString, errorJson, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ASSET_PHOTO_KEYS, ASSET_TYPES } from "@/lib/constants";
import { adoptAssetPhotos, assetSummarySelect } from "@/lib/assets";
import { StorageError } from "@/lib/storage";
import { writeAudit, type AuditChanges } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Edits one of the caller's own assets. Photos left out are untouched; null clears one. The QR ID never changes. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    if (!(await rateLimit("profileWrite", user.id)).success) return tooMany();

    const { id } = await params;
    const existing = await prisma.asset.findFirst({ where: { id, userId: user.id }, select: assetSummarySelect });
    if (!existing) return errorJson("Asset not found", 404);

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const data: Record<string, string | null> = {};
    const changes: AuditChanges = {};

    if (body.identifier !== undefined) {
      const identifier = cleanString(body.identifier, 100);
      if (!identifier) return errorJson("Identifier is required (licence plate or serial number)", 400);
      if (identifier !== existing.identifier) {
        data.identifier = identifier;
        changes.identifier = { from: existing.identifier, to: identifier };
      }
    }
    if (body.assetType !== undefined) {
      if (typeof body.assetType !== "string" || !(ASSET_TYPES as readonly string[]).includes(body.assetType)) return errorJson("Invalid asset type", 400);
      if (body.assetType !== existing.assetType) {
        data.assetType = body.assetType;
        changes.assetType = { from: existing.assetType, to: body.assetType };
      }
    }

    try {
      const photos = await adoptAssetPhotos(body, user.id);
      for (const key of ASSET_PHOTO_KEYS) {
        if (!(key in photos)) continue;
        data[key] = photos[key] ?? null;
        changes[key] = { from: existing[key] ? "photo" : null, to: photos[key] ? (existing[key] ? "replaced" : "added") : "removed" };
      }
    } catch (error) {
      if (error instanceof StorageError) return errorJson(error.message, 400);
      throw error;
    }

    if (Object.keys(data).length === 0) return NextResponse.json(existing);

    const asset = await prisma.asset.update({ where: { id }, data, select: assetSummarySelect });
    await writeAudit(request, user.id, "ASSET_UPDATED", `Changed: ${Object.keys(changes).join(", ")} (${asset.assetType} ${asset.identifier})`, changes);
    return NextResponse.json(asset);
  } catch (error) {
    console.error("Member asset update error:", error);
    return errorJson("Failed to update asset", 500);
  }
}

/** Removes an asset (and its QR). Refused once anyone has reported on it, so incident evidence is never lost. */
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    if (!(await rateLimit("profileWrite", user.id)).success) return tooMany();

    const { id } = await params;
    const existing = await prisma.asset.findFirst({ where: { id, userId: user.id }, select: { id: true, assetType: true, identifier: true } });
    if (!existing) return errorJson("Asset not found", 404);

    if ((await prisma.incident.count({ where: { assetId: id } })) > 0) {
      return errorJson("This asset has incident reports, so it cannot be removed. Contact the C2 administrator.", 409);
    }

    await prisma.asset.delete({ where: { id } });
    await writeAudit(request, user.id, "ASSET_REMOVED", `${existing.assetType} ${existing.identifier} (removed by owner)`, {
      identifier: { from: existing.identifier, to: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Member asset delete error:", error);
    return errorJson("Failed to remove asset", 500);
  }
}
