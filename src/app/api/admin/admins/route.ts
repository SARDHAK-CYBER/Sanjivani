import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getPrimaryAdminId, requirePrimaryAdmin } from "@/lib/primary-admin";
import { cleanString, errorJson, forbidden, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { decryptPIIOrNull, encryptPII } from "@/lib/encryption";
import { hashPassword } from "@/lib/crypto";
import { generateTempPassword, validatePassword } from "@/lib/password";
import { maskPhone, parseE164 } from "@/lib/phone";
import { isTotpEnabled } from "@/lib/two-factor";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every administrator, for the Admins page. Any admin may read; only the primary may change anything. */
export async function GET() {
  try {
    const viewer = await requireAdmin();
    if (!viewer) return unauthorized();

    const [admins, primaryId] = await Promise.all([
      prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
      getPrimaryAdminId(),
    ]);
    const lastSeen = await prisma.auditLog.groupBy({
      by: ["userId"],
      where: { userId: { in: admins.map((a) => a.id) }, action: { in: ["LOGGED_IN_WITH_TOTP", "LOGGED_IN_WITH_RECOVERY_CODE"] } },
      _max: { createdAt: true },
    });
    const lastById = new Map(lastSeen.map((row) => [row.userId, row._max.createdAt]));

    return NextResponse.json({
      viewerId: viewer.id,
      viewerIsPrimary: viewer.id === primaryId,
      admins: admins.map((a) => {
        const phone = parseE164(decryptPIIOrNull(a.contactNumber));
        return {
          id: a.id,
          uii: a.uii,
          fullName: a.fullName,
          email: a.email,
          phoneHint: phone ? maskPhone(phone) : null,
          twoFactor: isTotpEnabled(a),
          isPrimary: a.id === primaryId,
          createdAt: a.createdAt,
          lastSignIn: lastById.get(a.id) ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to list admins:", error);
    return errorJson("Internal Server Error", 500);
  }
}

/**
 * Primary admin only. Two ways to add an administrator:
 *  - { fullName, email, phone, password? }  a new account (a strong password is generated if none is given)
 *  - { promoteEmail }                       an existing member becomes an administrator
 * New administrators set up their authenticator at first sign-in, after confirming a code texted to their phone,
 * so the primary admin never sees an authenticator secret or recovery codes.
 */
export async function POST(request: Request) {
  try {
    const primary = await requirePrimaryAdmin();
    if (!primary) return (await requireAdmin()) ? forbidden() : unauthorized();
    if (!(await rateLimit("adminManage", primary.id)).success) return tooMany();

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    if (body.promoteEmail !== undefined) return promote(request, primary.id, body);

    const fullName = cleanString(body.fullName, 100);
    const email = cleanString(body.email, 254)?.toLowerCase();
    const phone = parseE164(body.phone);
    if (!fullName) return errorJson("Full name is required", 400);
    if (!email || !EMAIL.test(email)) return errorJson("A valid email address is required", 400);
    if (!phone) return errorJson("A valid phone number is required (it receives the sign-in setup code)", 400);

    const supplied = typeof body.password === "string" && body.password.length > 0;
    const password = supplied ? (body.password as string) : generateTempPassword();
    const passwordError = validatePassword(password, { fullName, email });
    if (passwordError) return errorJson(passwordError, 400);

    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return errorJson("An account with that email already exists. Use \"Promote existing member\" instead.", 409);
    }

    const created = await prisma.user.create({
      data: {
        email,
        fullName,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        contactNumber: encryptPII(phone),
        uii: `RRU-UII-${randomBytes(4).toString("hex").toUpperCase()}`,
      },
    });
    await writeAudit(request, created.id, "ADMIN_CREATED", `By primary admin ${primary.id}`);

    return NextResponse.json({ success: true, id: created.id, email, ...(supplied ? {} : { temporaryPassword: password }) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create admin:", error);
    return errorJson("Internal Server Error", 500);
  }
}

async function promote(request: Request, primaryId: string, body: Record<string, unknown>) {
  const email = cleanString(body.promoteEmail, 254)?.toLowerCase();
  if (!email) return errorJson("Enter the member's email address", 400);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return errorJson("No account with that email", 404);
  if (user.role === "ADMIN") return errorJson("That account is already an administrator", 409);
  if (!parseE164(decryptPIIOrNull(user.contactNumber))) {
    return errorJson("That member has no valid phone number, which administrators need for sign-in", 400);
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN", tokenVersion: { increment: 1 } } });
  await writeAudit(request, user.id, "ROLE_CHANGED", `Promoted to ADMIN by primary admin ${primaryId}`, { role: { from: user.role, to: "ADMIN" } });
  return NextResponse.json({ success: true, id: user.id, email });
}
