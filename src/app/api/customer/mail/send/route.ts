import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences, isMailAgentConnected } from '@/lib/customer-preferences';
import { createCustomerSmtpTransport, resolveCustomerSmtpConfig } from '@/lib/customer-mailer';

export const dynamic = 'force-dynamic';

function normalizeRecipientList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((item): item is string => typeof item === 'string').map((v) => v.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function isLikelyEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export async function POST(request: Request) {
  const auth = requireApiUser(request);
  if (auth) return auth;

  try {
    const user = requireUser(request);
    const preferences = ensureCustomerPreferences(user.id);

    if (!isMailAgentConnected(preferences)) {
      return NextResponse.json({ ok: false, error: 'MailAgent ist nicht verbunden.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as {
      to?: string[] | string;
      subject?: string;
      text?: string;
      from?: string;
      reply_to?: string;
    };

    const toList = normalizeRecipientList(body.to);
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (toList.length === 0 || !subject || !text) {
      return NextResponse.json({ ok: false, error: 'to, subject und text sind erforderlich.' }, { status: 400 });
    }
    if (toList.some((addr) => !isLikelyEmail(addr))) {
      return NextResponse.json({ ok: false, error: 'Mindestens eine Empfaengeradresse ist ungueltig.' }, { status: 400 });
    }

    const config = resolveCustomerSmtpConfig(preferences);
    const transporter = createCustomerSmtpTransport(config);

    // Prevent spoofing: only allow the authenticated mailbox as sender.
    const requestedFrom = typeof body.from === 'string' ? body.from.trim() : '';
    const from = requestedFrom && requestedFrom.includes(config.user) ? requestedFrom : config.from;
    const replyTo = typeof body.reply_to === 'string' && body.reply_to.trim() ? body.reply_to.trim() : (config.replyTo || undefined);

    const result = await transporter.sendMail({
      from,
      replyTo,
      to: toList.join(', '),
      subject,
      text,
    });

    return NextResponse.json({
      ok: true,
      message_id: result.messageId || null,
      accepted: result.accepted || [],
      rejected: result.rejected || [],
      envelope: result.envelope || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('POST /api/customer/mail/send error:', error);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}

