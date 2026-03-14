import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { generateCustomerConversationId, inferCustomerAgentId, normalizeConversationTitle } from '@/lib/chat-conversations';

export const dynamic = 'force-dynamic';

interface ConversationRow {
  conversation_id: string;
  last_message_at: number;
  message_count: number;
  unread_count: number;
  title: string;
  agent_id: string | null;
  created_at: number;
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

    const ownerFilter = actor.account_type === 'customer' && actor.role !== 'admin';
    const conversations = db.prepare(`
      SELECT
        source.conversation_id,
        source.last_message_at,
        source.message_count,
        source.unread_count,
        source.title,
        source.agent_id,
        source.created_at
      FROM (
        SELECT
          m.conversation_id,
          MAX(m.created_at) as last_message_at,
          COUNT(*) as message_count,
          SUM(CASE WHEN m.read_at IS NULL AND m.from_agent != ? THEN 1 ELSE 0 END) as unread_count,
          COALESCE(c.title, '') as title,
          COALESCE(c.agent_id, '') as agent_id,
          COALESCE(c.created_at, MIN(m.created_at)) as created_at
        FROM messages m
        LEFT JOIN chat_conversations c ON c.conversation_id = m.conversation_id
        ${ownerFilter ? 'WHERE m.owner_user_id = ?' : ''}
        GROUP BY m.conversation_id

        UNION ALL

        SELECT
          c.conversation_id,
          c.updated_at as last_message_at,
          0 as message_count,
          0 as unread_count,
          c.title as title,
          c.agent_id as agent_id,
          c.created_at as created_at
        FROM chat_conversations c
        WHERE NOT EXISTS (
          SELECT 1 FROM messages m WHERE m.conversation_id = c.conversation_id
        )
        ${ownerFilter ? 'AND c.owner_user_id = ?' : ''}
      ) source
      ORDER BY source.last_message_at DESC, source.created_at DESC
    `).all(...(ownerFilter ? [username, actor.id, actor.id] : [username])) as ConversationRow[];

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
        title: normalizeConversationTitle(conv.title, lastMsg?.content?.slice(0, 48) || 'Neuer Chat'),
        agent_id: conv.agent_id || inferCustomerAgentId(conv.conversation_id),
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

export async function POST(request: Request) {
  const auth = requireApiUser(request as Request);
  if (auth) return auth;

  try {
    const actor = requireUser(request as Request);
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const agentId = typeof body?.agent_id === 'string' ? body.agent_id.trim() : '';

    if (!agentId) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    const conversationId = generateCustomerConversationId(actor.id, agentId);
    const title = normalizeConversationTitle(typeof body?.title === 'string' ? body.title : '', 'Neuer Chat');
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO chat_conversations (conversation_id, owner_user_id, owner_username, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(conversationId, actor.id, actor.username, agentId, title, now, now);

    return NextResponse.json({
      conversation: {
        id: conversationId,
        conversation_id: conversationId,
        last_message_at: now,
        message_count: 0,
        unread_count: 0,
        title,
        agent_id: agentId,
        created_at: now,
        last_message: null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/chat/conversations error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = requireApiUser(request as Request);
  if (auth) return auth;

  try {
    const actor = requireUser(request as Request);
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id.trim() : '';
    const title = normalizeConversationTitle(typeof body?.title === 'string' ? body.title : '', 'Neuer Chat');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    if (actor.account_type === 'customer' && actor.role !== 'admin') {
      const existing = db.prepare('SELECT owner_user_id, owner_username, agent_id, created_at FROM chat_conversations WHERE conversation_id = ? LIMIT 1').get(conversationId) as { owner_user_id: number | null; owner_username: string | null; agent_id: string | null; created_at: number | null } | undefined;
      if (existing && existing.owner_user_id && existing.owner_user_id !== actor.id) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO chat_conversations (conversation_id, owner_user_id, owner_username, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
    `).run(conversationId, actor.id, actor.username, title, now, now);

    return NextResponse.json({ ok: true, title });
  } catch (error) {
    console.error('PATCH /api/chat/conversations error:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}
