import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import {
  signSessionToken,
  verifySessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
  signBystanderToken,
  verifyBystanderToken,
} from "../src/lib/tokens";

const user = { id: "user-1", email: "a@rru.edu", role: "STUDENT", tokenVersion: 3 };

describe("token separation", () => {
  it("round-trips a session token with its claims", async () => {
    const claims = await verifySessionToken(await signSessionToken(user));
    assert.deepEqual(claims, { id: "user-1", email: "a@rru.edu", role: "STUDENT", tokenVersion: 3 });
  });

  it("a password-only (2FA pending) token is NOT accepted as a session", async () => {
    // This was the 2FA bypass: both were signed with JWT_SECRET, so either passed for either.
    const pending = await signPendingTwoFactorToken(user);
    assert.equal(await verifySessionToken(pending), null);
  });

  it("a session token is not accepted as a 2FA-pending token", async () => {
    assert.equal(await verifyPendingTwoFactorToken(await signSessionToken(user)), null);
  });

  it("bystander tokens are not sessions, and sessions are not bystander tokens", async () => {
    assert.equal(await verifySessionToken(await signBystanderToken("b-1")), null);
    assert.equal(await verifyBystanderToken(await signSessionToken(user)), null);
  });

  it("round-trips bystander and pending tokens", async () => {
    assert.deepEqual(await verifyBystanderToken(await signBystanderToken("b-1")), { bystanderId: "b-1" });
    assert.deepEqual(await verifyPendingTwoFactorToken(await signPendingTwoFactorToken(user)), {
      id: "user-1",
      tokenVersion: 3,
    });
  });

  it("rejects garbage and tampered tokens", async () => {
    assert.equal(await verifySessionToken("not-a-jwt"), null);
    const token = await signSessionToken(user);
    assert.equal(await verifySessionToken(token.slice(0, -3) + "abc"), null);
  });

  it("rejects a token signed with the wrong key, and an expired one", async () => {
    const forged = await new SignJWT({ tv: 0, role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("sanjivani")
      .setAudience("session")
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("x".repeat(40)));
    assert.equal(await verifySessionToken(forged), null);

    const expired = await new SignJWT({ tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("sanjivani")
      .setAudience("session")
      .setSubject("user-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    assert.equal(await verifySessionToken(expired), null);
  });

  it("rejects a token without the tokenVersion claim (pre-fix tokens)", async () => {
    const legacy = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("sanjivani")
      .setAudience("session")
      .setSubject("user-1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    assert.equal(await verifySessionToken(legacy), null);
  });
});
