import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-auth';
import { requestOpenAiResponse } from '@/config/openai';
import { logAudit } from '@/lib/audit';
import { normalizeConversationTitle } from '@/lib/chat-conversations';

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

const LEGACY_CONVERSATION_ID = 'maestro:admin';

function resolveConversationId(input: string | null): string {
  const raw = (input || '').trim();
  if (!raw) return LEGACY_CONVERSATION_ID;
  if (raw === LEGACY_CONVERSATION_ID || raw.startsWith(`${LEGACY_CONVERSATION_ID}:`)) return raw;
  // Don’t allow arbitrary conversation access from this endpoint.
  return LEGACY_CONVERSATION_ID;
}

export async function GET(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const db = getDb();
    const conversationId = resolveConversationId(request.nextUrl.searchParams.get('conversation_id'));
    const rows = db.prepare(
      `SELECT id, conversation_id, from_agent, to_agent, content, message_type, metadata, read_at, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 200`,
    ).all(conversationId) as MessageRow[];

    const messages = rows.map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));

    return NextResponse.json({ conversation_id: conversationId, messages });
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch maestro chat: ${String(error)}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  try {
    const actor = requireAdmin(request as Request);
    const body = (await request.json().catch(() => ({}))) as { content?: string; conversation_id?: string };
    const content = (body.content || '').trim();
    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const conversationId = resolveConversationId(body.conversation_id || null);
    const metadata = JSON.stringify({
      source: 'maestro',
      actor: actor.username,
    });

    const fallbackTitle = normalizeConversationTitle(content.slice(0, 48), 'Neuer Chat');
    db.prepare(`
      INSERT INTO chat_conversations (conversation_id, owner_user_id, owner_username, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        owner_user_id = excluded.owner_user_id,
        owner_username = excluded.owner_username,
        agent_id = COALESCE(chat_conversations.agent_id, excluded.agent_id),
        title = CASE WHEN chat_conversations.title = '' OR chat_conversations.title = 'Neuer Chat' THEN excluded.title ELSE chat_conversations.title END,
        updated_at = excluded.updated_at
    `).run(conversationId, actor.id, actor.username, 'maestro', fallbackTitle, now, now);

    db.prepare(
      `INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, created_at)
       VALUES (?, ?, ?, ?, 'text', ?, ?)`,
    ).run(conversationId, actor.username, 'maestro', content, metadata, now);

    const maestroPrompt = [
      '# SYSTEM',
      'Du bist MAESTRO, der Admin-Agent fuer Nexora.',
      'Aufgabe: Admin operativ unterstuetzen (Bugfix-Plan, UX-Verbesserung, Agenten-Optimierung, Datenchecks).',
      'Regeln:',
      '- Antworte klar, kompakt, umsetzbar.',
      '- Nenne moegliche Risiken.',
      '- Wenn eine Aktion mit Risiko verbunden ist, schlage zuerst einen sicheren Vorschlag vor.',
      '- Keine Geheimnisse, keine Tokens, keine Passwoerter ausgeben.',
      '',
      'Optional: Wenn du eine sichere, whitelisted Admin-Aktion vorschlagen willst, fuege exakt EINEN JSON-Block hinzu, eingeschlossen von',
      '<maestro_actions> ... </maestro_actions>.',
      'Erlaubte Actions (type):',
      '- settings.merge (payload: { patch: object }) -> merged in app-settings.json',
      'Keine anderen Action-Typen verwenden. Keine Shell-Commands, kein Code-Write.',
      '',
      '# USER',
      content,
    ].join('\n');
    const responseText = await (async () => {
      try {
        const result = await requestOpenAiResponse(maestroPrompt, 'gpt-5.4', {
          temperature: 0.2,
          maxOutputTokens: 900,
        });
        return result.answer || '';
      } catch (err) {
        const msg = String((err as Error)?.message || err || '').trim();
        return [
          'MAESTRO konnte OpenAI aktuell nicht erreichen.',
          '',
          msg ? `Fehler: ${msg}` : 'Fehler: Unbekannt',
          '',
          'Naechster Schritt (sicher): Bitte pruefe, ob OPENAI_API_KEY oder OPENAI_ADMIN_KEY im Container gesetzt ist und der Key Zugriff auf /v1/responses hat.',
        ].join('\n');
      }
    })();

    if (responseText) {
      db.prepare(
        `INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, created_at)
         VALUES (?, ?, ?, ?, 'text', ?, ?)`,
      ).run(conversationId, 'maestro', actor.username, responseText, metadata, Math.floor(Date.now() / 1000));
    }

    logAudit({
      actor,
      action: 'maestro.message',
      target: conversationId,
      detail: { preview: content.slice(0, 180) },
    });

    return NextResponse.json({ ok: true, conversation_id: conversationId });
  } catch (error) {
    return NextResponse.json({ error: `Maestro send failed: ${String(error)}` }, { status: 500 });
  }
}
