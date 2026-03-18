'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, Send, ShieldCheck } from 'lucide-react';

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

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/chat', { cache: 'no-store' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as MaestroPayload;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages().catch(() => {});
    const timer = setInterval(() => loadMessages().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maestro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as any;
        setError(payload?.error ? String(payload.error) : `HTTP ${res.status}`);
        return;
      }
      setInput('');
      await loadMessages();
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
    <div className="h-full min-h-0 flex flex-col gap-4">
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

      <div className="card p-4 flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Bot size={14} className="text-primary" /> Ops Chat
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={() => loadMessages().catch(() => {})}>
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 rounded-xl border border-border/60 bg-surface-1/40 p-4">
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
  );
}
