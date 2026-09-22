import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { cleanString, errorJson, limitByIp, readJsonObject } from "@/lib/http";
import { validatePassword } from "@/lib/password";
import { encryptProfile, validateProfile } from "@/lib/profile";
import { SELF_SERVICE_ROLES } from "@/lib/constants";
import { PhoneVerificationError, phoneErrorMessage, verifyPhoneProof } from "@/lib/phone-verification";
import { StorageError, adoptTempFile, removeStoredDirectory } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function newUii(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const uii = `RRU-UII-${randomBytes(4).toString("hex").toUpperCase()}`;
    if (!(await prisma.user.findUnique({ where: { uii }, select: { id: true } }))) return uii;
  }
  throw new Error("Could not allocate a unique UII");
}

export async function POST(request: Request) {
  let userId: string | null = null;
  try {
    const { blocked } = await limitByIp(request, "registerIp");
    if (blocked) return blocked;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const email = cleanString(body.email, 254)?.toLowerCase();
    if (!email || !EMAIL.test(email)) return errorJson("A valid email address is required", 400);

    const rruIdNumber = cleanString(body.rruIdNumber, 50);
    if (!rruIdNumber) return errorJson("RRU ID is required", 400);

    // The role is a self-declared *category*. ADMIN can never be requested here.
    const role = body.role === undefined ? "STUDENT" : body.role;
    if (typeof role !== "string" || !(SELF_SERVICE_ROLES as readonly string[]).includes(role)) {
      return errorJson("Invalid role", 400);
    }

    const profile = validateProfile(body, false);
    if (!profile.ok) return errorJson(profile.error, 400);
    const fields = profile.data;

    const passwordError = validatePassword(body.password, { fullName: fields.fullName, dob: fields.dob, email });
    if (passwordError) return errorJson(passwordError, 400);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { rruIdNumber }] },
      select: { id: true },
    });
    if (existing) return errorJson("User with this email or RRU ID already exists", 400);

    // Proves the person registering actually controls the number that will later be their 2FA factor.
    try {
      await verifyPhoneProof(body.phoneProof, { purpose: "register", phone: fields.contactNumber });
    } catch (error) {
      if (error instanceof PhoneVerificationError) {
        return errorJson(phoneErrorMessage(error), 400);
      }
      throw error;
    }

    userId = randomUUID();
    let profilePhotoUrl: string;
    let idCardPhotoUrl: string;
    try {
      profilePhotoUrl = await adoptTempFile(body.profilePhotoUrl, [userId]);
      idCardPhotoUrl = await adoptTempFile(body.idCardPhotoUrl, [userId]);
    } catch (error) {
      if (error instanceof StorageError) return errorJson(`${error.message} A profile photo and ID card photo are required.`, 400);
      throw error;
    }

    const passwordHash = await hashPassword(body.password as string);
    const uii = await newUii();

    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash,
        role,
        rruIdNumber,
        uii,
        profilePhotoUrl,
        idCardPhotoUrl,
        ...encryptProfile(fields),
      },
    });

    await writeAudit(request, user.id, "ACCOUNT_REGISTERED");
    return NextResponse.json({ success: true, uii });
  } catch (error) {
    if (userId) await removeStoredDirectory([userId]).catch(() => {});
    if ((error as { code?: string }).code === "P2002") {
      return errorJson("User with this email or RRU ID already exists", 409);
    }
    console.error("Register error:", error);
    return errorJson("Internal server error", 500);
  }
}
