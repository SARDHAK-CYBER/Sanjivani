import "./setup";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { generateCode, hashCode, OTP_LENGTH } from "../src/lib/otp/service";
import { OtpConfigError, allowedCountryPrefixes, fast2smsConfig, isAllowedNumber } from "../src/lib/otp/config";
import { OtpSendError, deliverCode, fast2smsNumber } from "../src/lib/otp/transport";
import { signPhoneProofToken, verifyPhoneProofToken, verifySessionToken, signSessionToken } from "../src/lib/tokens";
import { captchaEnabled, verifyCaptcha } from "../src/lib/turnstile";

const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = ["OTP_ALLOWED_COUNTRY_CODES", "FAST2SMS_API_KEY", "FAST2SMS_URL", "TURNSTILE_SECRET_KEY", "TURNSTILE_VERIFY_URL"];
const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = env[k];
    delete env[k];
  }
  env.FAST2SMS_API_KEY = "test-api-key";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
});

type Call = { url: string; init: RequestInit; params: URLSearchParams };
function mockFetch(respond: (call: Call) => { status?: number; body: unknown } | Promise<never>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(url), init, params: new URLSearchParams(String(init.body ?? "")) };
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

describe("configuration", () => {
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

  it("fails clearly when the API key is missing", () => {
    delete env.FAST2SMS_API_KEY;
    assert.throws(() => fast2smsConfig(), OtpConfigError);
  });
});

describe("Fast2SMS transport: requests", () => {
  it("formats the number as bare 10 digits (no country code)", () => {
    assert.equal(fast2smsNumber("+919876543210"), "9876543210");
  });

  it("sends the Quick SMS route with the authorization header and form body", async () => {
    const calls = mockFetch(() => ({ body: { return: true, request_id: "abc", message: ["SMS sent successfully."] } }));
    await deliverCode("+919876543210", "048291");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://www.fast2sms.com/dev/bulkV2");
    assert.equal(calls[0].init.method, "POST");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.authorization, "test-api-key");
    assert.equal(headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(calls[0].params.get("route"), "q");
    assert.equal(calls[0].params.get("numbers"), "9876543210");
    assert.ok(calls[0].params.get("message")?.includes("048291"));
  });

  it("honours a URL override", async () => {
    env.FAST2SMS_URL = "http://127.0.0.1:9100/bulkV2";
    const calls = mockFetch(() => ({ body: { return: true } }));
    await deliverCode("+919876543210", "111111");
    assert.equal(calls[0].url, "http://127.0.0.1:9100/bulkV2");
  });
});

describe("Fast2SMS transport: failures", () => {
  const cases: [string, { status?: number; body: unknown }][] = [
    ["HTTP 500", { status: 500, body: { message: "boom" } }],
    ["HTTP 401 (bad key)", { status: 401, body: { status_code: 412, message: "Invalid Authentication" } }],
    ["HTTP 200 with return: false", { body: { return: false, status_code: 995, message: "Spamming detected" } }],
    ["HTTP 200 needing wallet top-up", { body: { status_code: 999, message: "You need to complete one transaction of 100 INR or more before using API route." } }],
    ["HTTP 200 with no recognisable success field", { body: "queued" }],
  ];
  for (const [name, response] of cases) {
    it(`rejects: ${name}`, async () => {
      mockFetch(() => response);
      await assert.rejects(deliverCode("+919876543210", "123456"), OtpSendError);
    });
  }

  it("treats a network failure as a send failure", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(deliverCode("+919876543210", "123456"), OtpSendError);
  });

  it("only accepts an explicit return: true", async () => {
    mockFetch(() => ({ body: { return: true, request_id: "x" } }));
    await deliverCode("+919876543210", "123456"); // does not throw
  });

  it("fails cleanly when the API key is not configured", async () => {
    delete env.FAST2SMS_API_KEY;
    await assert.rejects(deliverCode("+919876543210", "123456"), OtpConfigError);
  });

  it("never leaks the API key in an error message", async () => {
    mockFetch(() => ({ status: 500, body: "internal" }));
    await assert.rejects(deliverCode("+919876543210", "123456"), (e: Error) => !e.message.includes("test-api-key"));
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
    const calls = mockFetch((c) => ({ body: { success: c.params.get("response") === "good" } }));
    assert.equal(captchaEnabled(), true);
    assert.equal(await verifyCaptcha("good", "1.2.3.4"), true);
    assert.equal(await verifyCaptcha("bad", "1.2.3.4"), false);
    assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(calls[0].params.get("secret"), "secret");
    assert.equal(calls[0].params.get("remoteip"), "1.2.3.4");
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
