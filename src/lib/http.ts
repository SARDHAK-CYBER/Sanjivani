import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/ip";
import { rateLimit, type LimitName } from "@/lib/rate-limit";

export const errorJson = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

export const unauthorized = () => errorJson("Unauthorized", 401);
export const forbidden = () => errorJson("Forbidden", 403);
export const tooMany = (message = "Too many requests. Please try again later.") => errorJson(message, 429);

/** Parses a JSON object body; returns null for malformed JSON or a non-object (array, string, ...). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A non-empty trimmed string no longer than `max`, else null. */
export function cleanString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/** Resolves the client IP and applies an IP limit; returns a ready-made error response if blocked. */
export async function limitByIp(
  request: Request,
  name: LimitName
): Promise<{ ip: string; blocked: null } | { ip: null; blocked: NextResponse }> {
  const ip = getClientIp(request);
  if (!ip) return { ip: null, blocked: errorJson("Invalid request origin. Cannot resolve IP.", 400) };
  const result = await rateLimit(name, `ip:${ip}`);
  return result.success ? { ip, blocked: null } : { ip: null, blocked: tooMany() };
}

export const userAgentOf = (request: Request) => (request.headers.get("user-agent") || "Unknown").slice(0, 300);
