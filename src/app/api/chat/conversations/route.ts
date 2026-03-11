import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface ConversationRow {
  conversation_id: string;
  last_message_at: number;
  message_count: number;
  unread_count: number;
}

interface MessageRow {
  id: number;
  conversation_id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  message_type: string;
  metadata: string | null;
  read_at: number | null;
  created_at: number;
}

export async function GET(request: Request) {
  const auth = requireApiUser(request as Request);
  if (auth) return auth;
  try {
    const db = getDb();

    const actor = requireUser(request as Request);
    const username = (typeof actor?.username === 'string' && actor.username.trim()) ? actor.username.trim() : 'operator';

    const filter = actor.account_type === 'customer' && actor.role !== 'admin'
      ? 'WHERE m.owner_user_id = ?'
      : '';
    const conversations = db.prepare(`
      SELECT
        m.conversation_id,
        MAX(m.created_at) as last_message_at,
        COUNT(*) as message_count,
        SUM(CASE WHEN m.read_at IS NULL AND m.from_agent != ? THEN 1 ELSE 0 END) as unread_count
      FROM messages m
      ${filter}
      GROUP BY m.conversation_id
      ORDER BY last_message_at DESC
    `).all(...(filter ? [username, actor.id] : [username])) as ConversationRow[];

    const withLastMessage = conversations.map((conv) => {
      const lastMsg = db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(conv.conversation_id) as MessageRow | undefined;

      return {
        id: conv.conversation_id,
        ...conv,
        last_message: lastMsg
          ? { ...lastMsg, metadata: lastMsg.metadata ? JSON.parse(lastMsg.metadata) : null }
          : null,
      };
    });

    return NextResponse.json({ conversations: withLastMessage });
  } catch (error) {
    console.error('GET /api/chat/conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}
