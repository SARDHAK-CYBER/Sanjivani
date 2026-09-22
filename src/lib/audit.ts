import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/ip";
import { userAgentOf } from "@/lib/http";

/**
 * Appends an audit-log row. `detail` replaces the User-Agent in the fingerprint column for
 * events where context matters more than the browser (e.g. which admin viewed a profile).
 * Never throws: a failed audit write must not break the action being audited.
 */
export async function writeAudit(request: Request, userId: string, action: string, detail?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        deviceFingerprint: (detail ?? userAgentOf(request)).slice(0, 500),
        geoId: getClientIp(request) ?? "Unknown",
      },
    });
  } catch (error) {
    console.error(`Audit write failed for ${action}:`, (error as Error).message);
  }
}
