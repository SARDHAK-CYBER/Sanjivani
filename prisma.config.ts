import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// `prisma generate` only reads the schema; it never connects. Let it run without a database URL
// (fresh clone, CI, `npm install`'s postinstall) but keep every command that talks to the
// database (migrate, db push, studio, ...) strict: a missing DATABASE_URL must be a clear error.
const generating = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: generating
      ? (process.env.DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused")
      : env("DATABASE_URL"),
  },
});
