import { blindIndex } from "@/lib/encryption";

export type OtpPurpose = "login" | "register" | "bystander" | "change-phone";
export const OTP_PURPOSES: readonly OtpPurpose[] = ["login", "register", "bystander", "change-phone"];

/** Thrown when the OTP provider is not (correctly) configured. Callers turn it into a 503. */
export class OtpConfigError extends Error {}

export type Fast2SmsConfig = {
  apiKey: string;
  url: string;
};

/**
 * Fast2SMS's "Quick SMS" route (route=q): a free-form message, no DLT-registered template required.
 * Chosen specifically because MSG91's equivalent products (Flow SMS, the classic SendOTP API) both
 * require a DLT-registered Sender ID/template for India, which this project's account does not have.
 */
export function fast2smsConfig(): Fast2SmsConfig {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  if (!apiKey) throw new OtpConfigError("FAST2SMS_API_KEY is not set.");
  return {
    apiKey,
    url: process.env.FAST2SMS_URL?.trim() || "https://www.fast2sms.com/dev/bulkV2",
  };
}

/** Country-code prefixes we are willing to send to. Defaults to India only (Fast2SMS's Quick SMS route is India-only anyway). */
export function allowedCountryPrefixes(): string[] {
  return (process.env.OTP_ALLOWED_COUNTRY_CODES ?? "+91")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("+") ? p : `+${p}`));
}

export function isAllowedNumber(e164: string): boolean {
  return allowedCountryPrefixes().some((prefix) => e164.startsWith(prefix));
}

/** Rate-limit key for a phone number that does not put the number itself in the limiter table. */
export const phoneLimitKey = (e164: string) => blindIndex(e164);
