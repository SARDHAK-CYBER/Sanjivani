/**
 * One-minute check that your Fast2SMS credentials actually work, using your own phone. It sends a
 * throw-away code straight through the same transport the app uses; the code is not stored and
 * unlocks nothing.
 *
 *   npm run otp:smoke -- +919876543210
 *
 * "accepted by Fast2SMS" means the API took the request; the real proof is the message arriving on
 * the phone, quickly, with the code in it. If it fails, the error explains what Fast2SMS answered.
 */
import "dotenv/config";
import { randomInt } from "crypto";
import { fast2smsConfig, isAllowedNumber } from "../src/lib/otp/config";
import { deliverCode } from "../src/lib/otp/transport";
import { parseE164 } from "../src/lib/phone";

async function main() {
  const phone = parseE164(process.argv[2]);
  if (!phone) throw new Error("Usage: npm run otp:smoke -- +919876543210");
  if (!isAllowedNumber(phone)) throw new Error(`${phone} is outside OTP_ALLOWED_COUNTRY_CODES, so the app would refuse it too.`);

  fast2smsConfig(); // throws OtpConfigError early with a clear message if FAST2SMS_API_KEY is missing

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const started = Date.now();
  try {
    await deliverCode(phone, code);
    console.log(`✔ accepted by Fast2SMS in ${Date.now() - started} ms. Check ${phone} for code ${code}.`);
  } catch (error) {
    console.error(`✖ ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
