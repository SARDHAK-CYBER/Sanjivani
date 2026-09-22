import crypto from "crypto";

const KEY_LENGTH = 64;
// Verified against when the account does not exist, so "unknown email" and "wrong
// password" take the same time and cannot be told apart by latency.
const DUMMY_HASH = `${"00".repeat(16)}:${"00".repeat(KEY_LENGTH)}`;

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

/** Hashes a password with native scrypt. Stored as `salt:hash` (hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Constant-time password check. Pass `null` when there is no stored hash (unknown user,
 * or an account that has no password) to burn the same amount of time and return false.
 */
export async function comparePassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const [salt, key] = (hash || DUMMY_HASH).split(":");
  if (!salt || !key) return false;

  const derivedKey = await scrypt(password, salt);
  const expected = Buffer.from(key, "hex");
  if (!hash || expected.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(expected, derivedKey);
}

/** SHA-256 hex digest, for storing high-entropy random tokens (reset links, ID-token replay guard). */
export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
