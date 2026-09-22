import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { errorJson, unauthorized } from "@/lib/http";
import { serializeProfile } from "@/lib/profile";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorized();

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        assets: true,
        auditLogs: { orderBy: { createdAt: "desc" }, take: 500 },
      },
    });
    if (!user) return errorJson("User not found", 404);

    // Recorded against the *viewed* member so they (and other admins) can see who looked.
    await writeAudit(request, user.id, "ADMIN_VIEWED_PROFILE", `Admin ID: ${admin.id}`);

    // serializeProfile whitelists fields: passwordHash, resetToken and tokenVersion never leave the server.
    const { assets, auditLogs } = user;
    return NextResponse.json({ ...serializeProfile(user), assets, auditLogs });
  } catch (error) {
    console.error("Failed to fetch member details:", error);
    return errorJson("Internal Server Error", 500);
  }
}
