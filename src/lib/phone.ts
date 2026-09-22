/**
 * Normalises a phone number to E.164. A bare 10-digit number is assumed to be Indian (+91).
 * Returns the best-effort string; use parseE164 when you need to know the result is valid.
 */
export function normalizePhoneNumber(input: string): string {
  if (!input) return "";

  const hasLeadingPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");

  // An explicit "+" means the caller gave a country code, so never default to +91 in that case.
  if (hasLeadingPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  return digits.length > 0 ? `+${digits}` : input;
}

const E164 = /^\+[1-9]\d{7,14}$/;

/** Returns the E.164 form of `input`, or null if it is not a plausible phone number. */
export function parseE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = normalizePhoneNumber(input.trim());
  return E164.test(normalized) ? normalized : null;
}

/** "+919876543210" -> "+91******3210" (safe to show before the user has finished authenticating). */
export function maskPhone(e164: string): string {
  if (e164.length <= 7) return "*".repeat(e164.length);
  return `${e164.slice(0, 3)}${"*".repeat(e164.length - 7)}${e164.slice(-4)}`;
}
