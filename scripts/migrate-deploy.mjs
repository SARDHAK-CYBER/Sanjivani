/**
 * Applies pending Prisma migrations during the Vercel build.
 *
 * Migrations take a database-wide advisory lock, which does not survive a pooled (PgBouncer) connection, and a
 * scale-to-zero Neon database can take several seconds to wake. Both show up as P1002 ("reached but timed out").
 * So: use the direct (non-pooled) host when one can be derived, and retry a few times before failing the build.
 */
import { spawnSync } from "node:child_process";

const url = process.env.MIGRATE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set; cannot apply migrations.");
  process.exit(1);
}

// Neon's pooled hostnames carry "-pooler" (ep-xxx-pooler.region.aws.neon.tech); the direct host is the same without it.
const direct = url.replace(/(@ep-[a-z0-9-]+?)-pooler\./, "$1.");
const env = { ...process.env, DATABASE_URL: direct.includes("connect_timeout") ? direct : `${direct}${direct.includes("?") ? "&" : "?"}connect_timeout=30` };

const ATTEMPTS = 4;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status === 0) process.exit(0);
  if (attempt < ATTEMPTS) {
    console.error(`prisma migrate deploy failed (attempt ${attempt}/${ATTEMPTS}); retrying in ${attempt * 5}s...`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
}
console.error("Could not apply migrations after several attempts.");
process.exit(1);
