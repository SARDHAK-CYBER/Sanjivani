import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/ip";
import { userAgentOf } from "@/lib/http";
import { encryptPII } from "@/lib/encryption";

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

/**
 * Appends an audit-log row. `detail` replaces the User-Agent in the fingerprint column for
 * events where context matters more than the browser (e.g. which admin viewed a profile).
 * `changes` records field-level before/after values; it is stored encrypted because it mirrors PII columns.
 * Never throws: a failed audit write must not break the action being audited.
 */
export async function writeAudit(request: Request, userId: string, action: string, detail?: string, changes?: AuditChanges) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        deviceFingerprint: (detail ?? userAgentOf(request)).slice(0, 500),
        geoId: getClientIp(request) ?? "Unknown",
        ...(changes && Object.keys(changes).length > 0 && { changesEnc: encryptPII(JSON.stringify(changes)) }),
      },
    });
  } catch (error) {
    console.error(`Audit write failed for ${action}:`, (error as Error).message);
  }
}
