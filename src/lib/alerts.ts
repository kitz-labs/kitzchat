import nodemailer from 'nodemailer';
import { readSettings } from '@/lib/settings';
import { getCanonicalBaseUrl } from '@/lib/public-url';

type AlertChannelResult = {
  ok: boolean;
  detail?: string;
};

type AlertFanoutResult = {
  email: AlertChannelResult;
  telegram: AlertChannelResult;
};

function getBaseUrl() {
  return getCanonicalBaseUrl();
}

function getAlertRecipients() {
  return (process.env.KITZCHAT_ALERT_EMAILS || 'ceo@aikitz.at')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getEmailTransport() {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASSWORD || '';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendAlertEmail(subject: string, lines: string[]): Promise<AlertChannelResult> {
  const transporter = getEmailTransport();
  if (!transporter) {
    return { ok: false, detail: 'email_not_configured' };
  }

  const recipients = getAlertRecipients();
  if (recipients.length === 0) {
    return { ok: false, detail: 'email_recipient_missing' };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: recipients.join(', '),
    subject,
    text: lines.join('\n'),
  });

  return { ok: true };
}

export async function sendTelegramAlert(message: string): Promise<AlertChannelResult> {
  const settings = (() => {
    try {
      return readSettings();
    } catch {
      return {};
    }
  })();

  const enabled = settings.telegram?.enabled ?? true;
  const token = (settings.telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (settings.telegram?.chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!enabled) return { ok: false, detail: 'telegram_disabled' };
  if (!token || !chatId) return { ok: false, detail: 'telegram_not_configured' };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram_send_failed:${body.slice(0, 300)}`);
  }

  return { ok: true };
}

export async function sendOperationsAlert(subject: string, summary: string, detailLines: string[]): Promise<AlertFanoutResult> {
  const footer = [``, `KitzChat`, `Basis-URL: ${getBaseUrl()}`];
  const message = [subject, '', summary, ...detailLines, ...footer].join('\n');

  const [email, telegram] = await Promise.all([
    sendAlertEmail(subject, [summary, '', ...detailLines, ...footer]).catch((error) => ({ ok: false, detail: error instanceof Error ? error.message : 'email_failed' })),
    sendTelegramAlert(message).catch((error) => ({ ok: false, detail: error instanceof Error ? error.message : 'telegram_failed' })),
  ]);

  return { email, telegram };
}
