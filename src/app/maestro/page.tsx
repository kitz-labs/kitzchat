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

export default function MaestroPage() {
  const [messages, setMessages] = useState<MaestroMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/maestro/chat', { cache: 'no-store' });
      if (!res.ok) return;
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
    try {
      const res = await fetch('/api/admin/maestro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) return;
      setInput('');
      await loadMessages();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
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

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Bot size={14} className="text-primary" /> Ops Chat
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={() => loadMessages().catch(() => {})}>
            Refresh
          </button>
        </div>

        <div className="min-h-[320px] max-h-[520px] overflow-y-auto space-y-3 rounded-xl border border-border/60 bg-surface-1/40 p-4">
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
              return (
                <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${mine ? 'bg-primary text-primary-foreground' : 'bg-background/60 border border-border/60'}`}>
                    <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{mine ? 'DU' : 'SYSTEM'}</div>
                    <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
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
            rows={3}
            className="min-h-[84px] max-h-[220px] flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
          />
          <button type="button" onClick={sendMessage} disabled={sending || !input.trim()} className="btn btn-primary btn-sm">
            <Send size={14} /> {sending ? 'Sende...' : 'Senden'}
          </button>
        </div>
        <div className="text-xs text-muted-foreground">Tipp: Senden mit <span className="font-semibold">Ctrl</span> + <span className="font-semibold">Enter</span>.</div>
      </div>
    </div>
  );
}
