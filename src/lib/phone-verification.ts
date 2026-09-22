import { prisma } from "@/lib/prisma";
import { verifyPhoneProofToken } from "@/lib/tokens";
import type { OtpPurpose } from "@/lib/otp/config";

/**
 * The trust boundary between "the user entered a correct OTP" (src/lib/otp/service.ts) and the routes
 * that act on it (login, register, bystander, change phone). A route never sees a code, only a proof
 * token, which this function checks is genuine, for the right purpose and number and account, and unspent.
 */

export type PhoneVerificationFailure = "unconfigured" | "invalid" | "mismatch" | "replayed";

export class PhoneVerificationError extends Error {
  constructor(
    public readonly reason: PhoneVerificationFailure,
    message: string
  ) {
    super(message);
    this.name = "PhoneVerificationError";
  }
}

/** Message safe to show to the end user for each failure. */
export function phoneErrorMessage(error: PhoneVerificationError): string {
  switch (error.reason) {
    case "unconfigured":
      return "Phone verification is not available right now. Please contact support.";
    case "mismatch":
      return "This is not the phone number registered to the account.";
    case "replayed":
      return "This verification was already used. Please request a new code.";
    default:
      return "Phone verification failed or expired. Please request a new code.";
  }
}

export async function verifyPhoneProof(
  proof: unknown,
  expected: { purpose: OtpPurpose; phone?: string; userId?: string }
): Promise<{ phone: string }> {
  if (typeof proof !== "string" || proof.length < 20 || proof.length > 2000) {
    throw new PhoneVerificationError("invalid", "Missing or malformed proof.");
  }
  const claims = await verifyPhoneProofToken(proof);
  if (!claims || claims.purpose !== expected.purpose) {
    throw new PhoneVerificationError("invalid", "Proof is invalid, expired or for another purpose.");
  }
  if (expected.userId !== undefined && claims.userId !== expected.userId) {
    throw new PhoneVerificationError("mismatch", "Proof belongs to another account.");
  }
  // Checked before the proof is spent, so a wrong-number attempt does not burn a legitimate code.
  if (expected.phone && claims.phone !== expected.phone) {
    throw new PhoneVerificationError("mismatch", "Verified phone does not match the expected number.");
  }

  // Spend it: only one request can set proofUsedAt on a verified challenge.
  const spent = await prisma.phoneOtp.updateMany({
    where: { id: claims.challengeId, consumedAt: { not: null }, proofUsedAt: null },
    data: { proofUsedAt: new Date() },
  });
  if (spent.count === 0) throw new PhoneVerificationError("replayed", "Proof already used.");

  return { phone: claims.phone };
}
