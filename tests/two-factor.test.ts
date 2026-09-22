import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  hashRecoveryCode,
  isTotpEnabled,
  normalizeRecoveryCode,
} from "../src/lib/two-factor";
import {
  signPendingTwoFactorToken,
  signSessionToken,
  signTotpEnrollToken,
  verifyPendingTwoFactorToken,
  verifySessionToken,
  verifyTotpEnrollToken,
} from "../src/lib/tokens";

describe("recovery codes", () => {
  it("look like XXXXX-XXXXX using only unambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      assert.match(generateRecoveryCode(), /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    }
  });

  it("are unique across a batch", () => {
    const codes = Array.from({ length: 1000 }, generateRecoveryCode);
    assert.equal(new Set(codes).size, codes.length);
    assert.equal(RECOVERY_CODE_COUNT, 8);
  });

  it("normalise what people actually type", () => {
    assert.equal(normalizeRecoveryCode("abcde-fghjk"), "ABCDEFGHJK");
    assert.equal(normalizeRecoveryCode(" ABCDE FGHJK "), "ABCDEFGHJK");
    assert.equal(normalizeRecoveryCode("abcdefghjk"), "ABCDEFGHJK");
    assert.equal(normalizeRecoveryCode("O0O0O-I1L1I"), "0000011111", "look-alikes O->0 and I/L->1");
  });

  it("reject anything that is not a code", () => {
    for (const bad of [undefined, null, 42, "", "ABCDE", "ABCDE-FGHJK-M", "ABCDE-FGHJ!", "UUUUU-UUUUU"]) {
      assert.equal(normalizeRecoveryCode(bad), null, String(bad));
    }
  });

  it("every generated code survives normalisation unchanged", () => {
    for (let i = 0; i < 300; i++) {
      const code = generateRecoveryCode();
      assert.equal(normalizeRecoveryCode(code), code.replace("-", ""));
    }
  });

  it("hash to a keyed, deterministic digest; a typed variant hashes identically", () => {
    const code = generateRecoveryCode();
    const h = hashRecoveryCode(normalizeRecoveryCode(code)!);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(h, hashRecoveryCode(normalizeRecoveryCode(code.toLowerCase().replace("-", " "))!));
    assert.notEqual(h, hashRecoveryCode(normalizeRecoveryCode(generateRecoveryCode())!));
  });
});

describe("isTotpEnabled", () => {
  it("needs both the secret and the enabled timestamp", () => {
    assert.equal(isTotpEnabled({ totpSecretEnc: "v1:x", totpEnabledAt: new Date() }), true);
    assert.equal(isTotpEnabled({ totpSecretEnc: null, totpEnabledAt: new Date() }), false);
    assert.equal(isTotpEnabled({ totpSecretEnc: "v1:x", totpEnabledAt: null }), false);
  });
});

describe("enrolment token", () => {
  const user = { id: "u1", email: "a@rru.edu", role: "STUDENT", tokenVersion: 4 };

  it("round-trips, including whether it is a recovery", async () => {
    assert.deepEqual(await verifyTotpEnrollToken(await signTotpEnrollToken(user, false)), { id: "u1", tokenVersion: 4, recovery: false });
    assert.deepEqual(await verifyTotpEnrollToken(await signTotpEnrollToken(user, true)), { id: "u1", tokenVersion: 4, recovery: true });
  });

  it("is not a session and not a password-step token, and they are not enrolment tokens", async () => {
    const enroll = await signTotpEnrollToken(user, false);
    assert.equal(await verifySessionToken(enroll), null);
    assert.equal(await verifyPendingTwoFactorToken(enroll), null);
    assert.equal(await verifyTotpEnrollToken(await signSessionToken(user)), null);
    assert.equal(await verifyTotpEnrollToken(await signPendingTwoFactorToken(user)), null);
  });

  it("rejects garbage and tampering", async () => {
    const token = await signTotpEnrollToken(user, false);
    assert.equal(await verifyTotpEnrollToken("nonsense"), null);
    assert.equal(await verifyTotpEnrollToken(token.slice(0, -3) + "abc"), null);
  });
});
