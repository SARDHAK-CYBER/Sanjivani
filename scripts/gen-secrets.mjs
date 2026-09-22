// Prints fresh values for the app's secrets. It only prints: paste them into .env (or your host's
// environment settings) yourself. The old gen_env.js overwrote the entire .env file.
import crypto from "node:crypto";

console.log(`JWT_SECRET="${crypto.randomBytes(32).toString("hex")}"`);
console.log(`BYSTANDER_JWT_SECRET="${crypto.randomBytes(32).toString("hex")}"`);
console.log(`ENCRYPTION_KEY="${crypto.randomBytes(32).toString("base64")}"`);
console.log("\n# Keep ENCRYPTION_KEY safe and backed up: without it, every encrypted field is unrecoverable.");
