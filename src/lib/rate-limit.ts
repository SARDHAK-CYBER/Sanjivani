import { Redis } from "@upstash/redis";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { prisma } from "@/lib/prisma";
import { maybeCleanup } from "@/lib/maintenance";

/**
 * Named limits. Where a key needs several dimensions (per IP *and* per account) call
 * rateLimit() once per dimension.
 *
 * Backends:
 *  - Upstash Redis (sliding window) when UPSTASH_REDIS_REST_URL/TOKEN are set.
 *  - Otherwise a fixed-window counter in Postgres, updated atomically, which is shared by every
 *    serverless instance (the in-memory Map this replaces was not).
 * If the backend itself fails we fail *closed*: for auth endpoints, "can't count" must not mean "unlimited".
 */
export const LIMITS = {
  loginIp: { limit: 20, window: "15 m", ms: 15 * 60_000 },
  loginAccount: { limit: 8, window: "15 m", ms: 15 * 60_000 },
  twoFactorIp: { limit: 20, window: "15 m", ms: 15 * 60_000 },
  twoFactorAccount: { limit: 8, window: "15 m", ms: 15 * 60_000 },
  registerIp: { limit: 10, window: "1 h", ms: 60 * 60_000 },
  bystanderVerifyIp: { limit: 20, window: "15 m", ms: 15 * 60_000 },
  bystanderVerifyPhone: { limit: 10, window: "15 m", ms: 15 * 60_000 },
  uploadIp: { limit: 40, window: "1 h", ms: 60 * 60_000 },
  captureTokenBystander: { limit: 10, window: "1 h", ms: 60 * 60_000 },
  incidentBystander: { limit: 5, window: "1 h", ms: 60 * 60_000 },
  resetRequestIp: { limit: 5, window: "1 h", ms: 60 * 60_000 },
  resetRequestEmail: { limit: 3, window: "1 h", ms: 60 * 60_000 },
  resetConfirmIp: { limit: 10, window: "1 h", ms: 60 * 60_000 },
  profileWrite: { limit: 30, window: "1 h", ms: 60 * 60_000 },
  // Authenticator-app codes are 6 digits, so guessing must be capped hard: at most 20 tries a day per account.
  totpAttemptShort: { limit: 5, window: "15 m", ms: 15 * 60_000 },
  totpAttemptDaily: { limit: 20, window: "1 d", ms: 24 * 60 * 60_000 },
  totpEnroll: { limit: 10, window: "1 h", ms: 60 * 60_000 },
  // Phone verification (every send costs money and can be abused for SMS pumping)
  otpSendIp: { limit: 10, window: "10 m", ms: 10 * 60_000 },
  otpSendPhone: { limit: 5, window: "1 h", ms: 60 * 60_000 },
  otpSendUser: { limit: 6, window: "1 h", ms: 60 * 60_000 },
  otpVerifyIp: { limit: 40, window: "15 m", ms: 15 * 60_000 },
  // Circuit breaker on total sends per day, whoever asks (bounds the worst-case bill). Tune with OTP_DAILY_LIMIT.
  otpGlobal: { limit: Number(process.env.OTP_DAILY_LIMIT ?? 2000), window: "1 d", ms: 24 * 60 * 60_000 },
} as const satisfies Record<string, { limit: number; window: Duration; ms: number }>;

export type LimitName = keyof typeof LIMITS;

const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = useRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const redisLimiters = new Map<LimitName, Ratelimit>();

function redisLimiter(name: LimitName): Ratelimit {
  let limiter = redisLimiters.get(name);
  if (!limiter) {
    const { limit, window } = LIMITS[name];
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `sanjivani:${name}`,
    });
    redisLimiters.set(name, limiter);
  }
  return limiter;
}

async function databaseCount(key: string, windowMs: number): Promise<number> {
  const windowSeconds = windowMs / 1000;
  // One atomic statement: start a new window if the old one lapsed, otherwise increment.
  //
  // Prisma stores DateTime as UTC in `timestamp(3)` (no time zone) columns. A bare NOW() would be
  // converted using the *session* time zone instead, so on any database not set to UTC the stored
  // value would disagree with what Prisma reads and writes (e.g. maybeCleanup deleting live rows).
  // `NOW() AT TIME ZONE 'UTC'` keeps this statement on the same convention regardless of settings.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetTime")
    VALUES (${key}, 1, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetTime" <= (NOW() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetTime" = CASE
        WHEN "RateLimit"."resetTime" <= (NOW() AT TIME ZONE 'UTC')
          THEN (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}::double precision)
        ELSE "RateLimit"."resetTime"
      END
    RETURNING "count"
  `;
  return Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);
}

/** Records one hit against `${name}:${key}` and reports whether the caller is still within the limit. */
export async function rateLimit(name: LimitName, key: string): Promise<{ success: boolean }> {
  try {
    if (redis) {
      const result = await redisLimiter(name).limit(key);
      return { success: result.success };
    }
    void maybeCleanup();
    const count = await databaseCount(`${name}:${key}`, LIMITS[name].ms);
    return { success: count <= LIMITS[name].limit };
  } catch (error) {
    console.error(`Rate limiter unavailable for ${name}; failing closed:`, (error as Error).message);
    return { success: false };
  }
}
