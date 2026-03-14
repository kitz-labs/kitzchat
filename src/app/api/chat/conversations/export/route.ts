import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';
import { normalizeConversationTitle, sanitizeDownloadName } from '@/lib/chat-conversations';

export const dynamic = 'force-dynamic';

type MessageRow = {
  id: number;
  from_agent: string;
  content: string;
  metadata: string | null;
  created_at: number;
};

export async function GET(request: NextRequest) {
  const auth = requireApiUser(request as Request);
  if (auth) return auth;

  try {
    const actor = requireUser(request as Request);
    const db = getDb();
    const conversationId = request.nextUrl.searchParams.get('conversation_id')?.trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    if (actor.account_type === 'customer' && actor.role !== 'admin') {
      const owned = db.prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND owner_user_id = ? LIMIT 1').get(conversationId, actor.id) as { 1: number } | undefined;
      const ownedMeta = db.prepare('SELECT 1 FROM chat_conversations WHERE conversation_id = ? AND owner_user_id = ? LIMIT 1').get(conversationId, actor.id) as { 1: number } | undefined;
      if (!owned && !ownedMeta) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    }

    const meta = db.prepare('SELECT title FROM chat_conversations WHERE conversation_id = ? LIMIT 1').get(conversationId) as { title: string | null } | undefined;
    const messages = db.prepare('SELECT id, from_agent, content, metadata, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC').all(conversationId) as MessageRow[];

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found for this conversation' }, { status: 404 });
    }

    const title = normalizeConversationTitle(meta?.title, 'Chat Export');
    const lines = [
      `# ${title}`,
      '',
      `Conversation-ID: ${conversationId}`,
      `Exportiert: ${new Date().toLocaleString('de-DE')}`,
      '',
    ];

    for (const message of messages) {
      const timestamp = new Date(message.created_at * 1000).toLocaleString('de-DE');
      lines.push(`## ${timestamp} · ${message.from_agent}`);
      lines.push('');
      lines.push(message.content);
      const metadata = message.metadata ? JSON.parse(message.metadata) as { attachments?: Array<{ name: string; url: string }> } : null;
      if (Array.isArray(metadata?.attachments) && metadata.attachments.length > 0) {
        lines.push('');
        lines.push('Dateien:');
        for (const attachment of metadata.attachments) {
          lines.push(`- [${attachment.name}](${attachment.url})`);
        }
      }
      lines.push('');
    }

    const body = `${lines.join('\n').trim()}\n`;
    const filename = `${sanitizeDownloadName(title)}.md`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('GET /api/chat/conversations/export error:', error);
    return NextResponse.json({ error: 'Failed to export conversation' }, { status: 500 });
  }
}