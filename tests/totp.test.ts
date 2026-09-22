import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  formatSecret,
  generateTotpSecret,
  hotp,
  otpauthUri,
  timeStep,
  totpAt,
  verifyTotp,
} from "../src/lib/totp";

// RFC 6238 Appendix B uses the ASCII key "12345678901234567890" (SHA-1) and 8-digit codes.
const RFC_SECRET_ASCII = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET_ASCII);

describe("RFC test vectors", () => {
  it("RFC 4226 Appendix D: HOTP for counters 0..9", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET_ASCII, counter), code, `counter ${counter}`));
  });

  it("RFC 6238 Appendix B: TOTP (SHA-1, 8 digits) at the published timestamps", () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [seconds, code] of vectors) {
      assert.equal(totpAt(RFC_SECRET_B32, seconds * 1000, 8), code, `t=${seconds}`);
    }
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (let len = 0; len < 40; len++) {
      const bytes = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + len) & 255));
      assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
    }
  });

  it("matches the RFC 4648 examples", () => {
    assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
    assert.equal(base32Decode("MZXW6YTBOI").toString(), "foobar");
  });

  it("tolerates lowercase, spaces, hyphens and padding when decoding", () => {
    assert.equal(base32Decode("mzxw 6ytb-oi======").toString(), "foobar");
  });

  it("rejects characters outside the alphabet", () => {
    assert.throws(() => base32Decode("MZXW1YTB"), /Invalid base32/);
  });

  it("generates 160-bit secrets that differ every time", () => {
    const a = generateTotpSecret();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.equal(base32Decode(a).length, 20);
    assert.notEqual(a, generateTotpSecret());
  });
});

describe("verifyTotp", () => {
  const now = 1_800_000_000_000;
  const step = timeStep(now);
  const at = (offset: number) => totpAt(RFC_SECRET_B32, now + offset * 30_000);

  it("accepts the current code and returns its step", () => {
    assert.equal(verifyTotp(RFC_SECRET_B32, at(0), { nowMs: now }), step);
  });

  it("tolerates one step of clock drift either way, but no more", () => {
    assert.equal(verifyTotp(RFC_SECRET_B32, at(-1), { nowMs: now }), step - 1);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(1), { nowMs: now }), step + 1);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(-2), { nowMs: now }), null);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(2), { nowMs: now }), null);
  });

  it("rejects a code that was already used (replay), but accepts a later one", () => {
    assert.equal(verifyTotp(RFC_SECRET_B32, at(0), { nowMs: now, afterStep: step }), null);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(-1), { nowMs: now, afterStep: step }), null);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(1), { nowMs: now, afterStep: step }), step + 1);
    assert.equal(verifyTotp(RFC_SECRET_B32, at(0), { nowMs: now, afterStep: null }), step);
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of [undefined, null, 123456, "", "12345", "1234567", "abcdef", "12 34 5"]) {
      assert.equal(verifyTotp(RFC_SECRET_B32, bad, { nowMs: now }), null, String(bad));
    }
  });

  it("accepts a code typed with a space in the middle (how apps display it)", () => {
    const code = at(0);
    assert.equal(verifyTotp(RFC_SECRET_B32, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now }), step);
  });

  it("a code for one secret never verifies against another", () => {
    const other = generateTotpSecret();
    assert.equal(verifyTotp(other, at(0), { nowMs: now }), null);
  });
});

describe("enrolment URI", () => {
  it("builds the Key URI format authenticator apps scan", () => {
    const uri = otpauthUri({ secret: "JBSWY3DPEHPK3PXP", account: "asha@rru.edu", issuer: "Sanjivani" });
    assert.match(uri, /^otpauth:\/\/totp\/Sanjivani:asha%40rru\.edu\?/);
    const q = new URL(uri).searchParams;
    assert.equal(q.get("secret"), "JBSWY3DPEHPK3PXP");
    assert.equal(q.get("issuer"), "Sanjivani");
    assert.equal(q.get("algorithm"), "SHA1");
    assert.equal(q.get("digits"), "6");
    assert.equal(q.get("period"), "30");
  });

  it("formats a manual-entry key in groups of four", () => {
    assert.equal(formatSecret("ABCDEFGHIJKLMNOP"), "ABCD EFGH IJKL MNOP");
  });
});
