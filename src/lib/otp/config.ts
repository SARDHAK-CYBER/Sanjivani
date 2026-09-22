import { blindIndex } from "@/lib/encryption";

export type OtpChannel = "whatsapp" | "sms";
export type OtpPurpose = "login" | "register" | "bystander" | "change-phone";
export const OTP_PURPOSES: readonly OtpPurpose[] = ["login", "register", "bystander", "change-phone"];

/** Thrown when the OTP provider is not (correctly) configured. Callers turn it into a 503. */
export class OtpConfigError extends Error {}

export type Msg91Config = {
  authKey: string;
  /** DLT-approved SMS template registered as a Flow/template in the MSG91 dashboard. */
  smsTemplateId?: string;
  /** Name of the template variable that carries the code (##OTP## in the template body). */
  smsVariable: string;
  smsUrl: string;
  whatsappUrl: string;
  whatsappNumber?: string;
  whatsappTemplate?: string;
  whatsappNamespace?: string;
  whatsappLanguage: string;
  /** Authentication templates carry a copy-code button that takes the code as its value. */
  whatsappButton: boolean;
};

export function msg91Config(): Msg91Config {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  if (!authKey) throw new OtpConfigError("MSG91_AUTH_KEY is not set.");
  const env = (name: string) => process.env[name]?.trim() || undefined;
  return {
    authKey,
    smsTemplateId: env("MSG91_SMS_TEMPLATE_ID"),
    smsVariable: env("MSG91_SMS_OTP_VARIABLE") ?? "OTP",
    // Endpoints default to MSG91's production API; overridable only for a staging/regional endpoint.
    smsUrl: env("MSG91_FLOW_URL") ?? "https://control.msg91.com/api/v5/flow",
    whatsappUrl: env("MSG91_WHATSAPP_URL") ?? "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    whatsappNumber: env("MSG91_WHATSAPP_INTEGRATED_NUMBER"),
    whatsappTemplate: env("MSG91_WHATSAPP_TEMPLATE_NAME"),
    whatsappNamespace: env("MSG91_WHATSAPP_NAMESPACE"),
    whatsappLanguage: env("MSG91_WHATSAPP_LANGUAGE") ?? "en",
    whatsappButton: (env("MSG91_WHATSAPP_BUTTON") ?? "true") !== "false",
  };
}

/** Channels that are actually configured for the active provider. */
export function availableChannels(): OtpChannel[] {
  const cfg = msg91Config();
  const channels: OtpChannel[] = [];
  if (cfg.whatsappNumber && cfg.whatsappTemplate && cfg.whatsappNamespace) channels.push("whatsapp");
  if (cfg.smsTemplateId) channels.push("sms");
  return channels;
}

/**
 * The channel to use: what the user asked for if it is configured, else the configured default,
 * else whatever is available. Throws OtpConfigError if nothing is configured.
 */
export function resolveChannel(requested?: unknown): OtpChannel {
  const available = availableChannels();
  if (available.length === 0) throw new OtpConfigError("No OTP channel is configured (set MSG91_SMS_TEMPLATE_ID and/or the WhatsApp variables).");
  if (requested === "whatsapp" || requested === "sms") {
    if (available.includes(requested)) return requested;
  }
  const preferred = process.env.OTP_DEFAULT_CHANNEL === "sms" ? "sms" : "whatsapp";
  return available.includes(preferred) ? preferred : available[0];
}

/** Country-code prefixes we are willing to send to. Defaults to India only (also stops international SMS-pumping). */
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
