/**
 * Cloudflare Turnstile (free CAPTCHA alternative) for the public "send a code" step, the only place an
 * anonymous visitor can make us pay for an SMS/WhatsApp message. Enabled by setting TURNSTILE_SECRET_KEY
 * (and NEXT_PUBLIC_TURNSTILE_SITE_KEY for the browser widget); without them there is no bot check.
 */
export const captchaEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

// Overridable only so tests can point at a local stand-in.
const VERIFY_URL = () => process.env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True if the token is valid (or CAPTCHA is not configured). Any error counts as a failure. */
export async function verifyCaptcha(token: unknown, ip: string | null): Promise<boolean> {
  if (!captchaEnabled()) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
  if (ip) form.set("remoteip", ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(VERIFY_URL(), { method: "POST", body: form, signal: controller.signal });
    const data = (await res.json()) as { success?: boolean };
    return res.ok && data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
