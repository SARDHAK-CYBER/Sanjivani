import { msg91Config, type OtpChannel } from "@/lib/otp/config";

/** A code could not be handed to the delivery provider. The message is for logs, never for users. */
export class OtpSendError extends Error {}

const TIMEOUT_MS = 8000;

/** MSG91 wants the number as digits with the country code and no "+". */
export const msg91Number = (e164: string) => e164.replace(/\D/g, "");

type HttpResult = { ok: boolean; status: number; body: unknown };

async function postJson(url: string, headers: Record<string, string>, payload: unknown): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(payload),
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
    throw new OtpSendError(controller.signal.aborted ? "MSG91 request timed out" : `MSG91 request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * MSG91 reports some failures inside an HTTP 200 (`{"type":"error", ...}`), so the status alone is not enough.
 * Sending is deliberately lenient about what counts as success: the code is verified by *us*, so a send
 * that looked like a failure but was delivered costs nothing, while wrongly rejecting a good send would
 * stop every login.
 */
function accepted(result: HttpResult): boolean {
  if (!result.ok) return false;
  const body = result.body as Record<string, unknown> | null;
  if (body && typeof body === "object") {
    if (body.type === "error" || body.hasError === true) return false;
    if (typeof body.status === "string" && ["fail", "failed", "error"].includes(body.status.toLowerCase())) return false;
  }
  return true;
}

function describe(result: HttpResult): string {
  const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
  return `HTTP ${result.status}: ${body.slice(0, 200)}`;
}

async function sendSms(phone: string, code: string) {
  const cfg = msg91Config();
  if (!cfg.smsTemplateId) throw new OtpSendError("MSG91_SMS_TEMPLATE_ID is not set");
  const result = await postJson(
    cfg.smsUrl,
    { authkey: cfg.authKey },
    {
      template_id: cfg.smsTemplateId,
      short_url: "0",
      recipients: [{ mobiles: msg91Number(phone), [cfg.smsVariable]: code }],
    }
  );
  if (!accepted(result)) throw new OtpSendError(`MSG91 SMS rejected (${describe(result)})`);
}

async function sendWhatsapp(phone: string, code: string) {
  const cfg = msg91Config();
  if (!cfg.whatsappNumber || !cfg.whatsappTemplate || !cfg.whatsappNamespace) {
    throw new OtpSendError("MSG91 WhatsApp variables are not set");
  }
  const components: Record<string, unknown> = { body_1: { type: "text", value: code } };
  if (cfg.whatsappButton) components.button_1 = { subtype: "url", type: "text", value: code };

  const result = await postJson(
    cfg.whatsappUrl,
    { authkey: cfg.authKey },
    {
      integrated_number: cfg.whatsappNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: cfg.whatsappTemplate,
          language: { code: cfg.whatsappLanguage, policy: "deterministic" },
          namespace: cfg.whatsappNamespace,
          to_and_components: [{ to: [msg91Number(phone)], components }],
        },
      },
    }
  );
  if (!accepted(result)) throw new OtpSendError(`MSG91 WhatsApp rejected (${describe(result)})`);
}

/** Hands one code to the delivery provider over one channel. Throws OtpSendError on failure. */
export async function deliverCode(channel: OtpChannel, phone: string, code: string): Promise<void> {
  if (channel === "whatsapp") return sendWhatsapp(phone, code);
  return sendSms(phone, code);
}
