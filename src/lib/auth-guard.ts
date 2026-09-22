import { cookies } from "next/headers";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE } from "@/lib/constants";
import { verifySessionToken } from "@/lib/tokens";

/**
 * The signed-in member for this request, or null.
 *
 * The role and account state come from the database on every call, not from the token: demoting a
 * user or bumping their tokenVersion (password reset) takes effect immediately instead of when the
 * JWT expires.
 */
export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.id } });
  if (!user || user.tokenVersion !== claims.tokenVersion) return null;
  return user;
}

/** The signed-in user if (and only if) they are currently an ADMIN. */
export async function requireAdmin(): Promise<User | null> {
  const user = await getSessionUser();
  return user && user.role === "ADMIN" ? user : null;
}
