import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-auth';
import { sendOrchestratorMessage } from '@/lib/command';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

interface MessageRow {
  id: number;
  conversation_id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  message_type: 'text' | 'system';
  metadata: string | null;
  read_at: number | null;
  created_at: number;
}

const CONVERSATION_ID = 'maestro:admin';

export async function GET(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id, conversation_id, from_agent, to_agent, content, message_type, metadata, read_at, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 200`,
    ).all(CONVERSATION_ID) as MessageRow[];

    const messages = rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));

    return NextResponse.json({ conversation_id: CONVERSATION_ID, messages });
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch maestro chat: ${String(error)}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const actor = requireAdmin(request as Request);
    const body = (await request.json().catch(() => ({}))) as { content?: string };
    const content = (body.content || '').trim();
    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const metadata = JSON.stringify({
      source: 'maestro',
      actor: actor.username,
    });

    db.prepare(
      `INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, created_at)
       VALUES (?, ?, ?, ?, 'text', ?, ?)`,
    ).run(CONVERSATION_ID, actor.username, 'maestro', content, metadata, now);

    const result = await sendOrchestratorMessage(content);
    const responseText = result.response || '';

    if (responseText) {
      db.prepare(
        `INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, created_at)
         VALUES (?, ?, ?, ?, 'text', ?, ?)`,
      ).run(CONVERSATION_ID, 'maestro', actor.username, responseText, metadata, Math.floor(Date.now() / 1000));
    }

    logAudit({
      actor,
      action: 'maestro.message',
      target: CONVERSATION_ID,
      detail: { preview: content.slice(0, 180) },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: `Maestro send failed: ${String(error)}` }, { status: 500 });
  }
}
