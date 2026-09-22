import { prisma } from "@/lib/prisma";

const CLEANUP_PROBABILITY = 0.02;

/**
 * Cheap housekeeping for short-lived rows (rate-limit counters, capture tokens, finished
 * phone-verification challenges). Runs on ~2% of calls instead of needing a cron job; failures are ignored.
 */
export async function maybeCleanup(): Promise<void> {
  if (Math.random() > CLEANUP_PROBABILITY) return;
  const now = new Date();
  try {
    await Promise.all([
      prisma.rateLimit.deleteMany({ where: { resetTime: { lt: now } } }),
      prisma.captureToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      // a verified challenge's proof token lives 10 minutes past verification, so keep rows a little longer
      prisma.phoneOtp.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 30 * 60_000) } } }),
    ]);
  } catch (error) {
    console.warn("Cleanup skipped:", (error as Error).message);
  }
}
