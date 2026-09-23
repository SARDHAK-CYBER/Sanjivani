import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptPIIOrNull } from "@/lib/encryption";
import { bearerToken, verifyBystanderToken } from "@/lib/tokens";
import { cleanString, errorJson, readJsonObject, tooMany, unauthorized, userAgentOf } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/ip";
import { PII_RELEASE_DELAY_SECONDS } from "@/lib/constants";
import { StorageError, adoptOptionalTempFile, adoptTempFile, removeStoredDirectory } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

const MAX_SCANS_PER_HOUR = 3;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export async function POST(request: Request) {
  let incidentId: string | null = null;
  try {
    const token = bearerToken(request);
    const bystander = token ? await verifyBystanderToken(token) : null;
    if (!bystander) return unauthorized();

    if (!(await rateLimit("incidentBystander", bystander.bystanderId)).success) return tooMany();

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const qrReferenceId = cleanString(body.qrReferenceId, 64);
    const captureToken = cleanString(body.captureToken, 64);
    if (!qrReferenceId) return errorJson("Invalid QR Code", 400);
    if (!captureToken) return errorJson("Missing capture token", 400);
    if (!body.selfieUrl || !body.scenePhotoUrl || !body.scenePhotoUrl2) {
      return errorJson("Missing required photos. A selfie and at least two scene photos are required.", 400);
    }

    // GPS is optional (denied permission, plain-HTTP testing) but, when present, must be sane.
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (body.latitude != null || body.longitude != null) {
      if (!isNumber(body.latitude) || !isNumber(body.longitude)) return errorJson("Invalid GPS coordinates", 400);
      if (body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
        return errorJson("GPS coordinates out of bounds", 400);
      }
      if (!(body.latitude === 0 && body.longitude === 0)) {
        latitude = body.latitude;
        longitude = body.longitude;
      }
    }
    const accuracy = isNumber(body.accuracy) ? body.accuracy : null;

    const asset = await prisma.asset.findUnique({
      where: { qrReferenceId },
      select: { id: true, userId: true, user: { select: { bloodGroup: true, fullName: true } } },
    });
    if (!asset) return errorJson("Invalid QR Code or User Not Found", 404);

    // Single use, bound to this bystander, and expiry actually enforced.
    const consumed = await prisma.captureToken.deleteMany({
      where: { token: captureToken, bystanderId: bystander.bystanderId, expiresAt: { gt: new Date() } },
    });
    if (consumed.count === 0) return errorJson("Invalid or expired capture token", 400);

    incidentId = randomUUID();
    const destination = ["incidents", incidentId];
    let photos: { selfie: string; scene1: string; scene2: string; scene3: string | null; scene4: string | null };
    try {
      photos = {
        selfie: await adoptTempFile(body.selfieUrl, destination),
        scene1: await adoptTempFile(body.scenePhotoUrl, destination),
        scene2: await adoptTempFile(body.scenePhotoUrl2, destination),
        scene3: await adoptOptionalTempFile(body.scenePhotoUrl3, destination),
        scene4: await adoptOptionalTempFile(body.scenePhotoUrl4, destination),
      };
    } catch (error) {
      if (error instanceof StorageError) {
        await removeStoredDirectory(destination).catch(() => {});
        return errorJson(`${error.message} Please retake the photos and try again.`, 400);
      }
      throw error;
    }

    // A frequently-scanned asset is a sign of probing: keep the report for security, release nothing.
    const recentScans = await prisma.assetScanRateLimit.count({
      where: { assetId: asset.id, scannedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    const flagged = recentScans >= MAX_SCANS_PER_HOUR;

    const ip = getClientIp(request) ?? "unknown";
    // Built on the server: the client only gets to say where it is, not who it is.
    const deviceFingerprint: Record<string, unknown> = { userAgent: userAgentOf(request) };
    if (accuracy !== null && (accuracy < 3 || accuracy > 1000)) {
      deviceFingerprint.high_risk_gps = true;
      deviceFingerprint.gps_accuracy = accuracy;
    }

    await prisma.$transaction(async (tx) => {
      await tx.incident.create({
        data: {
          id: incidentId!,
          assetId: asset.id,
          bystanderId: bystander.bystanderId,
          selfieUrl: photos.selfie,
          scenePhotoUrl: photos.scene1,
          scenePhotoUrl2: photos.scene2,
          scenePhotoUrl3: photos.scene3,
          scenePhotoUrl4: photos.scene4,
          latitude,
          longitude,
          ipAddress: ip,
          deviceFingerprint: JSON.stringify(deviceFingerprint),
          status: flagged ? "FLAGGED" : "NEW",
        },
      });
      if (!flagged) await tx.assetScanRateLimit.create({ data: { assetId: asset.id, ipAddress: ip } });
    });

    await writeAudit(
      request,
      asset.userId,
      flagged ? "INCIDENT_FLAGGED_RATE_LIMIT" : "BYSTANDER_PII_DISCLOSED",
      `Incident ID: ${incidentId}, Bystander ID: ${bystander.bystanderId}, GPS: ${latitude},${longitude}`
    );

    if (flagged) {
      return errorJson("Asset has been scanned too many times recently. Security has been notified.", 429);
    }

    return NextResponse.json({
      success: true,
      incidentId,
      releaseInSeconds: PII_RELEASE_DELAY_SECONDS,
      // Only the blood group and name are shown immediately; the rest waits out the review window (see ./[id]/full).
      memberInfo: { bloodGroup: decryptPIIOrNull(asset.user.bloodGroup), fullName: asset.user.fullName },
    });
  } catch (error) {
    console.error("Incident Report Error:", error);
    return errorJson("Failed to report incident", 500);
  }
}
