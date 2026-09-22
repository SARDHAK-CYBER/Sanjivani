/**
 * One-minute check that your MSG91 credentials, templates and DLT/WhatsApp approvals actually work, using
 * your own phone. It sends a throw-away code straight through the same transport the app uses; the code is
 * not stored and unlocks nothing.
 *
 *   npm run otp:smoke -- +919876543210            # every configured channel
 *   npm run otp:smoke -- +919876543210 whatsapp   # just one (whatsapp | sms)
 *
 * "accepted by MSG91" means the API took the request; the real proof is the message arriving on the phone,
 * quickly, with the code in it. If a channel fails, the error explains what MSG91 answered.
 */
import "dotenv/config";
import { randomInt } from "crypto";
import { availableChannels, isAllowedNumber, msg91Config, type OtpChannel } from "../src/lib/otp/config";
import { deliverCode } from "../src/lib/otp/transport";
import { parseE164 } from "../src/lib/phone";

async function main() {
  const phone = parseE164(process.argv[2]);
  if (!phone) throw new Error("Usage: npm run otp:smoke -- +919876543210 [whatsapp|sms]");
  if (!isAllowedNumber(phone)) throw new Error(`${phone} is outside OTP_ALLOWED_COUNTRY_CODES, so the app would refuse it too.`);

  const cfg = msg91Config();
  console.log(`  SMS template id      : ${cfg.smsTemplateId ?? "(not set)"}  variable: ${cfg.smsVariable}`);
  console.log(`  WhatsApp number/tmpl : ${cfg.whatsappNumber ?? "(not set)"} / ${cfg.whatsappTemplate ?? "(not set)"} / ns ${cfg.whatsappNamespace ?? "(not set)"}`);

  const available = availableChannels();
  const wanted = process.argv[3] as OtpChannel | undefined;
  const channels = wanted ? available.filter((c) => c === wanted) : available;
  if (channels.length === 0) throw new Error(wanted ? `Channel "${wanted}" is not configured.` : "No channel is configured. See .env.example.");

  let failed = 0;
  for (const channel of channels) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const started = Date.now();
    try {
      await deliverCode(channel, phone, code);
      console.log(`✔ ${channel}: accepted by MSG91 in ${Date.now() - started} ms. Check ${phone} for code ${code}.`);
    } catch (error) {
      failed++;
      console.error(`✖ ${channel}: ${(error as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
