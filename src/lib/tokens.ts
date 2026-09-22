import { SignJWT, jwtVerify } from "jose";
import { getBystanderSecret, getJwtSecret } from "@/lib/secrets";
import { ADMIN_SESSION_SECONDS, MEMBER_SESSION_SECONDS } from "@/lib/constants";

// Every token type has its own `aud`, and jwtVerify enforces it. A token minted for one
// purpose (e.g. the password-only "2fa-pending" token) therefore cannot be presented as another
// (e.g. a full session), even though session and 2fa-pending share a signing key.
type Audience = "session" | "2fa-pending" | "bystander" | "phone-proof" | "totp-enroll";

const ISSUER = "sanjivani";
const encoder = new TextEncoder();

function keyFor(aud: Audience): Uint8Array {
  return encoder.encode(aud === "bystander" ? getBystanderSecret() : getJwtSecret());
}

async function sign(aud: Audience, subject: string, claims: Record<string, unknown>, ttlSeconds: number) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyFor(aud));
}

async function verify(aud: Audience, token: string) {
  try {
    const { payload } = await jwtVerify(token, keyFor(aud), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: aud,
    });
    return payload.sub ? payload : null;
  } catch {
    return null;
  }
}

export type SessionClaims = { id: string; email: string; role: string; tokenVersion: number };

export function sessionTtlSeconds(role: string): number {
  return role === "ADMIN" ? ADMIN_SESSION_SECONDS : MEMBER_SESSION_SECONDS;
}

export function signSessionToken(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return sign(
    "session",
    user.id,
    { email: user.email, role: user.role, tv: user.tokenVersion },
    sessionTtlSeconds(user.role)
  );
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  const payload = await verify("session", token);
  if (!payload || typeof payload.tv !== "number") return null;
  return {
    id: payload.sub as string,
    email: String(payload.email ?? ""),
    role: String(payload.role ?? ""),
    tokenVersion: payload.tv,
  };
}

/** Issued after the password step; only good for finishing the phone (2FA) step. */
export function signPendingTwoFactorToken(user: { id: string; tokenVersion: number }) {
  return sign("2fa-pending", user.id, { tv: user.tokenVersion }, 5 * 60);
}

export async function verifyPendingTwoFactorToken(token: string): Promise<{ id: string; tokenVersion: number } | null> {
  const payload = await verify("2fa-pending", token);
  if (!payload || typeof payload.tv !== "number") return null;
  return { id: payload.sub as string, tokenVersion: payload.tv };
}

export function signBystanderToken(bystanderId: string) {
  return sign("bystander", bystanderId, {}, 60 * 60);
}

export async function verifyBystanderToken(token: string): Promise<{ bystanderId: string } | null> {
  const payload = await verify("bystander", token);
  return payload ? { bystanderId: payload.sub as string } : null;
}

export type PhoneProofClaims = { challengeId: string; phone: string; purpose: string; userId?: string };

/** Issued once an OTP code has been entered correctly; good for one use within 10 minutes. */
export function signPhoneProofToken(claims: PhoneProofClaims) {
  return sign("phone-proof", claims.challengeId, { ph: claims.phone, pu: claims.purpose, ...(claims.userId && { uid: claims.userId }) }, 10 * 60);
}

export async function verifyPhoneProofToken(token: string): Promise<PhoneProofClaims | null> {
  const payload = await verify("phone-proof", token);
  if (!payload || typeof payload.ph !== "string" || typeof payload.pu !== "string") return null;
  return {
    challengeId: payload.sub as string,
    phone: payload.ph,
    purpose: payload.pu,
    userId: typeof payload.uid === "string" ? payload.uid : undefined,
  };
}

/**
 * Issued after password + a phone code: the holder may set up (or, after losing the old one, replace) the
 * authenticator app. It is not a session. It dies as soon as enrolment completes (tokenVersion changes).
 */
export function signTotpEnrollToken(user: { id: string; tokenVersion: number }, recovery: boolean) {
  return sign("totp-enroll", user.id, { tv: user.tokenVersion, rec: recovery }, 10 * 60);
}

export async function verifyTotpEnrollToken(token: string): Promise<{ id: string; tokenVersion: number; recovery: boolean } | null> {
  const payload = await verify("totp-enroll", token);
  if (!payload || typeof payload.tv !== "number") return null;
  return { id: payload.sub as string, tokenVersion: payload.tv, recovery: payload.rec === true };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
