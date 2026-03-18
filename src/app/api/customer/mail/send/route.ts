import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences, isMailAgentConnected } from '@/lib/customer-preferences';
import { createCustomerSmtpTransport, resolveCustomerSmtpConfig } from '@/lib/customer-mailer';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type DraftAttachmentInput = { upload_id?: number; name?: string };

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
      attachments?: DraftAttachmentInput[];
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

    const attachmentsInput = Array.isArray(body.attachments) ? body.attachments : [];
    const normalizedAttachmentIds = attachmentsInput
      .map((item) => Math.max(0, Math.round(Number(item?.upload_id))))
      .filter((id) => Number.isInteger(id) && id > 0);

    const MAX_ATTACHMENTS = 8;
    const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
    if (normalizedAttachmentIds.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ ok: false, error: `Zu viele Anhaenge (max ${MAX_ATTACHMENTS}).` }, { status: 400 });
    }

    const config = resolveCustomerSmtpConfig(preferences);
    const transporter = createCustomerSmtpTransport(config);

    // Prevent spoofing: only allow the authenticated mailbox as sender.
    const requestedFrom = typeof body.from === 'string' ? body.from.trim() : '';
    const from = requestedFrom && requestedFrom.includes(config.user) ? requestedFrom : config.from;
    const replyTo = typeof body.reply_to === 'string' && body.reply_to.trim() ? body.reply_to.trim() : (config.replyTo || undefined);

    const mailAttachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
    let totalBytes = 0;
    for (const uploadId of normalizedAttachmentIds) {
      const row = getDb()
        .prepare('SELECT id, user_id, original_name, mime_type, size_bytes, storage_path FROM chat_uploads WHERE id = ?')
        .get(uploadId) as { id: number; user_id: number; original_name: string; mime_type: string | null; size_bytes: number; storage_path: string } | undefined;
      if (!row || (user.role !== 'admin' && row.user_id !== user.id)) {
        return NextResponse.json({ ok: false, error: `Anhang nicht gefunden (upload_id ${uploadId}).` }, { status: 404 });
      }
      const size = Math.max(0, Math.round(Number(row.size_bytes || 0)));
      totalBytes += size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json({ ok: false, error: `Anhaenge zu gross (max ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB).` }, { status: 400 });
      }
      const content = await fs.readFile(row.storage_path);
      mailAttachments.push({
        filename: row.original_name,
        content,
        contentType: row.mime_type || undefined,
      });
    }

    const result = await transporter.sendMail({
      from,
      replyTo,
      to: toList.join(', '),
      subject,
      text,
      attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
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
