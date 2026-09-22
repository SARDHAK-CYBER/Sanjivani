import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { verifySessionToken } from "@/lib/tokens";

/**
 * Coarse gate in front of everything admin-only. It only checks the signed token, so it is a fast
 * first line, not the last one: every handler behind it re-checks against the database with
 * requireAdmin() (src/lib/auth-guard.ts), which also catches demoted users and revoked sessions.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const deny = (status: 401 | 403, message: string) =>
    isApi
      ? NextResponse.json({ error: message }, { status })
      : NextResponse.redirect(new URL("/login", request.url));

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return deny(401, "Unauthorized");

  const claims = await verifySessionToken(token);
  if (!claims) {
    const response = deny(401, "Invalid or expired token.");
    if (!isApi) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (claims.role !== "ADMIN") return deny(403, "Forbidden. Admin privileges required.");
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/members/:path*", "/api/assets/:path*"],
};
