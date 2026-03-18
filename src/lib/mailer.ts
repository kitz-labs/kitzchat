import nodemailer from 'nodemailer';
import { readSettings } from '@/lib/settings';
import { getAuthLinkBaseUrl, getCanonicalBaseUrl } from '@/lib/public-url';

export type MailSendResult = { ok: boolean; detail?: string };

type ResolvedEmailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

type ResolvedEmailBranding = {
  publicBaseUrl: string;
  signatureHtml: string | null;
  signatureText: string | null;
};

function getPublicBaseUrl(): string {
  return getCanonicalBaseUrl();
}

export function buildPublicUrl(pathname: string, params?: Record<string, string>): string {
  const base = getPublicBaseUrl();
  const url = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function buildPublicUrlFromRequest(request: Request, pathname: string, params?: Record<string, string>): string {
  const base = getAuthLinkBaseUrl(request);
  const url = new URL(pathname.startsWith('/') ? pathname : `/${pathname}`, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function resolveEmailBranding(): ResolvedEmailBranding {
  const settings = (() => {
    try {
      return readSettings();
    } catch {
      return {};
    }
  })();

  const signatureHtml = (settings.email?.signature_html?.trim() || process.env.EMAIL_SIGNATURE_HTML || '').trim() || null;
  const signatureText = (settings.email?.signature_text?.trim() || process.env.EMAIL_SIGNATURE_TEXT || '').trim() || null;

  return {
    publicBaseUrl: getPublicBaseUrl(),
    signatureHtml,
    signatureText,
  };
}

function getResolvedEmailConfig(): ResolvedEmailConfig | null {
  let settings: ReturnType<typeof readSettings> | null = null;
  try {
    settings = readSettings();
  } catch {
    settings = null;
  }

  const host = (settings?.email?.host?.trim() || process.env.EMAIL_HOST || process.env.SMTP_HOST || '').trim();
  const port = Number(settings?.email?.port ?? process.env.EMAIL_PORT ?? process.env.SMTP_PORT ?? 587);
  const user = (settings?.email?.user?.trim() || process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  const pass = (settings?.email?.password?.trim() || process.env.EMAIL_PASSWORD || process.env.SMTP_PASSWORD || '').trim();
  const from = (settings?.email?.from?.trim() || process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();

  if (!host || !user || !pass || !from) return null;
  if (!Number.isFinite(port) || port <= 0) return null;

  return { host, port, user, pass, from };
}

function getTransport() {
  const resolved = getResolvedEmailConfig();
  if (!resolved) return null;

  const connectionTimeout = Math.max(1000, Math.round(Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS ?? '5000')));
  const greetingTimeout = Math.max(1000, Math.round(Number(process.env.EMAIL_GREETING_TIMEOUT_MS ?? '5000')));
  const socketTimeout = Math.max(1000, Math.round(Number(process.env.EMAIL_SOCKET_TIMEOUT_MS ?? '10000')));

  return nodemailer.createTransport({
    host: resolved.host,
    port: resolved.port,
    secure: resolved.port === 465,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    auth: { user: resolved.user, pass: resolved.pass },
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(getTransport());
}

export function getEmailConfigStatus(): {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  has_password: boolean;
  public_base_url: string;
  signature_configured: boolean;
} {
  const resolved = getResolvedEmailConfig();
  const settings = (() => {
    try {
      return readSettings();
    } catch {
      return {};
    }
  })();

  const rawHost = (settings.email?.host?.trim() || process.env.EMAIL_HOST || process.env.SMTP_HOST || '').trim();
  const rawPort = Number(settings.email?.port ?? process.env.EMAIL_PORT ?? process.env.SMTP_PORT ?? 587);
  const rawUser = (settings.email?.user?.trim() || process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  const rawPass = (settings.email?.password?.trim() || process.env.EMAIL_PASSWORD || process.env.SMTP_PASSWORD || '').trim();
  const rawFrom = (settings.email?.from?.trim() || process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  const sigHtml = (settings.email?.signature_html?.trim() || process.env.EMAIL_SIGNATURE_HTML || '').trim();
  const sigText = (settings.email?.signature_text?.trim() || process.env.EMAIL_SIGNATURE_TEXT || '').trim();

  return {
    configured: Boolean(resolved),
    host: rawHost || null,
    port: Number.isFinite(rawPort) ? rawPort : null,
    user: rawUser || null,
    from: rawFrom || null,
    has_password: Boolean(rawPass),
    public_base_url: getPublicBaseUrl(),
    signature_configured: Boolean(sigHtml || sigText),
  };
}

export async function verifyEmailTransport(): Promise<MailSendResult> {
  const transport = getTransport();
  if (!transport) return { ok: false, detail: 'email_not_configured' };
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'verify_failed' };
  }
}

export async function sendUserEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<MailSendResult> {
  const transport = getTransport();
  if (!transport) return { ok: false, detail: 'email_not_configured' };
  const resolved = getResolvedEmailConfig();
  const from = resolved?.from || '';
  if (!from) return { ok: false, detail: 'email_from_missing' };

  const branding = resolveEmailBranding();
  const interpolate = (input: string) =>
    input
      .replaceAll('{{PUBLIC_BASE_URL}}', branding.publicBaseUrl)
      .replaceAll('{{EMAIL_FROM}}', from)
      .replaceAll('{{FROM_EMAIL}}', from);

  const text = branding.signatureText ? `${params.text}\n\n${interpolate(branding.signatureText)}` : params.text;
  const html = params.html
    ? (branding.signatureHtml
        ? `${params.html}\n\n<!--kitzchat-signature-->\n${interpolate(branding.signatureHtml)}`
        : params.html)
    : undefined;

  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text,
    html,
  });

  return { ok: true };
}
