import crypto from "crypto";

/**
 * Time-based one-time passwords (RFC 6238 on top of RFC 4226), compatible with Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password, Aegis and every other standard authenticator app.
 * Defaults are what those apps assume: HMAC-SHA1, 6 digits, 30 second steps.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of "now" to tolerate a slightly wrong phone clock (±30 s). */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes base32, tolerating case, spaces, hyphens and "=" padding (how people copy secrets). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret (the size RFC 4226 recommends) as base32. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** RFC 4226 HOTP. `counter` is the moving factor. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm, secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f; // dynamic truncation
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const timeStep = (nowMs: number, period = TOTP_PERIOD_SECONDS) => Math.floor(nowMs / 1000 / period);

/** The code an authenticator app shows for `secretBase32` at `nowMs`. */
export function totpAt(secretBase32: string, nowMs = Date.now(), digits = TOTP_DIGITS, period = TOTP_PERIOD_SECONDS): string {
  return hotp(base32Decode(secretBase32), timeStep(nowMs, period), digits);
}

const safeEqual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a user-entered code. Returns the matching time step, or null.
 *
 * `afterStep` is the last step already accepted for this user: only a STRICTLY LATER step is valid, so a
 * code that was just used (or observed over someone's shoulder) cannot be used again within its window.
 * Every candidate step is compared, in constant time, whether or not an earlier one matched.
 */
export function verifyTotp(
  secretBase32: string,
  code: unknown,
  opts: { nowMs?: number; window?: number; afterStep?: number | null; digits?: number; period?: number } = {}
): number | null {
  const digits = opts.digits ?? TOTP_DIGITS;
  const candidate = typeof code === "string" ? code.replace(/\s+/g, "") : "";
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return null;

  const secret = base32Decode(secretBase32);
  const current = timeStep(opts.nowMs ?? Date.now(), opts.period ?? TOTP_PERIOD_SECONDS);
  const window = opts.window ?? TOTP_WINDOW;

  let matched: number | null = null;
  for (let step = current - window; step <= current + window; step++) {
    if (safeEqual(hotp(secret, step, digits), candidate)) matched = step;
  }
  if (matched === null) return null;
  if (opts.afterStep !== null && opts.afterStep !== undefined && matched <= opts.afterStep) return null;
  return matched;
}

/** The URI encoded in the enrolment QR code (Google Authenticator "Key URI" format). */
export function otpauthUri(opts: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const query = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** "ABCDEFGH..." -> "ABCD EFGH ..." for showing a manual-entry key. */
export const formatSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();
