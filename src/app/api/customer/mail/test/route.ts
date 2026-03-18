import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';

export const dynamic = 'force-dynamic';

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
    const imapHost = preferences.mail_imap_host || (provider === 'gmail' ? 'imap.gmail.com' : '');
    const smtpHost = preferences.mail_smtp_host || (provider === 'gmail' ? 'smtp.gmail.com' : '');
    const useSsl = provider === 'gmail' ? true : Boolean(preferences.mail_use_ssl);

    if (imapHost) {
      const client = new ImapFlow({
        host: imapHost,
        port: Number(preferences.mail_imap_port || 993),
        secure: useSsl,
        auth: { user: mailAddress, pass: mailPassword },
      });
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
          const status = await client.status('INBOX', { messages: true, unseen: true });
          return NextResponse.json({
            ok: true,
            source: 'imap',
            messages: status.messages ?? 0,
            unseen: status.unseen ?? 0,
            checked_at: new Date().toISOString(),
          });
        } finally {
          lock.release();
        }
      } finally {
        try { await client.logout(); } catch {}
      }
    }

    if (smtpHost) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(preferences.mail_smtp_port || 465),
        secure: useSsl,
        auth: { user: mailAddress, pass: mailPassword },
      });
      const ok = await transporter.verify().catch((error) => {
        throw new Error(String(error));
      });
      return NextResponse.json({ ok: Boolean(ok), source: 'smtp', checked_at: new Date().toISOString() });
    }

    return NextResponse.json({ ok: false, error: 'IMAP- oder SMTP-Host fehlt.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
