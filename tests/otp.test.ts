import "./setup";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { generateCode, hashCode, OTP_LENGTH } from "../src/lib/otp/service";
import {
  OtpConfigError,
  allowedCountryPrefixes,
  availableChannels,
  isAllowedNumber,
  resolveChannel,
} from "../src/lib/otp/config";
import { OtpSendError, deliverCode, msg91Number } from "../src/lib/otp/transport";
import { signPhoneProofToken, verifyPhoneProofToken, verifySessionToken, signSessionToken } from "../src/lib/tokens";
import { captchaEnabled, verifyCaptcha } from "../src/lib/turnstile";

const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = [
  "OTP_DEFAULT_CHANNEL", "OTP_ALLOWED_COUNTRY_CODES",
  "MSG91_AUTH_KEY", "MSG91_SMS_TEMPLATE_ID", "MSG91_SMS_OTP_VARIABLE", "MSG91_FLOW_URL", "MSG91_WHATSAPP_URL",
  "MSG91_WHATSAPP_INTEGRATED_NUMBER", "MSG91_WHATSAPP_TEMPLATE_NAME", "MSG91_WHATSAPP_NAMESPACE",
  "MSG91_WHATSAPP_LANGUAGE", "MSG91_WHATSAPP_BUTTON", "TURNSTILE_SECRET_KEY", "TURNSTILE_VERIFY_URL",
];
const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = env[k];
    delete env[k];
  }
  env.MSG91_AUTH_KEY = "test-authkey";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
});

const configureSms = () => (env.MSG91_SMS_TEMPLATE_ID = "tmpl-sms");
const configureWhatsapp = () => {
  env.MSG91_WHATSAPP_INTEGRATED_NUMBER = "919000000000";
  env.MSG91_WHATSAPP_TEMPLATE_NAME = "otp_auth";
  env.MSG91_WHATSAPP_NAMESPACE = "ns-123";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request bodies are inspected loosely in assertions
type Call = { url: string; init: RequestInit; body: any };
function mockFetch(respond: (call: Call) => { status?: number; body: unknown } | Promise<never>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(url), init, body: typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body };
    calls.push(call);
    const r = await respond(call);
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

describe("code generation and hashing", () => {
  it("makes 6-digit numeric codes, keeping leading zeros", () => {
    let sawLeadingZero = false;
    for (let i = 0; i < 3000; i++) {
      const c = generateCode();
      assert.match(c, new RegExp(`^\\d{${OTP_LENGTH}}$`));
      if (c.startsWith("0")) sawLeadingZero = true;
    }
    assert.ok(sawLeadingZero, "codes below 100000 must be zero-padded, not shortened");
  });

  it("does not repeat (basic randomness)", () => {
    assert.ok(new Set(Array.from({ length: 200 }, generateCode)).size > 150);
  });

  it("hashes are keyed, deterministic, and bound to the challenge id", () => {
    assert.equal(hashCode("c1", "123456"), hashCode("c1", "123456"));
    assert.notEqual(hashCode("c1", "123456"), hashCode("c2", "123456"));
    assert.notEqual(hashCode("c1", "123456"), hashCode("c1", "123457"));
    assert.match(hashCode("c1", "123456"), /^[0-9a-f]{64}$/);
  });
});

describe("configuration and channels", () => {
  it("defaults to India only", () => {
    assert.deepEqual(allowedCountryPrefixes(), ["+91"]);
    assert.ok(isAllowedNumber("+919876543210"));
    assert.ok(!isAllowedNumber("+14155550132"));
    assert.ok(!isAllowedNumber("+447911123456"));
  });

  it("honours OTP_ALLOWED_COUNTRY_CODES", () => {
    env.OTP_ALLOWED_COUNTRY_CODES = "+91, 44";
    assert.deepEqual(allowedCountryPrefixes(), ["+91", "+44"]);
    assert.ok(isAllowedNumber("+447911123456"));
  });

  it("only offers channels that are configured", () => {
    assert.deepEqual(availableChannels(), []);
    configureSms();
    assert.deepEqual(availableChannels(), ["sms"]);
    configureWhatsapp();
    assert.deepEqual(availableChannels(), ["whatsapp", "sms"]);
  });

  it("resolves a request to the best available channel", () => {
    configureSms();
    assert.equal(resolveChannel("whatsapp"), "sms", "WhatsApp asked for but not configured -> SMS");
    configureWhatsapp();
    assert.equal(resolveChannel("sms"), "sms");
    assert.equal(resolveChannel("whatsapp"), "whatsapp");
    assert.equal(resolveChannel(undefined), "whatsapp", "default is WhatsApp");
    assert.equal(resolveChannel("carrier-pigeon"), "whatsapp", "junk falls back to the default");
    env.OTP_DEFAULT_CHANNEL = "sms";
    assert.equal(resolveChannel(undefined), "sms");
  });

  it("fails clearly when nothing is configured or the key is missing", () => {
    assert.throws(() => resolveChannel("sms"), OtpConfigError);
    delete env.MSG91_AUTH_KEY;
    assert.throws(() => availableChannels(), OtpConfigError);
  });
});

describe("MSG91 transport: requests", () => {
  it("formats the number the way MSG91 expects (digits, country code, no plus)", () => {
    assert.equal(msg91Number("+919876543210"), "919876543210");
  });

  it("sends SMS through the Flow API with the authkey header and template variables", async () => {
    configureSms();
    const calls = mockFetch(() => ({ body: { type: "success", message: "req-1" } }));
    await deliverCode("sms", "+919876543210", "048291");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://control.msg91.com/api/v5/flow");
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.authkey, "test-authkey");
    assert.equal(headers["content-type"], "application/json");
    assert.deepEqual(calls[0].body, {
      template_id: "tmpl-sms",
      short_url: "0",
      recipients: [{ mobiles: "919876543210", OTP: "048291" }],
    });
  });

  it("uses a custom template variable name and endpoint override", async () => {
    configureSms();
    env.MSG91_SMS_OTP_VARIABLE = "var1";
    env.MSG91_FLOW_URL = "http://127.0.0.1:9100/flow";
    const calls = mockFetch(() => ({ body: { type: "success" } }));
    await deliverCode("sms", "+919876543210", "111111");
    assert.equal(calls[0].url, "http://127.0.0.1:9100/flow");
    assert.deepEqual(calls[0].body.recipients, [{ mobiles: "919876543210", var1: "111111" }]);
  });

  it("sends WhatsApp authentication templates in MSG91's documented bulk payload", async () => {
    configureWhatsapp();
    const calls = mockFetch(() => ({ body: { status: "success" } }));
    await deliverCode("whatsapp", "+919876543210", "654321");

    assert.equal(calls[0].url, "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/");
    assert.equal((calls[0].init.headers as Record<string, string>).authkey, "test-authkey");
    assert.deepEqual(calls[0].body, {
      integrated_number: "919000000000",
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: "otp_auth",
          language: { code: "en", policy: "deterministic" },
          namespace: "ns-123",
          to_and_components: [
            {
              to: ["919876543210"],
              components: {
                body_1: { type: "text", value: "654321" },
                button_1: { subtype: "url", type: "text", value: "654321" },
              },
            },
          ],
        },
      },
    });
  });

  it("can omit the copy-code button and change the language", async () => {
    configureWhatsapp();
    env.MSG91_WHATSAPP_BUTTON = "false";
    env.MSG91_WHATSAPP_LANGUAGE = "en_US";
    const calls = mockFetch(() => ({ body: {} }));
    await deliverCode("whatsapp", "+919876543210", "222222");
    const tpl = calls[0].body.payload.template;
    assert.equal(tpl.language.code, "en_US");
    assert.deepEqual(Object.keys(tpl.to_and_components[0].components), ["body_1"]);
  });
});

describe("MSG91 transport: failures", () => {
  const cases: [string, { status?: number; body: unknown }][] = [
    ["HTTP 500", { status: 500, body: { message: "boom" } }],
    ["HTTP 401 (bad authkey)", { status: 401, body: { type: "error", message: "Authentication failure" } }],
    ["HTTP 200 carrying type=error", { body: { type: "error", message: "Template not found" } }],
    ["HTTP 200 carrying hasError", { body: { hasError: true } }],
    ["HTTP 200 carrying status=fail", { body: { status: "fail" } }],
  ];
  for (const [name, response] of cases) {
    it(`rejects: ${name}`, async () => {
      configureSms();
      mockFetch(() => response);
      await assert.rejects(deliverCode("sms", "+919876543210", "123456"), OtpSendError);
    });
  }

  it("treats a network failure as a send failure", async () => {
    configureSms();
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(deliverCode("sms", "+919876543210", "123456"), OtpSendError);
  });

  it("accepts an unlabelled 200 (sending is lenient; verification is not)", async () => {
    configureSms();
    mockFetch(() => ({ body: "queued" }));
    await deliverCode("sms", "+919876543210", "123456");
  });

  it("fails cleanly when the channel is not configured", async () => {
    await assert.rejects(deliverCode("sms", "+919876543210", "123456"), OtpSendError);
    await assert.rejects(deliverCode("whatsapp", "+919876543210", "123456"), OtpSendError);
  });

  it("never leaks the authkey in an error message", async () => {
    configureSms();
    mockFetch(() => ({ status: 500, body: "internal" }));
    await assert.rejects(deliverCode("sms", "+919876543210", "123456"), (e: Error) => !e.message.includes("test-authkey"));
  });
});

describe("phone-proof tokens", () => {
  const claims = { challengeId: "chal-1", phone: "+919876543210", purpose: "login", userId: "user-1" };

  it("round-trips", async () => {
    assert.deepEqual(await verifyPhoneProofToken(await signPhoneProofToken(claims)), claims);
  });

  it("userId is optional (register / bystander)", async () => {
    const anon = { challengeId: claims.challengeId, phone: claims.phone, purpose: "register" };
    const out = await verifyPhoneProofToken(await signPhoneProofToken(anon));
    assert.equal(out?.challengeId, "chal-1");
    assert.equal(out?.phone, claims.phone);
    assert.equal(out?.purpose, "register");
    assert.equal(out?.userId, undefined);
  });

  it("is not a session, and a session is not a proof", async () => {
    assert.equal(await verifySessionToken(await signPhoneProofToken(claims)), null);
    assert.equal(await verifyPhoneProofToken(await signSessionToken({ id: "u", email: "a@b.c", role: "ADMIN", tokenVersion: 0 })), null);
  });

  it("rejects forged, tampered and expired proofs", async () => {
    const token = await signPhoneProofToken(claims);
    assert.equal(await verifyPhoneProofToken(token.slice(0, -3) + "abc"), null);
    assert.equal(await verifyPhoneProofToken("nonsense"), null);

    const forge = (secret: string, exp: string | number) =>
      new SignJWT({ ph: claims.phone, pu: "login" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("sanjivani")
        .setAudience("phone-proof")
        .setSubject("chal-1")
        .setExpirationTime(exp)
        .sign(new TextEncoder().encode(secret));
    assert.equal(await verifyPhoneProofToken(await forge("x".repeat(40), "10m")), null, "wrong key");
    assert.equal(await verifyPhoneProofToken(await forge(process.env.JWT_SECRET!, Math.floor(Date.now() / 1000) - 60)), null, "expired");
    assert.notEqual(await verifyPhoneProofToken(await forge(process.env.JWT_SECRET!, "10m")), null, "control: correctly signed is accepted");
  });
});

describe("Turnstile", () => {
  it("is a no-op when not configured", async () => {
    assert.equal(captchaEnabled(), false);
    const calls = mockFetch(() => ({ body: {} }));
    assert.equal(await verifyCaptcha(undefined, "1.2.3.4"), true);
    assert.equal(calls.length, 0);
  });

  it("when configured, requires a valid token and asks Cloudflare", async () => {
    env.TURNSTILE_SECRET_KEY = "secret";
    const calls = mockFetch((c) => ({ body: { success: String(c.body).includes("response=good") } }));
    assert.equal(captchaEnabled(), true);
    assert.equal(await verifyCaptcha("good", "1.2.3.4"), true);
    assert.equal(await verifyCaptcha("bad", "1.2.3.4"), false);
    assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.ok(String(calls[0].body).includes("secret=secret") && String(calls[0].body).includes("remoteip=1.2.3.4"));
  });

  it("fails closed on missing/oversized tokens and on network errors", async () => {
    env.TURNSTILE_SECRET_KEY = "secret";
    mockFetch(() => ({ body: { success: true } }));
    for (const t of [undefined, null, "", 42, "x".repeat(3000)]) assert.equal(await verifyCaptcha(t, null), false, String(t));
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    assert.equal(await verifyCaptcha("good", null), false);
  });
});
