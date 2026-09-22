import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { cleanString, errorJson, readJsonObject, unauthorized } from "@/lib/http";
import { ASSET_TYPES } from "@/lib/constants";
import { StorageError, adoptOptionalTempFile } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

const assetSelect = {
  id: true,
  assetType: true,
  identifier: true,
  qrReferenceId: true,
  createdAt: true,
  frontPhotoUrl: true,
  backPhotoUrl: true,
  leftPhotoUrl: true,
  rightPhotoUrl: true,
  rcPhotoUrl: true,
  devicePhotoUrl: true,
  user: { select: { id: true, fullName: true, uii: true, role: true } },
} as const;

/** Admin only: assets and their QR reference IDs are the credential a bystander scans. */
export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) return unauthorized();

    const limit = Math.min(Math.max(Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "200", 10) || 200, 1), 500);
    const assets = await prisma.asset.findMany({ select: assetSelect, orderBy: { createdAt: "desc" }, take: limit });
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Error fetching assets:", error);
    return errorJson("Failed to fetch assets", 500);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorized();

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const userId = cleanString(body.userId, 64);
    const identifier = cleanString(body.identifier, 100);
    const assetType = body.assetType;
    if (!userId) return errorJson("User ID is required", 400);
    if (!identifier) return errorJson("Identifier is required", 400);
    if (typeof assetType !== "string" || !(ASSET_TYPES as readonly string[]).includes(assetType)) {
      return errorJson("Invalid asset type", 400);
    }

    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!owner) return errorJson("Owner not found", 404);

    let photos;
    try {
      const dest = [owner.id];
      photos = {
        frontPhotoUrl: await adoptOptionalTempFile(body.frontPhotoUrl, dest),
        backPhotoUrl: await adoptOptionalTempFile(body.backPhotoUrl, dest),
        leftPhotoUrl: await adoptOptionalTempFile(body.leftPhotoUrl, dest),
        rightPhotoUrl: await adoptOptionalTempFile(body.rightPhotoUrl, dest),
        rcPhotoUrl: await adoptOptionalTempFile(body.rcPhotoUrl, dest),
        devicePhotoUrl: await adoptOptionalTempFile(body.devicePhotoUrl, dest),
      };
    } catch (error) {
      if (error instanceof StorageError) return errorJson(error.message, 400);
      throw error;
    }

    const asset = await prisma.asset.create({
      data: { userId: owner.id, assetType, identifier, ...photos },
      select: assetSelect,
    });

    await writeAudit(request, owner.id, "ASSET_REGISTERED", `Admin ID: ${admin.id}, Asset: ${assetType} ${identifier}`);
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error creating asset:", error);
    return errorJson("Failed to create asset", 500);
  }
}
