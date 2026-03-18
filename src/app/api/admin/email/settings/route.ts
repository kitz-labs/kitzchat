import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getEmailConfigStatus, isEmailConfigured, sendUserEmail, verifyEmailTransport } from '@/lib/mailer';
import { readSettings, writeSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v : null;
}

function normalizePort(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const p = Math.round(n);
  if (p <= 0 || p > 65535) return null;
  return p;
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);
    const doVerify = url.searchParams.get('verify') === '1';
    const status = getEmailConfigStatus();
    const settings = readSettings();
    const transport = doVerify ? await verifyEmailTransport() : { ok: isEmailConfigured() };
    return NextResponse.json({
      status,
      transport,
      current: {
        public_base_url: settings.public_base_url ?? null,
        host: settings.email?.host ?? null,
        port: settings.email?.port ?? null,
        user: settings.email?.user ?? null,
        from: settings.email?.from ?? null,
        signature_html: settings.email?.signature_html ?? null,
        signature_text: settings.email?.signature_text ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load email settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load email settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      public_base_url?: string;
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      clear_password?: boolean;
      from?: string;
      signature_html?: string;
      signature_text?: string;
      clear_signature?: boolean;
    };

    const settings = readSettings();
    settings.public_base_url = normalizeText(body.public_base_url) ?? settings.public_base_url;
    settings.email = settings.email || {};

    const host = normalizeText(body.host);
    const user = normalizeText(body.user);
    const from = normalizeText(body.from);
    const port = body.port !== undefined ? normalizePort(body.port) : null;
    const password = normalizeText(body.password);
    const signatureHtml = typeof body.signature_html === 'string' ? body.signature_html : null;
    const signatureText = typeof body.signature_text === 'string' ? body.signature_text : null;

    if (host !== null) settings.email.host = host;
    if (user !== null) settings.email.user = user;
    if (from !== null) settings.email.from = from;
    if (port !== null) settings.email.port = port;
    if (body.clear_password === true) {
      delete settings.email.password;
    } else if (password !== null) {
      settings.email.password = password;
    }
    if (body.clear_signature === true) {
      delete settings.email.signature_html;
      delete settings.email.signature_text;
    } else {
      if (signatureHtml !== null) settings.email.signature_html = signatureHtml;
      if (signatureText !== null) settings.email.signature_text = signatureText;
    }

    writeSettings(settings);

    const status = getEmailConfigStatus();
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update email settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update email settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to = normalizeText(body.to);
    if (!to) return NextResponse.json({ error: 'Empfaenger E-Mail fehlt' }, { status: 400 });

    const res = await sendUserEmail({
      to,
      subject: 'KitzChat: SMTP Test',
      text: `SMTP Test OK (${new Date().toISOString()})`,
      html: `<p><b>SMTP Test OK</b> (${new Date().toISOString()})</p>`,
    });
    if (!res.ok) return NextResponse.json({ error: res.detail || 'send_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test email';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 });
  }
}
