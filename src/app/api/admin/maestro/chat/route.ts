import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { requireApiAdmin } from '@/lib/api-auth';
import { requestOpenAiResponse } from '@/config/openai';
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
