// Import this FIRST in every test file: it configures the environment before any app module reads it.
import fs from "fs";
import os from "os";
import path from "path";

const env = process.env as Record<string, string | undefined>;

env.JWT_SECRET = "j".repeat(40);
env.BYSTANDER_JWT_SECRET = "b".repeat(40);
env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
// Never connected to: constructing the Prisma client is lazy.
env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sanjivani-test-"));
