import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  const smtp = env.smtp;
  transport = smtp
    ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      })
    : null;
  return transport;
}

export type MailResult = { sent: true } | { sent: false; reason: string };

/** Sends a plain-text mail if SMTP is configured. Never throws. */
export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const t = getTransport();
  if (!t) return { sent: false, reason: "Email is not set up (SMTP_HOST is empty)." };
  try {
    await t.sendMail({ from: env.smtp!.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[mail] send failed:", reason);
    return { sent: false, reason: `Email failed: ${reason}` };
  }
}
