import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { errorJson, unauthorized } from "@/lib/http";
import { decryptPIIOrNull } from "@/lib/encryption";

/** Actions raised by a bystander report (as opposed to account/security events). */
const INCIDENT_ACTION_PREFIXES = ["BYSTANDER_", "INCIDENT_"];

/**
 * Newest-first audit events. Bounded (default 1000, max 5000) so the table can grow without this
 * endpoint returning it all; optional `category` (security | incident), `action`, `from` and `to` (ISO dates)
 * narrow the window. Field-level before/after values (encrypted at rest) are decrypted here for admins only.
 */
export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) return unauthorized();

    const params = new URL(request.url).searchParams;
    const take = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "1000", 10) || 1000, 1), 5000);

    const where: Prisma.AuditLogWhereInput = {};
    const incidentMatch = INCIDENT_ACTION_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } }));
    const category = params.get("category");
    if (category === "incident") where.OR = incidentMatch;
    else if (category === "security") where.NOT = incidentMatch;
    const action = params.get("action");
    if (action) where.action = action.slice(0, 64);

    const from = params.get("from") ? new Date(params.get("from")!) : null;
    const to = params.get("to") ? new Date(params.get("to")!) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return errorJson("Invalid date filter", 400);
    }
    if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true, uii: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return NextResponse.json(
      logs.map(({ changesEnc, ...log }) => {
        let changes: unknown = null;
        try {
          const plain = decryptPIIOrNull(changesEnc);
          changes = plain ? JSON.parse(plain) : null;
        } catch {
          /* unreadable entry: show the row without a diff */
        }
        return { ...log, changes };
      })
    );
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return errorJson("Failed to fetch audit logs", 500);
  }
}
