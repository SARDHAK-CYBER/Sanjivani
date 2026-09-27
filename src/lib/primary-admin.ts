import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

/**
 * The primary administrator is the earliest-created ADMIN account (the one `npm run seed:admin` made). Only the
 * primary can add, edit or remove other administrators, and nobody can demote the primary, so there is always
 * exactly one account that can recover the others. Derived, not stored: no extra column to drift out of sync.
 */
export async function getPrimaryAdminId(): Promise<string | null> {
  const primary = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return primary?.id ?? null;
}

/** The signed-in admin if they are also the primary administrator. */
export async function requirePrimaryAdmin(): Promise<User | null> {
  const admin = await requireAdmin();
  return admin && admin.id === (await getPrimaryAdminId()) ? admin : null;
}
