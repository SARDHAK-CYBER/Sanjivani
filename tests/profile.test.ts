import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateProfile, encryptProfile } from "../src/lib/profile";
import { decryptPII } from "../src/lib/encryption";

const full = {
  fullName: "Asha Rao",
  dob: "2001-05-17",
  bloodGroup: "O+",
  allergies: "Penicillin",
  contactNumber: "9876543210",
  emergencyContact: "+91 99999 11111",
  guardianRelation: "Mother",
  guardianName: "Meena Rao",
  guardianContact: "9999922222",
  currentAddress: "12 Campus Road",
};

describe("validateProfile (registration: partial=false)", () => {
  it("accepts a complete profile and normalises phone numbers to E.164", () => {
    const r = validateProfile(full, false);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.data.contactNumber, "+919876543210");
      assert.equal(r.data.emergencyContact, "+919999911111");
      assert.equal(r.data.guardianContact, "+919999922222");
    }
  });

  it("requires every field except allergies", () => {
    for (const key of Object.keys(full).filter((k) => k !== "allergies")) {
      const rest: Record<string, unknown> = { ...full };
      delete rest[key];
      assert.equal(validateProfile(rest, false).ok, false, `missing ${key} should fail`);
    }
    const noAllergies: Record<string, unknown> = { ...full };
    delete noAllergies.allergies;
    const r = validateProfile(noAllergies, false);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.data.allergies, "None");
  });

  it("rejects invalid values", () => {
    assert.equal(validateProfile({ ...full, bloodGroup: "Z+" }, false).ok, false);
    assert.equal(validateProfile({ ...full, guardianRelation: "Cousin" }, false).ok, false);
    assert.equal(validateProfile({ ...full, contactNumber: "12345" }, false).ok, false);
    assert.equal(validateProfile({ ...full, dob: "17/05/2001" }, false).ok, false);
    assert.equal(validateProfile({ ...full, dob: "2999-01-01" }, false).ok, false);
    assert.equal(validateProfile({ ...full, dob: "1800-01-01" }, false).ok, false);
    assert.equal(validateProfile({ ...full, fullName: "x".repeat(101) }, false).ok, false);
    assert.equal(validateProfile({ ...full, allergies: "x".repeat(201) }, false).ok, false);
  });
});

describe("validateProfile (profile edit: partial=true)", () => {
  it("returns ONLY the fields that were sent, so omitted fields can never be blanked", () => {
    const r = validateProfile({ bloodGroup: "A-" }, true);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.data, { bloodGroup: "A-" });
  });

  it("still validates fields that are present", () => {
    assert.equal(validateProfile({ bloodGroup: "nope" }, true).ok, false);
    assert.equal(validateProfile({ emergencyContact: "abc" }, true).ok, false);
  });

  it("allows clearing allergies to an empty string", () => {
    const r = validateProfile({ allergies: "" }, true);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.data.allergies, "");
  });
});

describe("encryptProfile", () => {
  it("encrypts sensitive fields, leaves the name plain, and omits absent fields", () => {
    const enc = encryptProfile({ fullName: "Asha", bloodGroup: "O+", contactNumber: "+919876543210" });
    assert.equal(enc.fullName, "Asha");
    assert.equal(decryptPII(enc.bloodGroup!), "O+");
    assert.equal(decryptPII(enc.contactNumber!), "+919876543210");
    assert.ok(!("dob" in enc), "absent fields must not appear (they would overwrite with null)");
    assert.ok(!("allergies" in enc));
  });
});
