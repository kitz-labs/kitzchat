'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Send, Zap, Wrench } from 'lucide-react';

type MaestroMessage = { role: 'user' | 'assistant' | 'system'; content: string; ts: number };

export default function MaestroPage() {
  const [me, setMe] = useState<{ username?: string; role?: string } | null>(null);
  const [messages, setMessages] = useState<MaestroMessage[]>([
    {
      role: 'system',
      ts: Date.now(),
      content: 'MAESTRO ist dein Admin-Agent. Beschreibe kurz dein Ziel (z.B. “Umsatz steigern”, “Bug fixen”, “Agents optimieren”) – ich liefere Vorschlaege + sichere naechste Schritte.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload) => setMe(payload?.user || null))
      .catch(() => setMe(null));
  }, []);

  const canUse = useMemo(() => (me?.role === 'admin') || (me?.username === 'ceo') || (me?.username === 'widauer'), [me?.role, me?.username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || sending) return;
    if (!canUse) {
      setMessages((current) => [...current, { role: 'system', ts: Date.now(), content: 'Nur Admin/CEO darf MAESTRO nutzen.' }]);
      return;
    }
    setSending(true);
    setInput('');
    setMessages((current) => [...current, { role: 'user', ts: Date.now(), content: prompt }]);
    try {
      const res = await fetch('/api/admin/maestro/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(data?.error || 'MAESTRO chat failed'));
      setMessages((current) => [...current, { role: 'assistant', ts: Date.now(), content: String(data?.answer || '') }]);
    } catch (err) {
      setMessages((current) => [...current, { role: 'system', ts: Date.now(), content: err instanceof Error ? err.message : 'MAESTRO Fehler' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldCheck size={18} /> MAESTRO</h1>
            <p className="text-xs text-muted-foreground">Admin-only Steuerzentrale: Vorschlaege, Checks und naechste Schritte. Aktionen werden spaeter als sichere Tools (Preview → Confirm → Execute) erweitert.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge border ${canUse ? 'bg-success/10 text-success border-success/30' : 'bg-warning/10 text-warning border-warning/30'}`}>
              {canUse ? 'Admin Zugriff' : 'Kein Zugriff'}
            </span>
          </div>
        </div>
        <div className="panel-body">
          <div className="rounded-2xl border border-border/60 bg-muted/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2"><Wrench size={16} /> Ops Chat</div>
              <div className="text-xs text-muted-foreground">Antworten sind Vorschlaege (sicher, minimal-invasiv).</div>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] md:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : m.role === 'assistant'
                        ? 'bg-background/40 border border-border/60'
                        : 'bg-muted/30 border border-border/50 text-muted-foreground'
                  }`}>
                    <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                      {m.role === 'user' ? 'Du' : m.role === 'assistant' ? 'MAESTRO' : 'System'}
                    </div>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-border/50 bg-background/30">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Beschreibe dein Ziel (z.B. ‚Umsatz steigern‘, ‚Bug fixen‘, ‚Agenten optimieren‘)…"
                  className="flex-1 min-h-[56px] max-h-[140px] resize-none rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="button" onClick={send} disabled={sending || !input.trim()} className="btn btn-primary btn-sm">
                  {sending ? <Zap size={14} /> : <Send size={14} />} {sending ? '...' : 'Senden'}
                </button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">Tipp: Senden mit `Ctrl/⌘ + Enter`.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

