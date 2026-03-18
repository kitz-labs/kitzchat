'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';

type MaestroMessage = {
  id: number;
  from_agent: string;
  content: string;
  created_at: number;
  metadata?: Record<string, unknown> | null;
};

type MaestroPayload = {
  conversation_id: string;
  messages: MaestroMessage[];
};

type MaestroConversation = {
  id: string;
  conversation_id: string;
  title: string;
  last_message_at: number;
  message_count: number;
};

type MaestroAction = {
  type: 'settings.merge';
  payload: {
    patch: Record<string, unknown>;
  };
};

function extractMaestroActions(content: string): { cleaned: string; actions: MaestroAction[] } {
  const pattern = /<maestro_actions>([\s\S]*?)<\/maestro_actions>/gi;
  const actions: MaestroAction[] = [];
  let cleaned = content;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const raw = (match[1] || '').trim();
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'settings.merge' && item.payload && typeof item.payload === 'object') {
          actions.push(item as MaestroAction);
        }
      }
      cleaned = cleaned.replace(match[0], '').trim();
    } catch {
      // ignore invalid blocks
    }
  }
  return { cleaned, actions };
}

export default function MaestroPage() {
  const [messages, setMessages] = useState<MaestroMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<MaestroConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [conversationLoading, setConversationLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setConversationLoading(true);
    try {
      const res = await fetch('/api/admin/maestro/conversations', { cache: 'no-store' });
      if (!res.ok) return;
      const payload = (await res.json().catch(() => ({}))) as { conversations?: MaestroConversation[] };
      const list = Array.isArray(payload.conversations) ? payload.conversations : [];
      setConversations(list);
      if (!activeConversationId && list.length > 0) {
        setActiveConversationId(list[0].conversation_id);
      }
    } finally {
      setConversationLoading(false);
    }
  }, [activeConversationId]);

  const loadMessages = useCallback(async (conversationId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const targetConversation = (conversationId || activeConversationId).trim();
      const url = targetConversation
        ? `/api/admin/maestro/chat?conversation_id=${encodeURIComponent(targetConversation)}`
        : '/api/admin/maestro/chat';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as MaestroPayload;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.conversation_id && data.conversation_id !== activeConversationId) {
        setActiveConversationId(data.conversation_id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeConversationId]);

  useEffect(() => {
    loadConversations().catch(() => {});
    const timer = setInterval(() => {
      loadConversations().catch(() => {});
      if (activeConversationId) {
        loadMessages(activeConversationId).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [activeConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return;
    loadMessages(activeConversationId).catch(() => {});
  }, [activeConversationId, loadMessages]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => (b.last_message_at - a.last_message_at) || (b.message_count - a.message_count));
  }, [conversations]);

  async function createConversation() {
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Neuer Chat' }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as any;
      const convId = payload?.conversation?.conversation_id ? String(payload.conversation.conversation_id) : '';
      await loadConversations();
      if (convId) setActiveConversationId(convId);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat konnte nicht erstellt werden');
    }
  }

  async function deleteConversation(conversationId: string) {
    if (!conversationId || deletingId) return;
    setDeletingId(conversationId);
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      const next = sortedConversations.filter((c) => c.conversation_id !== conversationId)[0]?.conversation_id || '';
      await loadConversations();
      if (activeConversationId === conversationId) {
        setActiveConversationId(next);
        setMessages([]);
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, conversation_id: activeConversationId || undefined }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      setInput('');
      await Promise.all([loadConversations(), loadMessages(activeConversationId)]);
    } finally {
      setSending(false);
    }
  }

  async function executeAction(messageId: number, action: MaestroAction) {
    if (executingId) return;
    setExecutingId(messageId);
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      await loadMessages();
    } finally {
      setExecutingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Admin Zugriff</div>
            <h1 className="text-xl font-semibold">MAESTRO</h1>
            <p className="text-sm text-muted-foreground">
              Admin‑only Steuerzentrale. Vorschlaege, Checks und naechste Schritte. Aktionen koennen spaeter als sichere Tools (Preview → Confirm → Execute) erweitert werden.
            </p>
          </div>
          <div className="badge badge-success inline-flex items-center gap-1">
            <ShieldCheck size={14} /> Admin Zugriff
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Gespeicherte Chats</div>
              <div className="text-sm font-medium">Maestro Sessions</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm inline-flex items-center gap-2" onClick={createConversation} disabled={conversationLoading}>
              <Plus size={14} /> Neuer Chat
            </button>
          </div>

          <div className="space-y-2">
            {conversationLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Laden...
              </div>
            ) : sortedConversations.length === 0 ? (
              <div className="text-sm text-muted-foreground">Noch keine gespeicherten Chats.</div>
            ) : (
              sortedConversations.map((conv) => {
                const active = conv.conversation_id === activeConversationId;
                return (
                  <div key={conv.conversation_id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${active ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-background/40'}`}>
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(conv.conversation_id)}
                      className="flex-1 min-w-0 text-left"
                      title={conv.title}
                    >
                      <div className="truncate text-sm font-medium">{conv.title}</div>
                      <div className="text-[11px] text-muted-foreground">{conv.message_count} Messages</div>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => deleteConversation(conv.conversation_id)}
                      disabled={deletingId === conv.conversation_id}
                      title="Chat loeschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Bot size={14} className="text-primary" /> Ops Chat
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => loadMessages(activeConversationId).catch(() => {})}>
              Refresh
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-border/60 bg-surface-1/40 p-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Laden...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                MAESTRO ist bereit. Beschreibe dein Ziel (z. B. „Umsatz steigern“, „Bug fixen“, „Agenten optimieren“).
              </div>
            ) : (
              messages.map((message) => {
                const mine = message.from_agent !== 'maestro';
                const { cleaned, actions } = mine ? { cleaned: message.content, actions: [] } : extractMaestroActions(message.content || '');
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 ${mine ? 'bg-primary text-primary-foreground' : 'bg-background/60 border border-border/60'}`}>
                      <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{mine ? 'DU' : 'SYSTEM'}</div>
                      <div className="text-sm whitespace-pre-wrap break-words">{cleaned}</div>
                      {actions.length ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs uppercase tracking-wide opacity-70">Vorschlag (sicher)</div>
                          {actions.map((action, idx) => (
                            <div key={`${message.id}:${idx}`} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                              <div className="text-xs font-medium">Action: {action.type}</div>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-background/40 p-2 text-[11px] leading-relaxed">
                                {JSON.stringify(action.payload, null, 2)}
                              </pre>
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  disabled={executingId === message.id}
                                  onClick={() => executeAction(message.id, action)}
                                >
                                  {executingId === message.id ? 'Fuehre aus...' : 'Ausfuehren (Admin)'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background px-3 py-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Beschreibe dein Ziel (z.B. Umsatz steigern, Bug fixen, Agenten optimieren)..."
              rows={4}
              className="min-h-[110px] max-h-[320px] flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
            />
            <button type="button" onClick={sendMessage} disabled={sending || !input.trim()} className="btn btn-primary btn-sm">
              <Send size={14} /> {sending ? 'Sende...' : 'Senden'}
            </button>
          </div>
          <div className="text-xs text-muted-foreground">Tipp: <span className="font-semibold">Enter</span> sendet · <span className="font-semibold">Shift</span> + <span className="font-semibold">Enter</span> neue Zeile.</div>
          <div className="text-[11px] text-muted-foreground">
            Hinweis: MAESTRO kann aktuell nur sichere, whitelisted Admin-Aktionen ausfuehren (z. B. Settings). Fuer Code-Aenderungen erstellt MAESTRO Vorschlaege/Plans – kein unsicheres Auto-Write.
          </div>
        </div>
      </div>
    </div>
  );
}
