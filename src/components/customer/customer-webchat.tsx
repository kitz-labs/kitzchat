'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileUp, Lock, Send, Sparkles, X } from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { normalizeWalletPayload, type WalletPayloadBase } from '@/lib/wallet-payload';

type MeUser = {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  plan_amount_cents?: number;
  onboarding_completed_at?: string | null;
};

type AgentItem = {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  model?: string;
};

type Attachment = {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
};

type ChatMessage = {
  id: number;
  from_agent: string;
  content: string;
  created_at: number;
  metadata?: {
    attachments?: Attachment[];
    credits_charged?: number;
    remaining_balance?: number;
    display_mode?: string;
  } | null;
};

type Preferences = {
  enabled_agent_ids: string[];
  instagram_connected: boolean;
};

type WalletSnapshot = WalletPayloadBase;

export function CustomerWebchat() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [activeAgent, setActiveAgent] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({ enabled_agent_ids: [], instagram_connected: false });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setMe(payload?.user || null))
      .catch(() => setMe(null));

    fetch('/api/customer/preferences', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setPreferences(payload?.preferences || { enabled_agent_ids: [], instagram_connected: false }))
      .catch(() => setPreferences({ enabled_agent_ids: [], instagram_connected: false }));

    fetch('/api/wallet', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        return response.ok ? normalizeWalletPayload(payload) : null;
      })
      .then((payload) => setWallet(payload))
      .catch(() => setWallet(null));
  }, []);

  const { data: agents } = useSmartPoll<AgentItem[]>(
    () => fetch('/api/agents?real=true').then((response) => response.json()),
    { interval: 60_000 },
  );
  const visibleAgents = Array.isArray(agents)
    ? agents.filter((agent) => preferences.enabled_agent_ids.includes(agent.id) && (agent.id !== 'insta-agent' || preferences.instagram_connected))
    : [];

  const conversationId = useMemo(() => {
    if (!me?.id || !activeAgent) return '';
    return `customer:${me.id}:${activeAgent}`;
  }, [me?.id, activeAgent]);

  const { data: messagePayload, refetch } = useSmartPoll<{ messages: ChatMessage[] }>(
    () => fetch(`/api/chat/messages?conversation_id=${encodeURIComponent(conversationId)}&limit=100`).then((response) => response.json()),
    { interval: 8_000, enabled: Boolean(conversationId) },
  );

  useEffect(() => {
    if (!activeAgent && visibleAgents.length > 0) {
      setActiveAgent(visibleAgents[0].id);
    }
    if (activeAgent && !visibleAgents.some((agent) => agent.id === activeAgent)) {
      setActiveAgent(visibleAgents[0]?.id || '');
    }
  }, [activeAgent, visibleAgents]);

  const hasAccess = Boolean(me?.has_agent_access);
  const messages = messagePayload?.messages || [];
  const selectedAgent = visibleAgents.find((agent) => agent.id === activeAgent) || null;
  const onboardingOpen = hasAccess && !me?.onboarding_completed_at;

  async function uploadPendingFiles(): Promise<Attachment[]> {
    const attachments: Attachment[] = [];
    for (const file of pendingFiles) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/chat/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || `Datei ${file.name} konnte nicht hochgeladen werden`));
      }
      if (data?.upload) {
        attachments.push(data.upload as Attachment);
      }
    }
    return attachments;
  }

  async function sendMessage() {
    const content = input.trim();
    if ((!content && pendingFiles.length === 0) || !activeAgent || !conversationId || sending || !hasAccess) return;
    setSending(true);
    setUploadError(null);
    try {
      const attachments = await uploadPendingFiles();
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeAgent,
          content: content || 'Datei-Upload',
          attachments,
          conversation_id: conversationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Nachricht konnte nicht gesendet werden'));
      }
      setInput('');
      setPendingFiles([]);
      await refetch();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setPendingFiles((current) => [...current, ...Array.from(fileList)]);
  }

  return (
    <div className="space-y-6 animate-in">
      <section className="panel min-h-[70vh] flex flex-col">
        <div className="panel-header flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Webchat</h1>
            <p className="text-xs text-muted-foreground">Chatte nach der Aktivierung direkt mit deinen aktivierten Agenten und lade Dateien im Chat hoch.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {visibleAgents.length > 0 ? (
              <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Agent</span>
                <select
                  value={activeAgent}
                  onChange={(event) => setActiveAgent(event.target.value)}
                  className="bg-transparent outline-none"
                >
                  {visibleAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="badge border bg-muted/20 text-muted-foreground">
              {hasAccess ? 'Zugang aktiv' : 'Aktivierung offen'}
            </div>
          </div>
        </div>

        {hasAccess && wallet ? (
          <div className={`mx-6 mt-4 rounded-2xl border px-4 py-3 text-sm ${wallet.lowBalanceWarning ? 'border-warning/40 bg-warning/5 text-warning' : 'border-border/60 bg-muted/10 text-foreground'}`}>
            {wallet.premiumModeMessage} · Verfuegbar: {Number(wallet.balance || 0).toLocaleString('de-DE')} Credits
          </div>
        ) : null}

        {!hasAccess ? (
          <div className="panel-body flex-1 flex items-center justify-center">
            <div className="max-w-md rounded-2xl border border-warning/40 bg-warning/5 p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Lock size={22} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Webchat wird erst nach Aktivierung freigeschaltet</h3>
                <p className="mt-2 text-sm text-muted-foreground">Dein Onboarding kannst du trotzdem schon ohne Einzahlung abschliessen. Wenn du danach alle Agenten nutzen willst, startest du die Aktivierung separat auf der Guthaben-Seite.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a href="/usage-token?onboarding=1" className="btn btn-primary text-sm">Onboarding oeffnen</a>
                <a href="/usage-token" className="btn btn-ghost text-sm">Aktivierung starten</a>
              </div>
            </div>
          </div>
        ) : onboardingOpen ? (
          <div className="panel-body flex-1 flex items-center justify-center">
            <div className="max-w-lg rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Schliesse dein Kunden-Onboarding ab</h3>
                <p className="mt-2 text-sm text-muted-foreground">Oeffne Guthaben, pruefe Rabatt und Guthabenstand und schliesse danach dein Onboarding ab.</p>
              </div>
              <a href="/usage-token" className="btn btn-primary text-sm">Guthaben oeffnen</a>
            </div>
          </div>
        ) : (
          <>
            <div className="panel-body flex-1 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                  <div className="space-y-3">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Starte eine neue Unterhaltung</div>
                      <div className="text-xs">{selectedAgent ? `Frage ${selectedAgent.name} alles zu deinen Workflows.` : 'Aktiviere zuerst Agenten in den Einstellungen.'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = me?.username === message.from_agent;
                  const attachments = Array.isArray(message.metadata?.attachments) ? message.metadata?.attachments || [] : [];
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted/40'}`}>
                        <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{mine ? 'Du' : message.from_agent}</div>
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                        {typeof message.metadata?.credits_charged === 'number' ? (
                          <div className={`mt-2 text-[11px] ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                            {message.metadata.credits_charged.toLocaleString('de-DE')} Credits · {message.metadata.display_mode || 'Auto-Modus'} · Rest {Number(message.metadata.remaining_balance || 0).toLocaleString('de-DE')} Credits
                          </div>
                        ) : null}
                        {attachments.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attachments.map((attachment) => (
                              <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className={`rounded-full border px-3 py-1 text-xs ${mine ? 'border-primary-foreground/30' : 'border-border/60'}`}>
                                {attachment.name}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-border/50 p-4 space-y-3">
              {pendingFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((file) => (
                    <span key={`${file.name}-${file.size}`} className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/10 px-3 py-1 text-xs">
                      {file.name}
                      <button type="button" onClick={() => setPendingFiles((current) => current.filter((item) => item !== file))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {uploadError ? <div className="text-sm text-destructive">{uploadError}</div> : null}

              <div className="rounded-2xl border border-border/60 bg-background px-3 py-2 flex items-end gap-2">
                <Bot size={18} className="mb-2 text-muted-foreground" />
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={selectedAgent ? `Schreibe deine Nachricht an ${selectedAgent.name}...` : 'Schreibe deine Nachricht...'}
                  className="min-h-[52px] flex-1 resize-none bg-transparent text-sm outline-none"
                />
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-ghost btn-sm">
                  <FileUp size={14} /> Datei
                </button>
                <button type="button" onClick={sendMessage} disabled={sending || (!input.trim() && pendingFiles.length === 0)} className="btn btn-primary btn-sm">
                  <Send size={14} /> {sending ? 'Sende...' : 'Senden'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}