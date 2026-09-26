import "dotenv/config";
import { prisma } from "./src/lib/prisma";
import { hashRecoveryCode, normalizeRecoveryCode } from "./src/lib/two-factor";
import { decryptPIIOrNull } from "./src/lib/encryption";
(async () => {
  const u = await prisma.user.findUnique({ where: { email: "25bcscs016@student.rru.ac.in" } });
  console.log("phone decrypts:", decryptPIIOrNull(u!.contactNumber), "| totp secret decrypts:", !!decryptPIIOrNull(u!.totpSecretEnc), "| role:", u!.role);
  const rows = await prisma.recoveryCode.findMany({ where: { userId: u!.id } });
  console.log("recovery rows:", rows.length, "unused:", rows.filter((r) => !r.usedAt).length);
  for (const c of ["GCQH4-8F0TF", "GCT24-5QKCR", "T0TCG-Q7S0Q"]) {
    const h = hashRecoveryCode(normalizeRecoveryCode(c)!);
    console.log(c, "->", rows.some((r) => r.codeHash === h && !r.usedAt) ? "MATCHES unused row" : "no match");
  }
  await prisma.$disconnect();
})();
