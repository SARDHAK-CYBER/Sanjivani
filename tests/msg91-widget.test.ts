import "./setup";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Msg91WidgetError, verifyWidgetAccessToken } from "../src/lib/msg91-widget";

const env = process.env as Record<string, string | undefined>;
const realFetch = globalThis.fetch;
let savedAuthKey: string | undefined;

beforeEach(() => {
  savedAuthKey = env.MSG91_AUTH_KEY;
  env.MSG91_AUTH_KEY = "test-authkey";
});
afterEach(() => {
  env.MSG91_AUTH_KEY = savedAuthKey;
  globalThis.fetch = realFetch;
});

type Call = { url: string; body: Record<string, unknown> };
function mockFetch(respond: (call: Call) => { status?: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(url), body: JSON.parse(String(init.body)) };
    calls.push(call);
    const r = respond(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const TOKEN = "x".repeat(40); // long enough to pass the basic shape check

describe("verifyWidgetAccessToken: request shape", () => {
  it("posts the documented body to the documented endpoint", async () => {
    const calls = mockFetch(() => ({ body: { mobile: "+919876543210" } }));
    await verifyWidgetAccessToken(TOKEN, "+919876543210");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://control.msg91.com/api/v5/widget/verifyAccessToken");
    assert.deepEqual(calls[0].body, { authkey: "test-authkey", "access-token": TOKEN });
  });

  it("honours a URL override", async () => {
    env.MSG91_WIDGET_VERIFY_URL = "http://127.0.0.1:9100/verify";
    const calls = mockFetch(() => ({ body: { mobile: "+919876543210" } }));
    await verifyWidgetAccessToken(TOKEN, "+919876543210");
    assert.equal(calls[0].url, "http://127.0.0.1:9100/verify");
    delete env.MSG91_WIDGET_VERIFY_URL;
  });

  it("rejects missing/malformed tokens before ever calling MSG91", async () => {
    const calls = mockFetch(() => ({ body: {} }));
    for (const bad of [undefined, null, 123, "", "short"]) {
      await assert.rejects(verifyWidgetAccessToken(bad, "+919876543210"), Msg91WidgetError);
    }
    assert.equal(calls.length, 0);
  });

  it("fails clearly when the authkey is not configured", async () => {
    delete env.MSG91_AUTH_KEY;
    await assert.rejects(
      verifyWidgetAccessToken(TOKEN, "+919876543210"),
      (e: unknown) => e instanceof Msg91WidgetError && e.reason === "unconfigured"
    );
  });
});

describe("verifyWidgetAccessToken: recognising MSG91's error shapes", () => {
  // These are the two concrete shapes observed from the real API during integration testing --
  // HTTP 401 for malformed requests, and HTTP 200 with an error body for a rejected-but-valid one.
  const rejections: [string, { status?: number; body: unknown }][] = [
    ["HTTP 401 (malformed request)", { status: 401, body: { message: "AuthenticationFailure", type: "error", code: 401 } }],
    ["HTTP 200 with an error body (observed: code 418)", { body: { message: "AuthenticationFailure", type: "error", code: "418" } }],
    ["HTTP 500", { status: 500, body: { message: "boom" } }],
  ];
  for (const [name, response] of rejections) {
    it(`treats as a rejection: ${name}`, async () => {
      mockFetch(() => response);
      await assert.rejects(
        verifyWidgetAccessToken(TOKEN, "+919876543210"),
        (e: unknown) => e instanceof Msg91WidgetError && e.reason === "rejected"
      );
    });
  }

  it("wraps a network failure distinctly from a rejection", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      verifyWidgetAccessToken(TOKEN, "+919876543210"),
      (e: unknown) => e instanceof Msg91WidgetError && e.reason === "network"
    );
  });

  it("never leaks the authkey in a thrown error message", async () => {
    mockFetch(() => ({ status: 500, body: "internal" }));
    await assert.rejects(verifyWidgetAccessToken(TOKEN, "+919876543210"), (e: Error) => !e.message.includes("test-authkey"));
  });
});

describe("verifyWidgetAccessToken: success handling (speculative response shape)", () => {
  it("accepts a success body and defensively extracts a phone-like field", async () => {
    for (const body of [
      { mobile: "+919876543210" },
      { phone: "+919876543210" },
      { identifier: "+919876543210" },
      { data: { mobile: "+919876543210" } },
    ]) {
      mockFetch(() => ({ body }));
      const { phone } = await verifyWidgetAccessToken(TOKEN, "+919876543210"); // matches, so the mismatch guard doesn't fire
      assert.equal(phone, "+919876543210", JSON.stringify(body));
    }
  });

  it("falls back to the client-claimed phone when the response has no identifiable field", async () => {
    mockFetch(() => ({ body: { message: "some-other-shape" } }));
    const { phone } = await verifyWidgetAccessToken(TOKEN, "+919876543210");
    assert.equal(phone, "+919876543210");
  });

  it("rejects when MSG91's own response disagrees with the client-claimed number", async () => {
    mockFetch(() => ({ body: { mobile: "+919111111111" } }));
    await assert.rejects(
      verifyWidgetAccessToken(TOKEN, "+919876543210"),
      (e: unknown) => e instanceof Msg91WidgetError && e.reason === "rejected"
    );
  });

  it("tolerates formatting differences (spaces, no +) when comparing MSG91's number to the claim", async () => {
    mockFetch(() => ({ body: { mobile: "91 98765 43210" } }));
    const { phone } = await verifyWidgetAccessToken(TOKEN, "+919876543210");
    assert.equal(phone, "91 98765 43210");
  });
});
