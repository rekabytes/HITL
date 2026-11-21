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

/** Sends a plain-text mail if SMTP is configured. Never throws. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const t = getTransport();
  if (!t) return;
  try {
    await t.sendMail({ from: env.smtp!.from, to, subject, text });
  } catch (err) {
    console.warn("[mail] send failed:", err instanceof Error ? err.message : err);
  }
}
