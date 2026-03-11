import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { inspectPolicyContent, reportPolicyIncident } from '@/lib/policy-enforcement';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const db = getDb();
    db.prepare("UPDATE support_messages SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND sender = 'support' AND read_at IS NULL").run(user.id);
    const rows = db
      .prepare('SELECT id, sender, message, created_at FROM support_messages WHERE user_id = ? ORDER BY created_at ASC, id ASC')
      .all(user.id) as Array<{ id: number; sender: string; message: string; created_at: string }>;

    return NextResponse.json({ messages: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load support chat';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load support chat' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const body = (await request.json()) as { message?: string };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return NextResponse.json({ error: 'Nachricht erforderlich' }, { status: 400 });
    }

    const match = inspectPolicyContent(message);
    if (match.blocked) {
      await reportPolicyIncident(user, { source: 'support', content: message, match });
      return NextResponse.json({ error: match.userMessage || 'Diese Nachricht wurde blockiert.' }, { status: 403 });
    }

    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO support_messages (user_id, sender, message) VALUES (?, ?, ?)').run(user.id, 'customer', message);
      db.prepare('INSERT INTO support_messages (user_id, sender, message, read_at) VALUES (?, ?, ?, NULL)').run(
        user.id,
        'support',
        'Vielen Dank fuer Ihre Nachricht. Wir melden uns schnellstmoeglich bei Ihnen. Mail-Support: Montag bis Freitag von 10:00 bis 23:00 Uhr, Samstag von 08:00 bis 12:00 Uhr, an Feiertagen von 11:00 bis 12:00 Uhr. Der Support in der Webapp ist taeglich verfuegbar.',
      );
      db.prepare('INSERT INTO notifications (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)').run(
        'support-reply',
        'info',
        'Neue Support-Antwort',
        `Support hat ${user.username} geantwortet.`,
        JSON.stringify({ user_id: user.id, username: user.username }),
      );
    });
    tx();

    const rows = db
      .prepare('SELECT id, sender, message, created_at FROM support_messages WHERE user_id = ? ORDER BY created_at ASC, id ASC')
      .all(user.id) as Array<{ id: number; sender: string; message: string; created_at: string }>;

    return NextResponse.json({ ok: true, messages: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send support message';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to send support message' }, { status: 500 });
  }
}