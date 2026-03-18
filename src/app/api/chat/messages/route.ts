import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { sendAgentMessage } from '@/lib/command';
import { requireApiChatUser, requireApiUser } from '@/lib/api-auth';
import { getAgentIds } from '@/lib/agent-config';
import { requireUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { buildCustomerIntegrationContext, ensureCustomerPreferences, getCustomerAgentBlockReason } from '@/lib/customer-preferences';
import { getAppStateDir } from '@/lib/app-state';
import { normalizeConversationTitle } from '@/lib/chat-conversations';
import { inspectPolicyContent, reportPolicyIncident } from '@/lib/policy-enforcement';
import { creditsToCents, hasPostgresConfig } from '@/config/env';
import { runAgentChat } from '@/modules/agents/agents.service';

export const dynamic = 'force-dynamic';


interface MessageRow {
  id: number;
  conversation_id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  message_type: string;
  metadata: string | null;
  created_at: number;
}

type AttachmentMeta = {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
};

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'conversation';
}

function resolveCustomerMemoryPath(userId: number, username: string, memoryStorageMode: 'state' | 'custom' | 'cloud', memoryStoragePath: string): string {
  if (memoryStorageMode === 'custom' && memoryStoragePath.trim()) {
    return memoryStoragePath.trim();
  }
  return path.join(getAppStateDir(), 'customer-memory', `${sanitizePathSegment(username)}-${userId}`);
}

async function appendCustomerMemory(
  userId: number,
  username: string,
  conversationId: string,
  actorLabel: string,
  content: string,
  attachments: AttachmentMeta[],
) {
  const preferences = ensureCustomerPreferences(userId);
  const basePath = resolveCustomerMemoryPath(userId, username, preferences.memory_storage_mode, preferences.memory_storage_path);
  const conversationFile = path.join(basePath, 'conversations', `${sanitizePathSegment(conversationId)}.md`);
  const timestamp = new Date().toISOString();
  const attachmentLines = attachments.length > 0
    ? `\nDateien:\n${attachments.map((attachment) => `- ${attachment.name} (${attachment.type || 'Datei'})`).join('\n')}`
    : '';
  await fs.mkdir(path.dirname(conversationFile), { recursive: true });
  await fs.appendFile(conversationFile, `## ${timestamp} · ${actorLabel}\n\n${content}${attachmentLines}\n\n`, 'utf-8');
}

async function mirrorDocuAttachments(
  userId: number,
  attachments: AttachmentMeta[],
  docuRootPath: string,
) {
  if (!docuRootPath || attachments.length === 0) return;
  const db = getDb();
  const targetDir = path.join(docuRootPath, 'eingang');
  await fs.mkdir(targetDir, { recursive: true });

  for (const attachment of attachments) {
    if (!attachment.id) continue;
    const row = db
      .prepare('SELECT storage_path, original_name FROM chat_uploads WHERE id = ? AND user_id = ?')
      .get(attachment.id, userId) as { storage_path: string; original_name: string } | undefined;
    if (!row) continue;
    const targetPath = path.join(targetDir, `${Date.now()}-${sanitizePathSegment(row.original_name)}`);
    await fs.copyFile(row.storage_path, targetPath).catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as Request);
  if (auth) return auth;
  try {
    const db = getDb();
    const actor = requireUser(req as Request);
    const { searchParams } = req.nextUrl;

    const conversation_id = searchParams.get('conversation_id');
    const limit = Number(searchParams.get('limit')) || 50;
    const since = searchParams.get('since');

    let sql = 'SELECT * FROM messages WHERE 1=1';
    const params: unknown[] = [];

    if (actor.account_type === 'customer' && actor.role !== 'admin') {
      sql += ' AND owner_user_id = ?';
      params.push(actor.id);
    }

    if (conversation_id) { sql += ' AND conversation_id = ?'; params.push(conversation_id); }
    if (since) { sql += ' AND created_at > ?'; params.push(Number(since)); }

    sql += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);

    const messages = db.prepare(sql).all(...params) as MessageRow[];
    const parsed = messages.map(m => ({
      ...m,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
    }));

    return NextResponse.json({ messages: parsed });
  } catch (error) {
    console.error('GET /api/chat/messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireApiChatUser(req as Request);
  if (auth) return auth;
  try {
    const actor = requireUser(req as Request);
    const db = getDb();
    const body = await req.json();
    const from = (typeof actor?.username === 'string' && actor.username.trim()) ? actor.username.trim() : 'operator';
    const to = body.to ? (body.to as string).trim() : null;
    const content = (body.content || '').trim();
    const message_type = body.message_type || 'text';
    const conversation_id = body.conversation_id || (actor.account_type === 'customer' ? `customer:${actor.id}:${to || 'agent'}` : `conv_${Date.now()}`);
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.filter((item: unknown): item is AttachmentMeta => {
          return typeof item === 'object' && item !== null && typeof (item as AttachmentMeta).name === 'string' && typeof (item as AttachmentMeta).url === 'string';
        })
      : [];

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const match = inspectPolicyContent(content);
    if (match.blocked) {
      await reportPolicyIncident(actor, { source: 'chat', content, conversationId: conversation_id, match });
      return NextResponse.json({ error: match.userMessage || 'Diese Anfrage wurde blockiert.' }, { status: 403 });
    }

    let integrationContext = '';
    if (actor.account_type === 'customer') {
      const preferences = ensureCustomerPreferences(actor.id);
      const enabledAgents = new Set(preferences.enabled_agent_ids);
      if (to && !enabledAgents.has(to)) {
        return NextResponse.json({ error: 'Dieser Agent ist in deinen Einstellungen deaktiviert' }, { status: 400 });
      }
      const blockedReason = getCustomerAgentBlockReason(to || undefined, preferences);
      if (blockedReason) {
        return NextResponse.json({ error: blockedReason }, { status: 400 });
      }
      integrationContext = buildCustomerIntegrationContext(preferences, to || undefined);
    }

    const metadata = attachments.length > 0 ? JSON.stringify({ attachments }) : null;
    const now = Math.floor(Date.now() / 1000);

    if (actor.account_type === 'customer') {
      const fallbackTitle = normalizeConversationTitle(typeof body.title === 'string' ? body.title : content.slice(0, 48), 'Neuer Chat');
      db.prepare(`
        INSERT INTO chat_conversations (conversation_id, owner_user_id, owner_username, agent_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET
          owner_user_id = excluded.owner_user_id,
          owner_username = excluded.owner_username,
          agent_id = COALESCE(chat_conversations.agent_id, excluded.agent_id),
          title = CASE WHEN chat_conversations.title = '' THEN excluded.title ELSE chat_conversations.title END,
          updated_at = excluded.updated_at
      `).run(conversation_id, actor.id, actor.username, to, fallbackTitle, now, now);
    }

    // Save the human message
    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, owner_user_id, owner_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(conversation_id, from, to, content, message_type, metadata, actor.id, actor.username, now);
    const messageId = result.lastInsertRowid as number;

    const created = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRow | undefined;
    if (!created) {
      return NextResponse.json({ error: 'Failed to load created message' }, { status: 500 });
    }
    const parsedMessage = { ...created, metadata: created.metadata ? JSON.parse(created.metadata) : null };
    if (actor.account_type === 'customer') {
      await appendCustomerMemory(actor.id, actor.username, conversation_id, from, content, attachments).catch((error) => {
        console.error('Failed to persist customer memory:', error);
      });
      if (to === 'docu-agent') {
        const preferences = ensureCustomerPreferences(actor.id);
        const docuTarget = preferences.docu_root_path || resolveCustomerMemoryPath(actor.id, actor.username, preferences.memory_storage_mode, preferences.memory_storage_path);
        await mirrorDocuAttachments(actor.id, attachments, docuTarget).catch((error) => {
          console.error('Failed to mirror docu attachments:', error);
        });
      }
    }

    logAudit({
      actor,
      action: 'chat.message.send',
      target: `conversation:${conversation_id}`,
      detail: { from, to, message_type },
    });

    // If recipient is a known agent, forward via gateway (async, non-blocking)
    if (to && getAgentIds().includes(to) && body.forward !== false) {
      // Fire-and-forget: forward to agent, save response when it comes back
      forwardToAgent(db, actor.id, actor.username, to, content, conversation_id, from, attachments, integrationContext).catch(err => {
        console.error(`Failed to forward to ${to}:`, err);
        // Save error as system message
        db.prepare(`
          INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, owner_user_id, owner_username, created_at)
          VALUES (?, 'system', ?, ?, 'system', ?, ?, ?)
        `).run(conversation_id, from, `Failed to reach ${to}: ${(err as Error).message?.slice(0, 200)}`, actor.id, actor.username, Math.floor(Date.now() / 1000));
      });
    }

    return NextResponse.json({ message: parsedMessage }, { status: 201 });
  } catch (error) {
    console.error('POST /api/chat/messages error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

async function forwardToAgent(
  db: ReturnType<typeof getDb>,
  userId: number,
  username: string,
  agentId: string,
  content: string,
  conversationId: string,
  from: string,
  attachments: AttachmentMeta[],
  integrationContext: string,
) {
  const attachmentSummary = attachments.length > 0
    ? `\n\nAngehaengte Dateien:\n${attachments.map((item) => `- ${item.name} (${item.type || 'Datei'})`).join('\n')}`
    : '';
  const prompt = `Message from ${from}: ${content}${attachmentSummary}${integrationContext}`;
  const useCreditRouting = hasPostgresConfig() && username !== 'admin';
  const agentResult = useCreditRouting
    ? await runAgentChat({
        userId,
        email: null,
        name: username,
        agentCode: agentId,
        prompt,
      })
    : null;
  const responseRaw = agentResult?.answer ?? (await sendAgentMessage(agentId, prompt)).response;
  const response = typeof responseRaw === 'string' ? responseRaw : String(responseRaw ?? '');

  const promptTokens = Math.max(1, Math.ceil(content.length / 4));
  const completionTokens = Math.max(1, Math.ceil(response.length / 4));
  const totalTokens = promptTokens + completionTokens;

  if (response) {
    const responseMetadata = agentResult
      ? JSON.stringify({
          credits_charged: agentResult.creditsCharged,
          remaining_balance: agentResult.remainingBalance,
          display_mode: agentResult.displayMode,
          request_id: agentResult.requestId,
        })
      : null;
    db.prepare(`
      INSERT INTO messages (conversation_id, from_agent, to_agent, content, message_type, metadata, owner_user_id, owner_username, created_at)
      VALUES (?, ?, ?, ?, 'text', NULL, ?, ?, ?)
    `).run(conversationId, agentId, from, response, userId, username, Math.floor(Date.now() / 1000));

    if (responseMetadata) {
      db.prepare('UPDATE messages SET metadata = ? WHERE rowid = last_insert_rowid()').run(responseMetadata);
    }

    await appendCustomerMemory(userId, username, conversationId, agentId, response, []).catch((error) => {
      console.error('Failed to persist agent memory:', error);
    });

    db.prepare(`
      INSERT INTO chat_usage_events (user_id, username, conversation_id, agent_id, prompt_tokens, completion_tokens, total_tokens, amount_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username,
      conversationId,
      agentId,
      promptTokens,
      completionTokens,
      totalTokens,
      agentResult ? creditsToCents(agentResult.creditsCharged) : 0,
      Math.floor(Date.now() / 1000),
    );
  }
}
