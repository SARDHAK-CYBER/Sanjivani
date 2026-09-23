import { fast2smsConfig } from "@/lib/otp/config";

/** A code could not be handed to the delivery provider. The message is for logs, never for users. */
export class OtpSendError extends Error {}

const TIMEOUT_MS = 8000;

/** Fast2SMS wants a bare 10-digit Indian mobile number, no country code. */
export const fast2smsNumber = (e164: string) => e164.replace(/\D/g, "").slice(-10);

type HttpResult = { ok: boolean; status: number; body: unknown };

async function postForm(url: string, headers: Record<string, string>, params: Record<string, string>): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...headers },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    throw new OtpSendError(controller.signal.aborted ? "Fast2SMS request timed out" : `Fast2SMS request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function describe(result: HttpResult): string {
  const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
  return `HTTP ${result.status}: ${body.slice(0, 200)}`;
}

/** Sends the code as a plain SMS via Fast2SMS's Quick SMS route (route=q; no DLT template needed). */
export async function deliverCode(phone: string, code: string): Promise<void> {
  const cfg = fast2smsConfig();
  const number = fast2smsNumber(phone);
  const message = `Your Sanjivani verification code is ${code}. Do not share this with anyone. It expires in 5 minutes.`;

  const result = await postForm(cfg.url, { authorization: cfg.apiKey }, { route: "q", message, numbers: number });

  // Fast2SMS returns HTTP 200 with {"return": true, ...} on success, or a non-2xx / {"return": false, ...}
  // (and sometimes just {"status_code": N, "message": "..."}) on failure -- never a bare "queued" ambiguity
  // like some providers, but still checked defensively rather than trusting the status code alone.
  const body = result.body as Record<string, unknown> | null;
  const succeeded = result.ok && body && typeof body === "object" && body.return === true;
  if (!succeeded) throw new OtpSendError(`Fast2SMS rejected the send (${describe(result)})`);
}
