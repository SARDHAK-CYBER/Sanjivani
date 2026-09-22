import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { errorJson, unauthorized } from "@/lib/http";
import { writeAudit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorized();

    const { id } = await params;
    const result = await prisma.incident.updateMany({ where: { id }, data: { status: "BLOCKED" } });
    if (result.count === 0) return errorJson("Incident not found", 404);

    await writeAudit(request, admin.id, "INCIDENT_PII_BLOCKED", `Incident ID: ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to block incident:", error);
    return errorJson("Failed to block incident", 500);
  }
}
