import nodemailer from 'nodemailer';
import type { CustomerPreferences } from '@/lib/customer-preferences';

export type CustomerSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveDefaults(provider: string): { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number; secure: boolean } {
  const id = provider.trim().toLowerCase();
  if (id === 'gmail') {
    return { smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993, secure: true };
  }
  if (id === 'outlook') {
    return { smtpHost: 'smtp.office365.com', smtpPort: 587, imapHost: 'outlook.office365.com', imapPort: 993, secure: false };
  }
  return { smtpHost: '', smtpPort: 587, imapHost: '', imapPort: 993, secure: false };
}

export function resolveCustomerSmtpConfig(preferences: Pick<CustomerPreferences, 'mail_provider' | 'mail_address' | 'mail_display_name' | 'mail_password' | 'mail_smtp_host' | 'mail_smtp_port' | 'mail_use_ssl'>): CustomerSmtpConfig {
  const provider = normalizeText(preferences.mail_provider).toLowerCase();
  const address = normalizeText(preferences.mail_address);
  const password = normalizeText(preferences.mail_password);
  if (!address || !password) throw new Error('Mail-Zugangsdaten fehlen.');

  const defaults = resolveDefaults(provider);
  const smtpHost = normalizeText(preferences.mail_smtp_host) || defaults.smtpHost;
  const smtpPort = Math.max(1, Math.round(Number(preferences.mail_smtp_port || defaults.smtpPort)));
  const secure = provider === 'gmail' ? true : (provider === 'outlook' ? false : Boolean(preferences.mail_use_ssl || defaults.secure || smtpPort === 465));

  if (!smtpHost) throw new Error('SMTP-Host fehlt.');
  const displayName = normalizeText(preferences.mail_display_name);
  const from = displayName ? `${displayName} <${address}>` : address;

  return {
    host: smtpHost,
    port: smtpPort,
    secure,
    user: address,
    pass: password,
    from,
    replyTo: address,
  };
}

export function createCustomerSmtpTransport(config: CustomerSmtpConfig) {
  const connectionTimeout = Math.max(1000, Math.round(Number(process.env.CUSTOMER_SMTP_CONNECTION_TIMEOUT_MS ?? '8000')));
  const greetingTimeout = Math.max(1000, Math.round(Number(process.env.CUSTOMER_SMTP_GREETING_TIMEOUT_MS ?? '8000')));
  const socketTimeout = Math.max(1000, Math.round(Number(process.env.CUSTOMER_SMTP_SOCKET_TIMEOUT_MS ?? '15000')));

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    tls: {
      // Helps STARTTLS providers with SNI and avoids some handshake issues.
      servername: config.host,
    },
  });
}

