import crypto from "crypto";
import { getEncryptionKey } from "@/lib/secrets";

const ALGORITHM = "aes-256-gcm";

/** Encrypts a value with AES-256-GCM. Output: `v1:<iv>:<authTag>:<ciphertext>` (hex). */
export function encryptPII(text: string | null | undefined): string | null {
  if (!text) return null;

  // GCM optimally uses a 96-bit (12-byte) IV, fresh for every call.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Decrypts a value produced by encryptPII. Throws on tampering, a wrong key or a non-v1 format. */
export function decryptPII(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;

  try {
    const parts = encryptedText.split(":");
    if (parts[0] !== "v1" || parts.length !== 4) {
      throw new Error("Invalid cipher format. Expected v1 format.");
    }
    const [, ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) throw new Error("Missing crypto components");

    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error (tampering, legacy format, or key mismatch):", (error as Error).message);
    throw new Error("Decryption failed: data may be tampered with or unencrypted.");
  }
}

/** Like decryptPII, but yields null instead of throwing, so one bad row cannot fail a whole list. */
export function decryptPIIOrNull(encryptedText: string | null | undefined): string | null {
  try {
    return decryptPII(encryptedText);
  } catch {
    return null;
  }
}

/**
 * Deterministic keyed hash (HMAC-SHA256) of a value, used as a "blind index": AES-GCM output is
 * randomised so encrypted columns cannot be searched or made unique, but this can.
 * The HMAC key is derived from ENCRYPTION_KEY, domain-separated from the encryption use.
 */
export function blindIndex(value: string): string {
  return crypto.createHmac("sha256", derivedKey("sanjivani:blind-index:v1")).update(value).digest("hex");
}

/** A purpose-specific 32-byte key derived from ENCRYPTION_KEY, so one secret can serve several uses safely. */
export function derivedKey(label: string): Buffer {
  return crypto.createHmac("sha256", getEncryptionKey()).update(label).digest();
}
