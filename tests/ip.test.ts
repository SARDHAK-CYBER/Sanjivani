import "./setup";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getClientIp } from "../src/lib/ip";

const env = process.env as Record<string, string | undefined>;
const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

afterEach(() => {
  delete env.TRUSTED_PROXY_HOPS;
  env.NODE_ENV = undefined;
});

describe("getClientIp", () => {
  it("ignores client-forged left-hand X-Forwarded-For entries (one trusted proxy)", () => {
    // A caller sends `X-Forwarded-For: 6.6.6.6`; our proxy appends the address it actually saw.
    assert.equal(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  });

  it("counts TRUSTED_PROXY_HOPS entries in from the right", () => {
    env.TRUSTED_PROXY_HOPS = "2";
    assert.equal(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  });

  it("uses the only entry when there is one", () => {
    assert.equal(getClientIp(req({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    assert.equal(getClientIp(req({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  });

  it("ignores forwarding headers entirely when TRUSTED_PROXY_HOPS=0", () => {
    env.TRUSTED_PROXY_HOPS = "0";
    assert.equal(getClientIp(req({ "x-forwarded-for": "203.0.113.9" })), "127.0.0.1");
  });

  it("falls back to loopback in development, but fails closed in production", () => {
    assert.equal(getClientIp(req({})), "127.0.0.1");
    env.NODE_ENV = "production";
    assert.equal(getClientIp(req({})), null);
  });
});
