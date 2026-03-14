'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, SendHorizontal } from 'lucide-react';

type SupportMessage = {
  id: number;
  sender: 'customer' | 'support';
  message: string;
  created_at: string;
};

export function CustomerSupportPanel({ compact = false }: { compact?: boolean }) {
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportDraft, setSupportDraft] = useState('');
  const [supportSending, setSupportSending] = useState(false);

  const loadSupport = useCallback(async () => {
    const payload = await fetch('/api/customer/support', { cache: 'no-store' }).then((response) => response.json());
    setSupportMessages(Array.isArray(payload?.messages) ? payload.messages : []);
  }, []);

  useEffect(() => {
    loadSupport().catch(() => setSupportMessages([]));
  }, [loadSupport]);

  async function sendSupportMessage() {
    const message = supportDraft.trim();
    if (!message || supportSending) return;
    setSupportSending(true);
    try {
      const response = await fetch('/api/customer/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Support-Nachricht konnte nicht gesendet werden'));
      }
      setSupportMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setSupportDraft('');
    } finally {
      setSupportSending(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="text-sm font-medium">Support-Chat</h2>
          <p className="text-xs text-muted-foreground">Schreibe direkt an den Support. Antworten erscheinen ohne Umweg wieder hier.</p>
        </div>
      </div>
      <div className="panel-body space-y-4">
        <div className={`${compact ? 'max-h-72' : 'max-h-[34rem]'} space-y-3 overflow-auto rounded-2xl border border-border/50 bg-muted/10 p-4`}>
          {supportMessages.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LifeBuoy size={20} />
              </div>
              <div>
                <div className="font-medium text-foreground">Noch kein Support-Chat vorhanden</div>
                <div className="mt-1 text-xs">Starte hier direkt eine neue Anfrage.</div>
              </div>
            </div>
          ) : supportMessages.map((message) => (
            <div key={message.id} className={`flex ${message.sender === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${message.sender === 'customer' ? 'bg-primary text-primary-foreground' : 'border border-border/50 bg-background'}`}>
                <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{message.sender === 'customer' ? 'Du' : 'Support'}</div>
                <div className="whitespace-pre-wrap">{message.message}</div>
                <div className="mt-2 text-[11px] opacity-70">{new Date(message.created_at).toLocaleString('de-DE')}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-background p-3">
          <textarea
            value={supportDraft}
            onChange={(event) => setSupportDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendSupportMessage();
              }
            }}
            placeholder="Beschreibe dein Problem oder deine Frage..."
            className="min-h-[88px] flex-1 resize-none bg-transparent text-sm outline-none"
          />
          <button type="button" onClick={sendSupportMessage} disabled={supportSending || !supportDraft.trim()} className="btn btn-primary btn-sm">
            <SendHorizontal size={14} /> {supportSending ? 'Sende...' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  );
}