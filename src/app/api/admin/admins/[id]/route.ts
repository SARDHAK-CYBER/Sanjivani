import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { getPrimaryAdminId, requirePrimaryAdmin } from "@/lib/primary-admin";
import { cleanString, errorJson, forbidden, readJsonObject, tooMany, unauthorized } from "@/lib/http";
import { decryptPIIOrNull, encryptPII } from "@/lib/encryption";
import { hashPassword } from "@/lib/crypto";
import { generateTempPassword, validatePassword } from "@/lib/password";
import { parseE164 } from "@/lib/phone";
import { resetTwoFactor } from "@/lib/two-factor";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit, type AuditChanges } from "@/lib/audit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function load(id: string) {
  const [target, primaryId] = await Promise.all([prisma.user.findUnique({ where: { id } }), getPrimaryAdminId()]);
  return target && target.role === "ADMIN" ? { target, isPrimary: target.id === primaryId } : null;
}

/** Edit an administrator's name, email or phone. Primary admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const primary = await requirePrimaryAdmin();
    if (!primary) return (await requireAdmin()) ? forbidden() : unauthorized();
    if (!(await rateLimit("adminManage", primary.id)).success) return tooMany();

    const found = await load((await params).id);
    if (!found) return errorJson("Administrator not found", 404);
    const { target } = found;

    const body = await readJsonObject(request);
    if (!body) return errorJson("Invalid request body", 400);

    const data: { fullName?: string; email?: string; contactNumber?: string } = {};
    const changes: AuditChanges = {};

    if (body.fullName !== undefined) {
      const fullName = cleanString(body.fullName, 100);
      if (!fullName) return errorJson("Full name cannot be empty", 400);
      if (fullName !== target.fullName) {
        data.fullName = fullName;
        changes.fullName = { from: target.fullName, to: fullName };
      }
    }
    if (body.email !== undefined) {
      const email = cleanString(body.email, 254)?.toLowerCase();
      if (!email || !EMAIL.test(email)) return errorJson("A valid email address is required", 400);
      if (email !== target.email) {
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return errorJson("Another account already uses that email", 409);
        data.email = email;
        changes.email = { from: target.email, to: email };
      }
    }
    if (body.phone !== undefined && body.phone !== "") {
      const phone = parseE164(body.phone);
      if (!phone) return errorJson("Enter a valid phone number", 400);
      const current = parseE164(decryptPIIOrNull(target.contactNumber));
      if (phone !== current) {
        data.contactNumber = encryptPII(phone)!;
        changes.contactNumber = { from: current, to: phone };
      }
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ success: true, unchanged: true });

    await prisma.user.update({ where: { id: target.id }, data });
    await writeAudit(request, target.id, "ADMIN_UPDATED", `By primary admin ${primary.id}`, changes);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update admin:", error);
    return errorJson("Internal Server Error", 500);
  }
}

/**
 * Account actions, primary admin only: { action: "reset_password" | "reset_2fa" | "demote" }.
 *  - reset_password: sets a new (generated or supplied) password, signs the admin out everywhere and, through the
 *    existing rule, makes their next sign-in also need a code texted to their phone.
 *  - reset_2fa: removes the authenticator; at next sign-in they confirm a texted code and enrol a new one.
 *  - demote: removes administrator access (the account stays as STAFF, and its history is kept).
 * The primary administrator's own account cannot be demoted or have its credentials reset from here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const primary = await requirePrimaryAdmin();
    if (!primary) return (await requireAdmin()) ? forbidden() : unauthorized();
    if (!(await rateLimit("adminManage", primary.id)).success) return tooMany();

    const found = await load((await params).id);
    if (!found) return errorJson("Administrator not found", 404);
    const { target, isPrimary } = found;
    if (isPrimary) return errorJson("The primary administrator can't be changed this way. Use the operator scripts (reset-2fa) or the password reset email.", 403);

    const body = await readJsonObject(request);
    const action = body?.action;

    if (action === "reset_password") {
      const supplied = typeof body?.password === "string" && body.password.length > 0;
      const password = supplied ? (body!.password as string) : generateTempPassword();
      const passwordError = validatePassword(password, { fullName: target.fullName, email: target.email });
      if (passwordError) return errorJson(passwordError, 400);

      await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: await hashPassword(password), resetToken: null, resetTokenExpiry: null, tokenVersion: { increment: 1 } },
      });
      // Same trail a self-service reset leaves, so this admin's next sign-in also needs the texted code.
      await writeAudit(request, target.id, "PASSWORD_RESET_COMPLETED", `Set by primary admin ${primary.id}`);
      return NextResponse.json({ success: true, ...(supplied ? {} : { temporaryPassword: password }) });
    }

    if (action === "reset_2fa") {
      await resetTwoFactor(target.id);
      await writeAudit(request, target.id, "TOTP_RESET_BY_ADMIN", `By primary admin ${primary.id}`);
      return NextResponse.json({ success: true });
    }

    if (action === "demote") {
      await prisma.user.update({ where: { id: target.id }, data: { role: "STAFF", tokenVersion: { increment: 1 } } });
      await writeAudit(request, target.id, "ROLE_CHANGED", `Administrator access removed by primary admin ${primary.id}`, { role: { from: "ADMIN", to: "STAFF" } });
      return NextResponse.json({ success: true });
    }

    return errorJson("Unknown action", 400);
  } catch (error) {
    console.error("Failed to run admin action:", error);
    return errorJson("Internal Server Error", 500);
  }
}
