import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error(
      "DATABASE_URL must be a postgres:// or postgresql:// connection string (e.g. a Neon pooled URL)."
    );
  }
  // Keep the per-instance pool small: every serverless instance opens its own.
  const max = Number(process.env.DB_POOL_MAX ?? 5);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

function getClient(): PrismaClient {
  // Cached on globalThis in every environment: Next can load this module more than once (separate
  // route bundles, hot reload), and each PrismaClient owns a connection pool.
  return (globalForPrisma.prisma ??= createClient());
}

/**
 * The shared client. Created on first use rather than at import, so `next build` and tooling that
 * merely load route modules work without a database configured; a bad DATABASE_URL still fails
 * loudly, on the first query.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
