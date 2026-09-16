import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { env, isSmtpConfigured, isTest, mailDriver } from '@/config/env';
import { logger } from '@/lib/logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Three drivers behind one interface:
 *   • smtp    — Nodemailer against any SMTP provider (the default once SMTP is configured)
 *   • resend  — Resend's HTTP API (no SMTP egress needed on most PaaS)
 *   • console — logs the mail; the fallback so a fresh clone runs with zero mail config
 *
 * Sending is best-effort: a mail outage must not fail a registration or an order.
 */

/**
 * Pooling picks a different Nodemailer transport, and the two report results
 * differently — only the non-pooled `SentMessageInfo` carries `pending`. Nothing here
 * reads that field, so the union covers both without asserting which one runtime chose.
 */
type MailSentInfo = SMTPTransport.SentMessageInfo | SMTPPool.SentMessageInfo;

let transporter: Transporter<MailSentInfo> | null = null;

function getTransporter(): Transporter<MailSentInfo> | null {
  if (mailDriver !== 'smtp') return null;
  if (transporter) return transporter;
  if (!isSmtpConfigured) {
    logger.warn('MAIL_DRIVER=smtp but neither SMTP_SERVICE nor SMTP_HOST is set — mail disabled');
    return null;
  }

  const auth =
    env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined;

  // Annotated instead of inlined: spreading the service/host ternary directly into
  // `createTransport` leaves TypeScript with a union it cannot resolve to an overload.
  const options: SMTPTransport.Options = {
    // `service` resolves host/port/secure from Nodemailer's well-known list ("gmail", …);
    // without it we dial the host directly.
    ...(env.SMTP_SERVICE
      ? { service: env.SMTP_SERVICE }
      : { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE }),
    auth,
    // Without these a hung relay would keep a request-scoped promise alive indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };

  // `pool` selects the pooled overload and has to be the literal `true` to do so; a
  // plain boolean matches neither signature and falls through to the generic one.
  transporter = env.SMTP_POOL
    ? nodemailer.createTransport({ ...options, pool: true, maxConnections: 3 })
    : nodemailer.createTransport(options);

  return transporter;
}

/**
 * Optional boot-time handshake. Called from the bootstrap so a typo in SMTP credentials
 * surfaces at startup rather than silently on a user's first password reset. Never throws:
 * the API must still serve traffic when the mail relay is down.
 */
export async function verifyMailTransport(): Promise<boolean> {
  if (isTest || mailDriver !== 'smtp') return false;

  const smtp = getTransporter();
  if (!smtp) return false;

  try {
    await smtp.verify();
    logger.info(
      { driver: 'smtp', target: env.SMTP_SERVICE ?? `${env.SMTP_HOST}:${env.SMTP_PORT}`, pooled: env.SMTP_POOL },
      'SMTP transport ready',
    );
    return true;
  } catch (error) {
    logger.error({ err: error }, 'SMTP verification failed — email will be attempted anyway');
    return false;
  }
}

/** Releases pooled SMTP sockets so graceful shutdown is not held open by an idle connection. */
export function closeMailTransport(): void {
  transporter?.close();
  transporter = null;
}

/**
 * `getTestMessageUrl` is typed for the non-pooled transport, but it only reads
 * `response`, which both transports return — so this holds for either.
 */
function testMessageUrl(info: MailSentInfo): string | undefined {
  return nodemailer.getTestMessageUrl(info as SMTPTransport.SentMessageInfo) || undefined;
}

async function sendViaResend(message: MailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.warn('MAIL_DRIVER=resend but RESEND_API_KEY is missing — mail disabled');
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (isTest) return;

  try {
    if (mailDriver === 'resend') {
      await sendViaResend(message);
    } else if (mailDriver === 'smtp') {
      const smtp = getTransporter();
      if (!smtp) return;
      const info = await smtp.sendMail({ from: env.MAIL_FROM, ...message });
      logger.info(
        {
          to: message.to,
          subject: message.subject,
          messageId: info.messageId,
          // Populated only for Ethereal test accounts — a one-click preview in development.
          previewUrl: testMessageUrl(info),
        },
        'Mail sent (smtp)',
      );
    } else {
      logger.info({ to: message.to, subject: message.subject }, 'Mail (console driver)');
    }
  } catch (error) {
    // Never rethrow: a broken mail provider must not roll back a completed signup or order.
    logger.error({ err: error, to: message.to, subject: message.subject }, 'Failed to send email');
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <tr><td>
            <p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-.02em;">ShopWave</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:650;letter-spacing:-.02em;">${heading}</h1>
            <div style="font-size:15px;line-height:1.6;color:#3f3f46;">${body}</div>
            ${
              cta
                ? `<p style="margin:32px 0 0;">
                     <a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">${cta.label}</a>
                   </p>
                   <p style="margin:20px 0 0;font-size:13px;color:#71717a;word-break:break-all;">Or paste this link into your browser:<br/>${cta.url}</p>`
                : ''
            }
            <hr style="margin:32px 0 16px;border:none;border-top:1px solid #e4e4e7;"/>
            <p style="margin:0;font-size:12px;color:#a1a1aa;">You received this because an account exists at ShopWave. If this wasn't you, you can safely ignore it.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
  const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: 'Verify your ShopWave email address',
    html: layout(
      `Welcome, ${firstName}`,
      '<p>Confirm your email address to activate your account and start shopping.</p><p>This link expires in 24 hours.</p>',
      { label: 'Verify email', url },
    ),
    text: `Welcome to ShopWave. Verify your email: ${url}`,
  });
}

export async function sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
  const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to,
    subject: 'Reset your ShopWave password',
    html: layout(
      `Password reset, ${firstName}`,
      '<p>Use the button below to choose a new password. This link expires in 1 hour and can only be used once.</p><p>If you did not request this, no action is needed — your password stays unchanged.</p>',
      { label: 'Reset password', url },
    ),
    text: `Reset your ShopWave password: ${url}`,
  });
}

export async function sendOrderConfirmationEmail(
  to: string,
  params: { firstName: string; orderNumber: string; total: string; itemCount: number },
): Promise<void> {
  const url = `${env.CLIENT_URL}/orders`;
  await sendMail({
    to,
    subject: `Order ${params.orderNumber} confirmed`,
    html: layout(
      `Thanks, ${params.firstName}`,
      `<p>We've received your order <strong>${params.orderNumber}</strong>.</p>
       <p><strong>${params.itemCount}</strong> item(s) · Total <strong>${params.total}</strong></p>
       <p>We'll email you again as soon as it ships.</p>`,
      { label: 'View your orders', url },
    ),
    text: `Order ${params.orderNumber} confirmed. Total ${params.total}.`,
  });
}

export async function sendOrderStatusEmail(
  to: string,
  params: { firstName: string; orderNumber: string; status: string },
): Promise<void> {
  const readable = params.status.toLowerCase().replace(/_/g, ' ');
  await sendMail({
    to,
    subject: `Order ${params.orderNumber} is now ${readable}`,
    html: layout(
      `Order update`,
      `<p>Hi ${params.firstName}, your order <strong>${params.orderNumber}</strong> is now <strong>${readable}</strong>.</p>`,
      { label: 'Track order', url: `${env.CLIENT_URL}/orders` },
    ),
    text: `Order ${params.orderNumber} is now ${readable}.`,
  });
}
