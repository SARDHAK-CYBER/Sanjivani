import { prisma } from "@/lib/prisma";

/**
 * Administrators confirm a texted code only after their password has been changed (reset by email), not on
 * every sign-in -- each SMS costs money and the authenticator app already covers routine logins.
 *
 * Derived from the audit trail so it needs no extra column: a PASSWORD_RESET_COMPLETED that is newer than the
 * admin's last ADMIN_PHONE_CONFIRMED means the phone has not yet vouched for the new password.
 */
export async function adminNeedsPhoneCheck(userId: string): Promise<boolean> {
  const latest = (action: string) =>
    prisma.auditLog.findFirst({ where: { userId, action }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const [reset, confirmed] = await Promise.all([latest("PASSWORD_RESET_COMPLETED"), latest("ADMIN_PHONE_CONFIRMED")]);
  return Boolean(reset) && (!confirmed || confirmed.createdAt < reset!.createdAt);
}
