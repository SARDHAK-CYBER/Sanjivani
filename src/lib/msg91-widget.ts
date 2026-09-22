/**
 * Server-side half of the MSG91 OTP Widget integration.
 *
 * The browser (src/components/Msg91WidgetOtp.tsx) loads MSG91's own widget script, which sends and
 * checks the code itself and hands back a JWT "access-token" it calls the proof of verification. This
 * module is what turns that browser-side claim into something our server actually trusts: it calls
 * MSG91's verifyAccessToken endpoint with our (server-only) authkey and only proceeds if MSG91 itself
 * confirms the token.
 *
 * KNOWN LIMITATION (flagged, not hidden): MSG91's documented response for this endpoint is
 * "either a success or failure token" with no published field names, and the token's own JWT payload
 * carries only `requestId`/`companyId` -- no phone number. So even on a genuine success we cannot
 * independently confirm WHICH number MSG91 verified; we fall back to trusting the phone number the
 * client sent alongside the token. That is weaker than the original design (which never trusted the
 * client for the verified value) and needs revisiting once MSG91 clarifies the real response shape.
 * See the (still open, as of this integration) verifyAccessToken support thread.
 */

// Read lazily, not at module load: this module can be imported before tests or a serverless cold
// start have finished setting up the environment.
const verifyUrl = () => process.env.MSG91_WIDGET_VERIFY_URL || "https://control.msg91.com/api/v5/widget/verifyAccessToken";

export class Msg91WidgetError extends Error {
  constructor(
    public readonly reason: "unconfigured" | "rejected" | "network",
    message: string
  ) {
    super(message);
    this.name = "Msg91WidgetError";
  }
}

type VerifyResult = { ok: true; raw: unknown } | { ok: false; raw: unknown };

/** A handful of plausible field names for a verified phone number, checked defensively. */
function extractPhone(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidates = [obj.mobile, obj.phone, obj.identifier, obj.number];
  const nested = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : null;
  if (nested) candidates.push(nested.mobile, nested.phone, nested.identifier);
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function callVerifyAccessToken(accessToken: string): Promise<VerifyResult> {
  const authkey = process.env.MSG91_AUTH_KEY?.trim();
  if (!authkey) throw new Msg91WidgetError("unconfigured", "MSG91_AUTH_KEY is not set.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(verifyUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ authkey, "access-token": accessToken }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Msg91WidgetError("network", `verifyAccessToken request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let raw: unknown = text;
  try {
    raw = JSON.parse(text);
  } catch {
    /* not JSON */
  }

  // MSG91 has been observed returning HTTP 200 with an error body ({"type":"error", "code":"418", ...})
  // as well as non-200 statuses -- neither the status code nor a single field is reliable on its own,
  // so a request only counts as a pass if the transport succeeded AND the body doesn't look like an error.
  const body = raw as Record<string, unknown> | null;
  const looksLikeError = !res.ok || (body && typeof body === "object" && (body.type === "error" || "code" in body));
  return looksLikeError ? { ok: false, raw } : { ok: true, raw };
}

/**
 * Verifies a widget access-token with MSG91 and returns the phone number to trust for it.
 *
 * `claimedPhone` is what the browser says it sent the code to (it has to know this already, since it's
 * what it passed to the widget's sendOtp()). We require it and use it as the verified value, since
 * MSG91's response does not reliably hand back its own copy to cross-check against -- see the module
 * docstring. If MSG91's response ever does include a phone/mobile/identifier field, we prefer that value
 * instead of the client's, which is at least a partial safeguard.
 */
export async function verifyWidgetAccessToken(accessToken: unknown, claimedPhone: string): Promise<{ phone: string }> {
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4000) {
    console.error(
      "MSG91 access token failed the shape check:",
      typeof accessToken === "string" ? `length ${accessToken.length}` : typeof accessToken
    );
    throw new Msg91WidgetError("rejected", "Missing or malformed access token.");
  }

  const result = await callVerifyAccessToken(accessToken);
  if (!result.ok) {
    console.error("MSG91 verifyAccessToken rejected the token:", JSON.stringify(result.raw).slice(0, 300));
    throw new Msg91WidgetError("rejected", "Phone verification could not be confirmed.");
  }

  const confirmedPhone = extractPhone(result.raw);
  if (confirmedPhone && confirmedPhone.replace(/\D/g, "") !== claimedPhone.replace(/\D/g, "")) {
    // MSG91's own response disagrees with what the client claimed -- always distrust the client here.
    console.error(
      "MSG91 verifyAccessToken succeeded but the phone did not match:",
      JSON.stringify({ confirmedPhone, claimedPhone, raw: result.raw }).slice(0, 300)
    );
    throw new Msg91WidgetError("rejected", "Verified phone does not match the number submitted.");
  }
  return { phone: confirmedPhone ?? claimedPhone };
}
