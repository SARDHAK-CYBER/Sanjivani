import nodemailer from "nodemailer";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

/**
 * Sends a plain-text email through the SMTP server configured in SMTP_* env vars.
 * Throws if SMTP is not configured, so callers decide whether that is fatal.
 */
export async function sendMail(message: { to: string; subject: string; text: string }): Promise<void> {
  if (!mailConfigured()) throw new Error("SMTP is not configured (SMTP_HOST / SMTP_FROM).");

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });

  await transporter.sendMail({ from: process.env.SMTP_FROM, ...message });
}
