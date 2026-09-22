/**
 * What's left of the old code-generation OTP module after switching phone verification over to the
 * MSG91 widget (see src/lib/msg91-widget.ts): just the shared "purpose" vocabulary and the country
 * allowlist, both still used by the widget-based verify route and by phone-verification.ts.
 */

export type OtpPurpose = "login" | "register" | "bystander" | "change-phone";
export const OTP_PURPOSES: readonly OtpPurpose[] = ["login", "register", "bystander", "change-phone"];

/** Country-code prefixes we accept. Defaults to India only. */
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
