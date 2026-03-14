'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, FileUp, Lock, PenSquare, Plus, Save, Send, Sparkles, X } from 'lucide-react';
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

type ConversationItem = {
  id: string;
  conversation_id: string;
  title: string;
  agent_id?: string | null;
  last_message_at: number;
  message_count: number;
  created_at: number;
  last_message?: {
    content?: string;
  } | null;
};

export function CustomerWebchat() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [activeAgent, setActiveAgent] = useState('');
  const [activeConversationId, setActiveConversationId] = useState('');
  const [conversationTitle, setConversationTitle] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  const { data: conversationPayload, refetch: refetchConversations } = useSmartPoll<{ conversations: ConversationItem[] }>(
    () => fetch('/api/chat/conversations', { cache: 'no-store' }).then((response) => response.json()),
    { interval: 15_000, enabled: Boolean(me?.id) },
  );

  const visibleAgents = Array.isArray(agents)
    ? agents.filter((agent) => preferences.enabled_agent_ids.includes(agent.id) && (agent.id !== 'insta-agent' || preferences.instagram_connected))
    : [];

  const allConversations = conversationPayload?.conversations || [];
  const filteredConversations = useMemo(() => {
    return allConversations.filter((conversation) => {
      const agentId = conversation.agent_id || inferConversationAgentId(conversation.conversation_id);
      return !activeAgent || agentId === activeAgent;
    });
  }, [activeAgent, allConversations]);

  const { data: messagePayload, refetch } = useSmartPoll<{ messages: ChatMessage[] }>(
    () => fetch(`/api/chat/messages?conversation_id=${encodeURIComponent(activeConversationId)}&limit=100`).then((response) => response.json()),
    { interval: 8_000, enabled: Boolean(activeConversationId) },
  );

  useEffect(() => {
    if (!activeAgent && visibleAgents.length > 0) {
      setActiveAgent(visibleAgents[0].id);
    }
    if (activeAgent && !visibleAgents.some((agent) => agent.id === activeAgent)) {
      setActiveAgent(visibleAgents[0]?.id || '');
    }
  }, [activeAgent, visibleAgents]);

  useEffect(() => {
    if (filteredConversations.some((conversation) => conversation.conversation_id === activeConversationId)) {
      return;
    }
    setActiveConversationId(filteredConversations[0]?.conversation_id || '');
  }, [activeConversationId, filteredConversations]);

  const selectedConversation = filteredConversations.find((conversation) => conversation.conversation_id === activeConversationId) || null;

  useEffect(() => {
    setConversationTitle(selectedConversation?.title || '');
  }, [selectedConversation?.conversation_id, selectedConversation?.title]);

  const hasAccess = Boolean(me?.has_agent_access);
  const messages = messagePayload?.messages || [];
  const selectedAgent = visibleAgents.find((agent) => agent.id === activeAgent) || null;
  const onboardingOpen = hasAccess && !me?.onboarding_completed_at;

  async function createConversation(prefillTitle?: string) {
    if (!activeAgent || creatingConversation) return '';
    setCreatingConversation(true);
    setUploadError(null);
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: activeAgent,
          title: prefillTitle || `Chat mit ${selectedAgent?.name || 'Agent'}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Neuer Chat konnte nicht erstellt werden'));
      }
      const nextConversationId = String(payload?.conversation?.conversation_id || '');
      setActiveConversationId(nextConversationId);
      setConversationTitle(String(payload?.conversation?.title || 'Neuer Chat'));
      await refetchConversations();
      return nextConversationId;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Neuer Chat konnte nicht erstellt werden');
      return '';
    } finally {
      setCreatingConversation(false);
    }
  }

  async function saveConversationTitle() {
    if (!activeConversationId || !conversationTitle.trim() || savingTitle) return;
    setSavingTitle(true);
    setUploadError(null);
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConversationId, title: conversationTitle.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Chat-Name konnte nicht gespeichert werden'));
      }
      await refetchConversations();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Chat-Name konnte nicht gespeichert werden');
    } finally {
      setSavingTitle(false);
    }
  }

  async function exportConversation() {
    if (!activeConversationId || exporting) return;
    setExporting(true);
    setUploadError(null);
    try {
      const response = await fetch(`/api/chat/conversations/export?conversation_id=${encodeURIComponent(activeConversationId)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.error || 'Chat konnte nicht exportiert werden'));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(conversationTitle || 'chat').trim() || 'chat'}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Chat konnte nicht exportiert werden');
    } finally {
      setExporting(false);
    }
  }

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
    if ((!content && pendingFiles.length === 0) || !activeAgent || sending || !hasAccess) return;
    setSending(true);
    setUploadError(null);
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = await createConversation(content.slice(0, 48));
      }
      if (!conversationId) {
        throw new Error('Kein Chat ausgewaehlt');
      }
      const attachments = await uploadPendingFiles();
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeAgent,
          content: content || 'Datei-Upload',
          attachments,
          conversation_id: conversationId,
          title: conversationTitle || content.slice(0, 48),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Nachricht konnte nicht gesendet werden'));
      }
      setInput('');
      setPendingFiles([]);
      await Promise.all([refetch(), refetchConversations()]);
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
            <p className="text-xs text-muted-foreground">Chatte nach der Aktivierung direkt mit deinen aktivierten Agenten, speichere Chat-Namen und exportiere komplette Verlaeufe als Markdown.</p>
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
          <div className="grid flex-1 gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-border/50 xl:border-b-0 xl:border-r xl:border-border/50">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Gespeicherte Chats</div>
                  <div className="text-[11px] text-muted-foreground">Mit Namen, Verlauf und Export.</div>
                </div>
                <button type="button" onClick={() => createConversation()} disabled={creatingConversation || !activeAgent} className="btn btn-ghost btn-sm">
                  <Plus size={14} /> {creatingConversation ? '...' : 'Neu'}
                </button>
              </div>
              <div className="max-h-[18rem] overflow-auto p-3 xl:max-h-none xl:h-full xl:min-h-[28rem]">
                {filteredConversations.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                    Noch kein gespeicherter Chat fuer diesen Agenten. Starte rechts einen neuen Chat.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.conversation_id}
                        type="button"
                        onClick={() => setActiveConversationId(conversation.conversation_id)}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${conversation.conversation_id === activeConversationId ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/10 hover:bg-muted/20'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 truncate text-sm font-medium text-foreground">{conversation.title}</div>
                          <div className="text-[11px] text-muted-foreground">{conversation.message_count}</div>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{conversation.last_message?.content || 'Noch keine Nachrichten'}</div>
                        <div className="mt-2 text-[11px] text-muted-foreground">{formatConversationTime(conversation.last_message_at || conversation.created_at)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Chatspeicherung</div>
                    <div className="mt-1 flex gap-2">
                      <div className="relative flex-1">
                        <PenSquare size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={conversationTitle}
                          onChange={(event) => setConversationTitle(event.target.value)}
                          placeholder="Name des Chats eingeben"
                          className="w-full rounded-xl border border-border/60 bg-background py-2 pl-9 pr-3 text-sm"
                        />
                      </div>
                      <button type="button" onClick={saveConversationTitle} disabled={savingTitle || !activeConversationId || !conversationTitle.trim()} className="btn btn-ghost btn-sm">
                        <Save size={14} /> {savingTitle ? '...' : 'Speichern'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => createConversation()} disabled={creatingConversation || !activeAgent} className="btn btn-ghost btn-sm">
                      <Plus size={14} /> Neuen Chat starten
                    </button>
                    <button type="button" onClick={exportConversation} disabled={exporting || !activeConversationId || messages.length === 0} className="btn btn-primary btn-sm">
                      <Download size={14} /> {exporting ? 'Export...' : 'Chat exportieren'}
                    </button>
                  </div>
                </div>
              </div>

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
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function inferConversationAgentId(conversationId: string) {
  const parts = conversationId.split(':');
  if (parts.length >= 3 && parts[0] === 'customer') {
    return parts[2] || '';
  }
  return '';
}

function formatConversationTime(timestamp: number) {
  if (!timestamp) return 'Noch offen';
  return new Date(timestamp * 1000).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}