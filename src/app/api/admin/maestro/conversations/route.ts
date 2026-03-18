import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-auth';
import { normalizeConversationTitle } from '@/lib/chat-conversations';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type ConversationRow = {
  conversation_id: string;
  title: string | null;
  created_at: number | null;
  updated_at: number | null;
};

type MessageRow = {
  id: number;
  conversation_id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  message_type: string;
  metadata: string | null;
  read_at: number | null;
  created_at: number;
};

function isMaestroConversationId(value: string): boolean {
  // Supports legacy "maestro:admin" and new "maestro:admin:<uuid>".
  return value === 'maestro:admin' || value.startsWith('maestro:admin:');
}

export async function GET(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    requireAdmin(request as Request);
    const db = getDb();

    const conversations = db.prepare(`
      SELECT conversation_id, title, created_at, updated_at
      FROM chat_conversations
      WHERE conversation_id LIKE 'maestro:admin%'
      ORDER BY COALESCE(updated_at, created_at, 0) DESC
      LIMIT 100
    `).all() as ConversationRow[];

    const fallbackRows = db.prepare(`
      SELECT DISTINCT conversation_id
      FROM messages
      WHERE conversation_id LIKE 'maestro:admin%'
      ORDER BY conversation_id ASC
      LIMIT 100
    `).all() as Array<{ conversation_id: string }>;

    const ids = new Set<string>();
    for (const c of conversations) ids.add(c.conversation_id);
    for (const r of fallbackRows) ids.add(r.conversation_id);

    const items = Array.from(ids).map((conversationId) => {
      const lastMsg = db.prepare(
        `SELECT id, conversation_id, from_agent, to_agent, content, message_type, metadata, read_at, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      ).get(conversationId) as MessageRow | undefined;

      const countRow = db.prepare(`SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?`).get(conversationId) as { c: number };
      const meta = conversations.find((c) => c.conversation_id === conversationId);
      const title = normalizeConversationTitle(meta?.title || '', lastMsg?.content?.slice(0, 48) || 'Neuer Chat');
      const last_message_at = lastMsg?.created_at ?? meta?.updated_at ?? meta?.created_at ?? 0;

      return {
        id: conversationId,
        conversation_id: conversationId,
        title,
        message_count: Number(countRow?.c || 0),
        last_message_at: Number(last_message_at || 0),
        created_at: Number(meta?.created_at || last_message_at || 0),
        last_message: lastMsg ? { ...lastMsg, metadata: lastMsg.metadata ? JSON.parse(lastMsg.metadata) : null } : null,
      };
    }).sort((a, b) => (b.last_message_at - a.last_message_at) || (b.created_at - a.created_at));

    return NextResponse.json({ conversations: items });
  } catch (error) {
    console.error('GET /api/admin/maestro/conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch maestro conversations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const actor = requireAdmin(request as Request);
    const db = getDb();
    const body = await request.json().catch(() => ({})) as { title?: string };
    const now = Math.floor(Date.now() / 1000);

    const conversationId = `maestro:admin:${randomUUID()}`;
    const title = normalizeConversationTitle(typeof body?.title === 'string' ? body.title : '', 'Neuer Chat');

    db.prepare(`
      INSERT INTO chat_conversations (conversation_id, owner_user_id, owner_username, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(conversationId, actor.id, actor.username, 'maestro', title, now, now);

    logAudit({
      actor,
      action: 'maestro.conversation.create',
      target: conversationId,
      detail: { title },
    });

    return NextResponse.json({
      conversation: {
        id: conversationId,
        conversation_id: conversationId,
        title,
        message_count: 0,
        last_message_at: now,
        created_at: now,
        last_message: null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/maestro/conversations error:', error);
    return NextResponse.json({ error: 'Failed to create maestro conversation' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const actor = requireAdmin(request as Request);
    const db = getDb();
    const body = await request.json().catch(() => ({})) as { conversation_id?: string };
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id.trim() : '';
    if (!conversationId || !isMaestroConversationId(conversationId)) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
    db.prepare('DELETE FROM chat_conversations WHERE conversation_id = ?').run(conversationId);

    logAudit({
      actor,
      action: 'maestro.conversation.delete',
      target: conversationId,
      detail: {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/admin/maestro/conversations error:', error);
    return NextResponse.json({ error: 'Failed to delete maestro conversation' }, { status: 500 });
  }
}

