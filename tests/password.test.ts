import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePassword } from "../src/lib/password";
import { comparePassword, hashPassword, sha256Hex } from "../src/lib/crypto";

describe("password policy", () => {
  it("accepts a compliant password", () => {
    assert.equal(validatePassword("Str0ng!pass"), null);
  });

  it("enforces length, digit and symbol", () => {
    assert.match(validatePassword("Sh0rt!")!, /8 characters/);
    assert.match(validatePassword("NoDigits!!")!, /number/);
    assert.match(validatePassword("NoSymbol123")!, /symbol/);
    assert.match(validatePassword("a".repeat(129) + "1!")!, /at most/);
  });

  it("rejects non-strings", () => {
    assert.notEqual(validatePassword(undefined), null);
    assert.notEqual(validatePassword(12345678), null);
  });

  it("rejects the user's own name, DOB and email", () => {
    assert.match(validatePassword("John 1!x", { fullName: "john 1!x" })!, /name/);
    assert.match(validatePassword("2000-01-01!", { dob: "2000-01-01!" })!, /Date of Birth/);
    assert.match(validatePassword("a@rru.edu1!", { email: "A@rru.edu1!" })!, /email/);
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("Correct!1");
    assert.equal(await comparePassword("Correct!1", hash), true);
    assert.equal(await comparePassword("Wrong!1", hash), false);
  });

  it("salts every hash", async () => {
    assert.notEqual(await hashPassword("Same!1234"), await hashPassword("Same!1234"));
  });

  it("returns false (without throwing) when there is no stored hash", async () => {
    assert.equal(await comparePassword("anything", null), false);
    assert.equal(await comparePassword("anything", undefined), false);
    assert.equal(await comparePassword("anything", "garbage"), false);
  });

  it("sha256Hex is stable", () => {
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
