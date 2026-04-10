/**
 * Email delivery adapter — Task 1.8.5
 *
 * Uses Nodemailer with SMTP transport.
 * - Locally: MailHog on port 1025 (EMAIL_SMTP_HOST / EMAIL_SMTP_PORT)
 * - Production: AWS SES via SMTP relay
 *
 * Configuration is read from environment variables so the adapter is
 * portable across environments without code changes.
 */

import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type SmtpConfig = {
  host: string;
  port: number;
  user: string | undefined;
  pass: string | undefined;
  from: string;
  secure: boolean;
};

function getSmtpConfig(): SmtpConfig {
  return {
    host: process.env['EMAIL_SMTP_HOST'] ?? 'localhost',
    port: parseInt(process.env['EMAIL_SMTP_PORT'] ?? '1025', 10),
    user: process.env['EMAIL_SMTP_USER'] || undefined,
    pass: process.env['EMAIL_SMTP_PASS'] || undefined,
    from:
      process.env['EMAIL_FROM'] ?? 'Fun Makers KSA <no-reply@local.dev>',
    secure: (process.env['EMAIL_SMTP_SECURE'] ?? 'false') === 'true',
  };
}

// ---------------------------------------------------------------------------
// Transporter singleton (lazy)
// ---------------------------------------------------------------------------

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const cfg = getSmtpConfig();
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth:
        cfg.user && cfg.pass
          ? { user: cfg.user, pass: cfg.pass }
          : undefined,
    });
  }
  return transporter;
}

/** Reset the transporter singleton — useful in tests. */
export function resetTransporter(): void {
  transporter = undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EmailPayload = {
  to: string;
  subject: string;
  /** Plain-text body */
  text?: string;
  /** HTML body (optional; same as text when omitted) */
  html?: string;
};

/**
 * Send a single email via SMTP.
 *
 * @throws If the SMTP transport rejects the message.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const cfg = getSmtpConfig();
  const transport = getTransporter();

  const mailOptions: SendMailOptions = {
    from: cfg.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text ?? payload.html ?? '',
    html: payload.html,
  };

  await transport.sendMail(mailOptions);
}

/**
 * Verify the SMTP connection is reachable.
 * Useful for startup health checks.
 */
export async function verifySmtpConnection(): Promise<void> {
  await getTransporter().verify();
}
