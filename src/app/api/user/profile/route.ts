import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guard";
import { errorJson, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { decryptPIIOrNull } from "@/lib/encryption";
import { encryptProfile, serializeProfile, validateProfile } from "@/lib/profile";
import { PhoneVerificationError, phoneErrorMessage, verifyPhoneProof } from "@/lib/phone-verification";
import { sessionTtlSeconds, signSessionToken } from "@/lib/tokens";
import { SESSION_COOKIE } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const assets = await prisma.asset.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        assetType: true,
        identifier: true,
        qrReferenceId: true,
        frontPhotoUrl: true,
        backPhotoUrl: true,
        leftPhotoUrl: true,
        rightPhotoUrl: true,
        rcPhotoUrl: true,
        devicePhotoUrl: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ...serializeProfile(user), assets });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return errorJson("Internal server error", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();
    if (!(await rateLimit("profileWrite", user.id)).success) return tooMany();

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    // Whitelist: email, role, UII, RRU ID etc. can never be changed here. Fields left out of the
    // request are left untouched (they used to be overwritten with null).
    const result = validateProfile(body, true);
    if (!result.ok) return errorJson(result.error, 400);
    const fields = result.data;

    // The contact number is the account's 2FA factor. Changing it needs proof of the NEW number, or
    // anyone holding a session (e.g. a stolen laptop) could re-point 2FA at their own phone.
    let numberChanged = false;
    if (fields.contactNumber !== undefined) {
      const current = decryptPIIOrNull(user.contactNumber);
      if (fields.contactNumber === current) {
        delete fields.contactNumber;
      } else {
        try {
          await verifyPhoneProof(body.phoneProof, { purpose: "change-phone", phone: fields.contactNumber, userId: user.id });
        } catch (error) {
          if (error instanceof PhoneVerificationError) {
            return errorJson(phoneErrorMessage(error), 400);
          }
          throw error;
        }
        numberChanged = true;
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...encryptProfile(fields),
        // Re-pointing 2FA signs out every other session.
        ...(numberChanged && { tokenVersion: { increment: 1 } }),
      },
    });

    await writeAudit(request, user.id, numberChanged ? "CONTACT_NUMBER_CHANGED" : "PROFILE_UPDATED");

    const response = NextResponse.json(serializeProfile(updated));
    if (numberChanged) {
      response.cookies.set({
        name: SESSION_COOKIE,
        value: await signSessionToken(updated),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: sessionTtlSeconds(updated.role),
      });
    }
    return response;
  } catch (error) {
    console.error("Profile update error:", error);
    return errorJson("Internal server error", 500);
  }
}
