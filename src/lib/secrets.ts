// Secrets are read lazily and memoised so that importing one (e.g. the JWT secret in
// proxy.ts) never requires the others to be configured.

function requireSecret(name: string, value: string | undefined, minLength = 32): string {
  const secret = value?.trim();
  if (!secret || secret.length < minLength) {
    throw new Error(`CRITICAL: Invalid or missing ${name}. Must be at least ${minLength} characters long.`);
  }
  return secret;
}

let jwtSecret: string | undefined;
let bystanderSecret: string | undefined;
let encryptionKey: Buffer | undefined;

/** Signs member/admin sessions and pending-2FA tokens. */
export function getJwtSecret(): string {
  return (jwtSecret ??= requireSecret("JWT_SECRET", process.env.JWT_SECRET));
}

/**
 * Signs bystander tokens. Deliberately a different key from JWT_SECRET so a bystander
 * can never be mistaken for a member. OTP_SECRET is accepted as the legacy name.
 */
export function getBystanderSecret(): string {
  if (bystanderSecret) return bystanderSecret;
  const secret = requireSecret(
    "BYSTANDER_JWT_SECRET (or OTP_SECRET)",
    process.env.BYSTANDER_JWT_SECRET || process.env.OTP_SECRET
  );
  if (secret === getJwtSecret()) {
    throw new Error("CRITICAL: BYSTANDER_JWT_SECRET/OTP_SECRET must differ from JWT_SECRET.");
  }
  return (bystanderSecret = secret);
}

/** 32-byte AES-256 key, supplied base64-encoded. */
export function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;
  const secret = process.env.ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("CRITICAL: Missing ENCRYPTION_KEY. Must be a base64-encoded 32-byte key.");
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error(`CRITICAL: ENCRYPTION_KEY must be exactly 32 bytes after base64 decoding. Got ${key.length} bytes.`);
  }
  return (encryptionKey = key);
}
