import type { User } from "@/generated/prisma/client";
import { cleanString } from "@/lib/http";
import { parseE164 } from "@/lib/phone";
import { decryptPIIOrNull, encryptPII } from "@/lib/encryption";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const GUARDIAN_RELATIONS = ["Father", "Mother", "Husband", "Wife", "Guardian"] as const;

export type ProfileFields = {
  fullName: string;
  dob: string;
  bloodGroup: string;
  allergies: string;
  contactNumber: string;
  emergencyContact: string;
  guardianRelation: string;
  guardianName: string;
  guardianContact: string;
  currentAddress: string;
};

type Result = { ok: true; data: Partial<ProfileFields> } | { ok: false; error: string };

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function validDob(value: string): boolean {
  if (!isoDate.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  const year = new Date(time).getUTCFullYear();
  return time < Date.now() && year >= new Date().getUTCFullYear() - 120;
}

/**
 * Validates and normalises profile input.
 *  - partial=false (registration): every field except `allergies` is required.
 *  - partial=true  (profile edit): only the fields that are present are checked and returned, so an
 *    omitted field can never be silently blanked.
 */
export function validateProfile(body: Record<string, unknown>, partial: boolean): Result {
  const data: Partial<ProfileFields> = {};
  const present = (key: string) => body[key] !== undefined;
  const need = (key: string) => !partial || present(key);

  const text = (key: keyof ProfileFields & string, label: string, max: number): string | null => {
    if (!need(key)) return null;
    const value = cleanString(body[key], max);
    if (!value) return `${label} is required (max ${max} characters)`;
    (data as Record<string, string>)[key] = value;
    return null;
  };

  const phone = (key: "contactNumber" | "emergencyContact" | "guardianContact", label: string): string | null => {
    if (!need(key)) return null;
    const e164 = parseE164(body[key]);
    if (!e164) return `${label} must be a valid phone number`;
    data[key] = e164;
    return null;
  };

  const oneOf = (key: "bloodGroup" | "guardianRelation", label: string, options: readonly string[]): string | null => {
    if (!need(key)) return null;
    const value = body[key];
    if (typeof value !== "string" || !options.includes(value)) return `${label} is invalid`;
    data[key] = value;
    return null;
  };

  const errors = [
    text("fullName", "Full name", 100),
    phone("contactNumber", "Contact number"),
    phone("emergencyContact", "Emergency contact"),
    phone("guardianContact", "Guardian contact"),
    oneOf("bloodGroup", "Blood group", BLOOD_GROUPS),
    oneOf("guardianRelation", "Guardian relation", GUARDIAN_RELATIONS),
    text("guardianName", "Guardian name", 100),
    text("currentAddress", "Current address", 300),
  ];

  if (need("dob")) {
    const dob = cleanString(body.dob, 10);
    if (!dob || !validDob(dob)) errors.push("Date of birth must be a valid past date (YYYY-MM-DD)");
    else data.dob = dob;
  }

  // Allergies is genuinely optional; an empty value means "none".
  if (present("allergies")) {
    const allergies = typeof body.allergies === "string" ? body.allergies.trim() : null;
    if (allergies === null || allergies.length > 200) errors.push("Allergies must be text up to 200 characters");
    else data.allergies = allergies;
  } else if (!partial) {
    data.allergies = "None";
  }

  const error = errors.find(Boolean);
  return error ? { ok: false, error } : { ok: true, data };
}

/** Maps validated plaintext profile fields to their encrypted database columns. */
export function encryptProfile(data: Partial<ProfileFields>) {
  return {
    ...(data.fullName !== undefined && { fullName: data.fullName }),
    ...(data.dob !== undefined && { dob: encryptPII(data.dob) }),
    ...(data.bloodGroup !== undefined && { bloodGroup: encryptPII(data.bloodGroup) }),
    ...(data.allergies !== undefined && { allergies: encryptPII(data.allergies) }),
    ...(data.contactNumber !== undefined && { contactNumber: encryptPII(data.contactNumber) }),
    ...(data.emergencyContact !== undefined && { emergencyContact: encryptPII(data.emergencyContact) }),
    ...(data.guardianRelation !== undefined && { guardianRelation: encryptPII(data.guardianRelation) }),
    ...(data.guardianName !== undefined && { guardianName: encryptPII(data.guardianName) }),
    ...(data.guardianContact !== undefined && { guardianContact: encryptPII(data.guardianContact) }),
    ...(data.currentAddress !== undefined && { currentAddress: encryptPII(data.currentAddress) }),
  };
}

/** A User row as safe-to-return JSON with PII decrypted. Never includes hashes, tokens or the token version. */
export function serializeProfile(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    uii: user.uii,
    fullName: user.fullName,
    rruIdNumber: user.rruIdNumber,
    profilePhotoUrl: user.profilePhotoUrl,
    idCardPhotoUrl: user.idCardPhotoUrl,
    createdAt: user.createdAt,
    dob: decryptPIIOrNull(user.dob),
    bloodGroup: decryptPIIOrNull(user.bloodGroup),
    allergies: decryptPIIOrNull(user.allergies),
    contactNumber: decryptPIIOrNull(user.contactNumber),
    emergencyContact: decryptPIIOrNull(user.emergencyContact),
    guardianRelation: decryptPIIOrNull(user.guardianRelation),
    guardianName: decryptPIIOrNull(user.guardianName),
    guardianContact: decryptPIIOrNull(user.guardianContact),
    currentAddress: decryptPIIOrNull(user.currentAddress),
  };
}
