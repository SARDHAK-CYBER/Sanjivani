/**
 * Operator tool: removes a user's authenticator app and recovery codes, and signs them out everywhere.
 *
 *   npm run reset-2fa -- user@rru.edu
 *
 * Members are then asked to set up a new authenticator at their next sign-in (after confirming their phone by
 * WhatsApp/SMS). Administrators cannot do that themselves (a stolen password plus a SIM swap must not be enough),
 * so for an ADMIN this script immediately provisions a NEW authenticator and prints its setup key and recovery
 * codes, exactly as seed-admin does. Only someone with access to the server and database can run it.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { provisionTotp, resetTwoFactor } from "../src/lib/two-factor";
import { formatSecret } from "../src/lib/totp";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run reset-2fa -- user@rru.edu");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}.`);

  await resetTwoFactor(user.id);

  if (user.role === "ADMIN") {
    const totp = await provisionTotp(user);
    await prisma.auditLog.create({ data: { userId: user.id, action: "TOTP_RESET_BY_OPERATOR", deviceFingerprint: "scripts/reset-2fa (new authenticator provisioned)", geoId: "server" } });
    console.log(`Reset ${email} (ADMIN). New authenticator: enter this setup key in the app (time-based, 6 digits):`);
    console.log(`  Key  : ${formatSecret(totp.secret)}`);
    console.log(`  Link : ${totp.uri}`);
    console.log("\nNew recovery codes (shown once):");
    for (const code of totp.recoveryCodes) console.log(`  ${code}`);
  } else {
    await prisma.auditLog.create({ data: { userId: user.id, action: "TOTP_RESET_BY_OPERATOR", deviceFingerprint: "scripts/reset-2fa", geoId: "server" } });
    console.log(`Reset ${email}. They were signed out everywhere and will set up a new authenticator at their next sign-in.`);
  }
}

main()
  .catch((error) => {
    console.error(`Reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
