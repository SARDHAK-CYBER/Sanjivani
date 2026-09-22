import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptPII, decryptPII, decryptPIIOrNull, blindIndex } from "../src/lib/encryption";

describe("AES-256-GCM field encryption", () => {
  it("uses a fresh IV per call but decrypts back to the plaintext", () => {
    const a = encryptPII("O+ Positive")!;
    const b = encryptPII("O+ Positive")!;
    assert.notEqual(a, b);
    assert.equal(decryptPII(a), "O+ Positive");
    assert.equal(decryptPII(b), "O+ Positive");
  });

  it("uses a 12-byte IV in v1 format", () => {
    const parts = encryptPII("Test")!.split(":");
    assert.equal(parts[0], "v1");
    assert.equal(parts[1].length, 24);
  });

  it("returns null for empty input", () => {
    assert.equal(encryptPII(""), null);
    assert.equal(encryptPII(null), null);
    assert.equal(decryptPII(null), null);
  });

  it("throws on tampering", () => {
    const [v, iv, tag, data] = encryptPII("Extremely Sensitive Data")!.split(":");
    const tampered = `${v}:${iv}:${tag}:${data.slice(0, -1)}${data.endsWith("a") ? "b" : "a"}`;
    assert.throws(() => decryptPII(tampered), /Decryption failed/);
  });

  it("throws on unencrypted input (no silent plaintext fallback)", () => {
    assert.throws(() => decryptPII("O+ Positive"), /Decryption failed/);
  });

  it("decryptPIIOrNull yields null instead of throwing", () => {
    assert.equal(decryptPIIOrNull("plaintext"), null);
    assert.equal(decryptPIIOrNull(encryptPII("ok")), "ok");
  });
});

describe("blind index", () => {
  it("is deterministic, and differs per value", () => {
    assert.equal(blindIndex("+919999999999"), blindIndex("+919999999999"));
    assert.notEqual(blindIndex("+919999999999"), blindIndex("+919999999998"));
    assert.match(blindIndex("x"), /^[0-9a-f]{64}$/);
  });
});
