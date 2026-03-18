import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';
import { createCustomerSmtpTransport, resolveCustomerSmtpConfig } from '@/lib/customer-mailer';

export const dynamic = 'force-dynamic';

function resolveProviderDefaults(provider: string) {
  const id = provider.trim().toLowerCase();
  if (id === 'gmail') {
    return { imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com', imapPort: 993, smtpPort: 465, secure: true };
  }
  if (id === 'outlook') {
    return { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587, secure: false };
  }
  return { imapHost: '', smtpHost: '', imapPort: 993, smtpPort: 587, secure: false };
}

export async function POST(request: Request) {
  const auth = requireApiUser(request);
  if (auth) return auth;
  try {
    const user = requireUser(request);
    const preferences = ensureCustomerPreferences(user.id);

    const mailAddress = preferences.mail_address?.trim();
    const mailPassword = preferences.mail_password?.trim();
    if (!mailAddress || !mailPassword) {
      return NextResponse.json({ ok: false, error: 'Mail-Zugangsdaten fehlen.' }, { status: 400 });
    }

    const provider = preferences.mail_provider?.trim().toLowerCase();
    const defaults = resolveProviderDefaults(provider || '');
    const imapHost = preferences.mail_imap_host || defaults.imapHost;
    const smtpHost = preferences.mail_smtp_host || defaults.smtpHost;
    const useSsl = provider === 'gmail' ? true : (provider === 'outlook' ? false : Boolean(preferences.mail_use_ssl || defaults.secure));

    const results: Record<string, unknown> = {
      checked_at: new Date().toISOString(),
      provider: provider || 'custom',
      imap: null,
      smtp: null,
    };

    if (imapHost) {
      try {
        const client = new ImapFlow({
          host: imapHost,
          port: Number(preferences.mail_imap_port || defaults.imapPort || 993),
          secure: useSsl,
          auth: { user: mailAddress, pass: mailPassword },
          logger: false,
        });
        try {
          await client.connect();
          const lock = await client.getMailboxLock('INBOX');
          try {
            const status = await client.status('INBOX', { messages: true, unseen: true });
            results.imap = { ok: true, host: imapHost, messages: status.messages ?? 0, unseen: status.unseen ?? 0 };
          } finally {
            lock.release();
          }
        } finally {
          try { await client.logout(); } catch {}
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.imap = { ok: false, host: imapHost, error: message.slice(0, 240) };
      }
    }

    if (smtpHost) {
      try {
        const config = resolveCustomerSmtpConfig(preferences);
        const transporter = createCustomerSmtpTransport(config);
        await transporter.verify();
        results.smtp = { ok: true, host: config.host, port: config.port, secure: config.secure };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.smtp = { ok: false, host: smtpHost, error: message.slice(0, 240) };
      }
    }

    const ok = Boolean((results.imap as any)?.ok || (results.smtp as any)?.ok);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Mailbox Test fehlgeschlagen.', ...results }, { status: 200 });
    }
    return NextResponse.json({ ok: true, ...results }, { status: 200 });

    return NextResponse.json({ ok: false, error: 'IMAP- oder SMTP-Host fehlt.' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/customer/mail/test error:', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
