import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { errorJson, unauthorized } from "@/lib/http";

export async function GET() {
  try {
    if (!(await requireAdmin())) return unauthorized();

    const [members, assets, incidents, newIncidents] = await Promise.all([
      prisma.user.count({ where: { role: { in: ["STUDENT", "STAFF", "SECURITY"] } } }),
      prisma.asset.count(),
      prisma.incident.count(),
      prisma.incident.count({ where: { status: "NEW" } }),
    ]);
    return NextResponse.json({ members, assets, incidents, newIncidents });
  } catch (error) {
    console.error("Failed to load stats:", error);
    return errorJson("Failed to load stats", 500);
  }
}
