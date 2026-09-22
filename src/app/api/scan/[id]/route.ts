import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; // qrReferenceId
    if (id.length > 64) return errorJson("Invalid QR Code", 404);

    const asset = await prisma.asset.findUnique({
      where: { qrReferenceId: id },
      select: { assetType: true, user: { select: { fullName: true } } },
    });
    if (!asset) return errorJson("Invalid QR Code", 404);

    // Only non-sensitive facts are shown before the bystander has verified their phone.
    const fullName = asset.user?.fullName;
    return NextResponse.json({
      assetType: asset.assetType,
      memberInitials: fullName
        ? fullName.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase()
        : "UN",
    });
  } catch (error) {
    console.error("Scan API Error:", error);
    return errorJson("Internal Server Error", 500);
  }
}
