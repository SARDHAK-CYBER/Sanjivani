import type { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { sessionTtlSeconds, signSessionToken } from "@/lib/tokens";

/** Starts a session: sets the signed, HttpOnly session cookie on `response`. */
export async function setSessionCookie(
  response: NextResponse,
  user: { id: string; email: string; role: string; tokenVersion: number }
): Promise<NextResponse> {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await signSessionToken(user),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionTtlSeconds(user.role),
  });
  return response;
}
