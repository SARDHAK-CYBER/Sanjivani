/**
 * Creates the first ADMIN account, with its authenticator app already set up. Replaces the old public
 * GET /api/auth/seed endpoint, which created admin@rru.edu with a hard-coded password for anyone who asked.
 *
 *   ADMIN_EMAIL=you@rru.edu ADMIN_PHONE=+919876543210 ADMIN_PASSWORD='...' npm run seed:admin
 *
 * The script prints a setup key (and otpauth:// link) for the administrator's authenticator app, plus recovery
 * codes. They are shown ONCE. Because the authenticator is provisioned here, the first administrator can sign
 * in with password + app code without depending on WhatsApp/SMS delivery being set up yet.
 *
 * ADMIN_PHONE is the administrator's contact number (used to reach them and to verify phone changes). Nothing is
 * defaulted; the script refuses to guess.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/crypto";
import { encryptPII } from "../src/lib/encryption";
import { validatePassword } from "../src/lib/password";
import { parseE164 } from "../src/lib/phone";
import { provisionTotp } from "../src/lib/two-factor";
import { formatSecret } from "../src/lib/totp";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const phone = parseE164(process.env.ADMIN_PHONE);
  const fullName = process.env.ADMIN_NAME?.trim() || "C2 Administrator";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL is required and must be a valid email.");
  if (!phone) throw new Error("ADMIN_PHONE is required and must be a valid phone number (e.g. +919876543210).");
  const passwordError = validatePassword(password, { fullName, email });
  if (passwordError) throw new Error(`ADMIN_PASSWORD rejected: ${passwordError}.`);

  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error(`A user with email ${email} already exists. Nothing was changed.`);
  }

  const admin = await prisma.user.create({
    data: {
      email,
      fullName,
      role: "ADMIN",
      passwordHash: await hashPassword(password!),
      contactNumber: encryptPII(phone),
      uii: `RRU-UII-${randomBytes(4).toString("hex").toUpperCase()}`,
    },
  });
  const totp = await provisionTotp(admin);

  console.log(`Admin created: ${admin.email}`);
  console.log("\nAuthenticator app: add an account and choose \"enter a setup key\":");
  console.log(`  Account : ${admin.email}`);
  console.log(`  Key     : ${formatSecret(totp.secret)}   (time-based, 6 digits)`);
  console.log(`  Link    : ${totp.uri}`);
  console.log("\nRecovery codes (each works once; store them somewhere safe. They are not shown again):");
  for (const code of totp.recoveryCodes) console.log(`  ${code}`);
}

main()
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
