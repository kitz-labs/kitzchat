'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, FileUp, Lock, PenSquare, Plus, Save, Send, Sparkles, X, Wand2, Wallet, HelpCircle, Trash2 } from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useCustomerBillingSync } from '@/hooks/use-customer-billing-sync';
import { normalizeWalletPayload, type WalletPayloadBase } from '@/lib/wallet-payload';
import { creditsToEur } from '@/lib/credits';

type MeUser = {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  plan_amount_cents?: number;
  onboarding_completed_at?: string | null;
  wallet_balance_cents?: number;
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
  const [awaitingAgentReply, setAwaitingAgentReply] = useState(false);
  const [lastSentAtSec, setLastSentAtSec] = useState<number | null>(null);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({ enabled_agent_ids: [], instagram_connected: false });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const loadMe = useCallback(async () => {
    const payload = await fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.json());
    setMe(payload?.user || null);
  }, []);

  const loadPreferences = useCallback(async () => {
    const payload = await fetch('/api/customer/preferences', { cache: 'no-store' }).then((response) => response.json());
    setPreferences(payload?.preferences || { enabled_agent_ids: [], instagram_connected: false });
  }, []);

  const loadWallet = useCallback(async () => {
    const payload = await fetch('/api/wallet', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        return response.ok ? normalizeWalletPayload(data) : null;
      });
    setWallet(payload);
  }, []);

  useEffect(() => {
    loadMe().catch(() => setMe(null));
    loadPreferences().catch(() => setPreferences({ enabled_agent_ids: [], instagram_connected: false }));
    loadWallet().catch(() => setWallet(null));
  }, [loadMe, loadPreferences, loadWallet]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('kitzchat-quickstart-closed');
      if (stored === '1') setQuickStartOpen(false);
    } catch {
      // ignore
    }
  }, []);

  useCustomerBillingSync({
    onConfirmed: async () => {
      setConfirmingPayment(true);
      await Promise.all([loadMe(), loadPreferences(), loadWallet()]);
      setConfirmingPayment(false);
    },
  });

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== 'kitzchat-payment-complete') return;
      setConfirmingPayment(true);
      Promise.all([loadMe(), loadPreferences(), loadWallet()])
        .catch(() => {})
        .finally(() => setConfirmingPayment(false));
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadMe, loadPreferences, loadWallet]);

  const { data: agents } = useSmartPoll<AgentItem[]>(
    () => fetch('/api/agents?real=true').then((response) => response.json()),
    { interval: 60_000 },
  );

  const { data: conversationPayload, refetch: refetchConversations } = useSmartPoll<{ conversations: ConversationItem[] }>(
    () => fetch('/api/chat/conversations', { cache: 'no-store' }).then((response) => response.json()),
    { interval: 15_000, enabled: Boolean(me?.id) },
  );

  const enabledAgentIds = useMemo(() => {
    const explicit = Array.isArray(preferences.enabled_agent_ids) ? preferences.enabled_agent_ids.filter(Boolean) : [];
    if (explicit.length > 0) return new Set(explicit);
    // If the customer has no explicit preferences yet (fresh account), default to all available agents.
    return new Set(Array.isArray(agents) ? agents.map((a) => a.id) : []);
  }, [agents, preferences.enabled_agent_ids]);

  const visibleAgents = Array.isArray(agents)
    ? agents.filter((agent) => enabledAgentIds.has(agent.id))
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

  const walletCents = Number(me?.wallet_balance_cents ?? 0);
  const walletCredits = Number(wallet?.balance ?? 0);
  const hasAccess =
    Boolean(me?.has_agent_access) ||
    me?.payment_status === 'paid' ||
    (Number.isFinite(walletCents) && walletCents > 0) ||
    (Number.isFinite(walletCredits) && walletCredits > 0);
  const chatLocked = Boolean(me) && !hasAccess && me?.account_type !== 'customer';
  const messages = messagePayload?.messages || [];
  const selectedAgent = visibleAgents.find((agent) => agent.id === activeAgent) || null;
  const onboardingOpen = !hasAccess && !me?.onboarding_completed_at;

  useEffect(() => {
    if (!hasAccess) return;
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const agentParam = url.searchParams.get('agent');
      const template = url.searchParams.get('template');
      const promptParam = url.searchParams.get('prompt');

      if (agentParam && enabledAgentIds.has(agentParam)) setActiveAgent(agentParam);

      const templates: Record<string, string> = {
        quickstart: 'Ich will heute ein klares Ergebnis: (1) Ziel, (2) Plan in 5 Schritten, (3) sofortiger erster Output. Frage maximal 1 Rueckfrage und starte dann.',
        leads: 'Ich will mehr Leads. Bitte erstelle: 3 Messaging-Winkel, 5 Hooks, ein klares Offer + CTA, und einen 7-Tage Mini-Plan. Frage maximal 1 Rueckfrage.',
        campaign: 'Bitte baue eine Kampagne: Zielgruppe, Hook, 3 Varianten, Kanalplan (IG/LI/Email), Messplan (Hypothese, Metrik, Stop/Go). Frage maximal 1 Rueckfrage.',
        email: 'Schreibe eine professionelle E-Mail. Bitte frage zuerst: Kontext + Ziel + Tonalitaet (max 1 Rueckfrage), dann liefere 2 Varianten.',
        support: 'Formuliere eine professionelle Support-Antwort (freundlich, klar, deeskalierend). Stelle max 1 Rueckfrage, dann liefere 2 Varianten + kurze Begründung.',
        docs: 'Ich will meine Dokumente sauber ordnen. Liefere: Ordnerstruktur, Namensschema, Regeln, und eine To-do Liste. Frage maximal 1 Rueckfrage.',
      };

      const nextPrompt = promptParam || (template ? templates[template] : '');
      if (nextPrompt && (!input || input.trim().length === 0)) {
        setInput(nextPrompt);
      }
    } catch {
      // ignore
    }
  }, [hasAccess, enabledAgentIds, input]);
  
  useEffect(() => {
    if (!awaitingAgentReply || !lastSentAtSec) return;
    const resolved = messages.some((message) => {
      if (!message || typeof message.created_at !== 'number') return false;
      if (message.created_at < lastSentAtSec) return false;
      const mine = me?.username === message.from_agent;
      if (mine) return false;
      return true;
    });
    if (resolved) {
      setAwaitingAgentReply(false);
    }
  }, [awaitingAgentReply, lastSentAtSec, me?.username, messages]);

  useEffect(() => {
    // Auto-scroll while waiting for an agent reply, or right after sending.
    if (!awaitingAgentReply && !sending) return;
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [awaitingAgentReply, sending, messages.length]);

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

  async function deleteConversation(conversationId: string) {
    if (!conversationId) return;
    const confirmed = window.confirm('Diesen Chat wirklich loeschen?');
    if (!confirmed) return;
    setUploadError(null);
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || 'Chat konnte nicht geloescht werden'));
      }
      if (conversationId === activeConversationId) {
        setActiveConversationId('');
        setConversationTitle('');
      }
      await refetchConversations();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Chat konnte nicht geloescht werden');
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
      if (typeof data?.message?.created_at === 'number') {
        setLastSentAtSec(Number(data.message.created_at));
        setAwaitingAgentReply(true);
      } else {
        setLastSentAtSec(Math.floor(Date.now() / 1000));
        setAwaitingAgentReply(true);
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
    <div className="h-full min-h-0 flex flex-col animate-in">
      <section className="panel flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="panel-header flex items-center justify-between gap-3 bg-surface-1/60">
          <div>
            <h1 className="text-xl font-semibold">Chat</h1>
            <p className="text-xs text-muted-foreground">Chatte nach der Aktivierung direkt mit deinen aktivierten Agenten, speichere Chat-Namen und exportiere komplette Verlaeufe als Markdown.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {visibleAgents.length > 0 ? (
              <label className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Agent</span>
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

        {hasAccess ? (
          <div className="mx-6 mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] items-start">
            <div className="flex flex-wrap items-center gap-2">
              <a href="#" onClick={(e) => { e.preventDefault(); createConversation(); }} className="btn btn-primary btn-sm inline-flex items-center gap-2">
                <Wand2 size={14} /> Neuer Chat
              </a>
              <a href="/agents" className="btn btn-ghost btn-sm inline-flex items-center gap-2">
                <Bot size={14} /> Agenten anpassen
              </a>
              <a href="/usage-token" className="btn btn-ghost btn-sm inline-flex items-center gap-2">
                <Wallet size={14} /> Guthaben aufladen
              </a>
              <a href="/hilfe" className="btn btn-ghost btn-sm inline-flex items-center gap-2">
                <HelpCircle size={14} /> Hilfe
              </a>
            </div>

            <div className="hidden md:flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span className="badge badge-neutral">Tipp: Starte mit dem Agent „Master Agent“ fuers Routing.</span>
            </div>
          </div>
        ) : null}

        {confirmingPayment ? (
          <div className="mx-6 mt-4 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
            Zahlung erkannt. Dein Dashboard und der Chat werden gerade freigeschaltet.
          </div>
        ) : null}

        {hasAccess && wallet ? (
          <div className={`mx-6 mt-4 rounded-2xl border px-4 py-3 text-sm ${wallet.lowBalanceWarning ? 'border-warning/40 bg-warning/5 text-warning' : 'border-border/60 bg-muted/10 text-foreground'}`}>
            {wallet.premiumModeMessage} · Verfuegbar: €{creditsToEur(wallet.balance || 0).toFixed(2)}
          </div>
        ) : null}

        {hasAccess && quickStartOpen ? (
          <div className="mx-6 mt-3 rounded-2xl border border-border/60 bg-background/35 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Schnellstart</div>
                <div className="mt-1 text-sm font-semibold">In 60 Sekunden produktiv</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Keine Codes, keine Technik: einfach Fragen stellen – Nexora setzt um.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setQuickStartOpen(false);
                  try { window.localStorage.setItem('kitzchat-quickstart-closed', '1'); } catch {}
                }}
              >
                <X size={14} /> Ausblenden
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <div className="text-xs font-semibold">1) Ziel sagen</div>
                <div className="mt-1 text-xs text-muted-foreground">„Ich will mehr Leads fuer &lt;Angebot&gt;.“</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <div className="text-xs font-semibold">2) Agent waehlen</div>
                <div className="mt-1 text-xs text-muted-foreground">MarketingAgent / SalesAgent / SupportAgent.</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <div className="text-xs font-semibold">3) Copy‑Paste Ergebnis</div>
                <div className="mt-1 text-xs text-muted-foreground">Nexora liefert direkt Posts, Mails, Pläne.</div>
              </div>
            </div>
          </div>
        ) : null}

        {chatLocked ? (
          <div className="panel-body flex-1 flex items-center justify-center">
            <div className="max-w-md rounded-2xl border border-warning/40 bg-warning/5 p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Lock size={22} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Chat wird erst nach Aktivierung freigeschaltet</h3>
                <p className="mt-2 text-sm text-muted-foreground">Dein Onboarding kannst du trotzdem schon ohne Einzahlung abschliessen. Wenn du danach alle Agenten nutzen willst, startest du die Aktivierung separat auf der Guthaben-Seite.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a href="/usage-token?onboarding=1" className="btn btn-primary text-sm">Onboarding oeffnen</a>
                <a href="/usage-token" className="btn btn-ghost text-sm">Aktivierung starten</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {onboardingOpen ? (
              <div className="mx-6 mt-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">Tipp: Onboarding abschliessen</div>
                  <a href="/usage-token" className="btn btn-primary btn-sm">Guthaben &amp; Onboarding</a>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Du kannst schon chatten – mit abgeschlossenem Onboarding werden deine Ergebnisse noch stärker.
                </div>
              </div>
            ) : null}

            <div className="grid flex-1 min-h-0 gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-border/50 xl:border-b-0 xl:border-r xl:border-border/50 flex flex-col min-h-0 bg-surface-1/35">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-3 bg-surface-1/60">
                <div>
                  <div className="text-sm font-semibold">Gespeicherte Chats</div>
                  <div className="text-[11px] text-muted-foreground">Mit Namen, Verlauf und Export.</div>
                </div>
                <button type="button" onClick={() => createConversation()} disabled={creatingConversation || !activeAgent} className="btn btn-ghost btn-sm">
                  <Plus size={14} /> {creatingConversation ? '...' : 'Neu'}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
                {filteredConversations.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                    Noch kein gespeicherter Chat fuer diesen Agenten. Starte rechts einen neuen Chat.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredConversations.map((conversation) => (
                      <div
                        key={conversation.conversation_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveConversationId(conversation.conversation_id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setActiveConversationId(conversation.conversation_id);
                          }
                        }}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${conversation.conversation_id === activeConversationId ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/10 hover:bg-muted/20'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 truncate text-sm font-medium text-foreground">{conversation.title}</div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{conversation.message_count}</span>
                            <button
                              type="button"
                              className="rounded-full border border-border/60 p-1 text-muted-foreground hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteConversation(conversation.conversation_id);
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{conversation.last_message?.content || 'Noch keine Nachrichten'}</div>
                        <div className="mt-2 text-[11px] text-muted-foreground">{formatConversationTime(conversation.last_message_at || conversation.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col p-3 xl:p-4">
              <div className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-surface-1/55 overflow-hidden shadow-sm">
                <div className="border-b border-border/50 px-4 py-3 bg-surface-1/60">
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

                <div className="panel-body flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 bg-gradient-to-b from-transparent via-transparent to-black/10">
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
                          <div className={`max-w-[92%] md:max-w-[78%] rounded-2xl px-4 py-3 ${mine ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-background/40 border border-border/60 shadow-sm'}`}>
                            <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{mine ? 'Du' : message.from_agent}</div>
                            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
                            {typeof message.metadata?.credits_charged === 'number' ? (
                              <div className={`mt-2 text-[11px] ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                €{creditsToEur(message.metadata.credits_charged || 0).toFixed(2)} · {message.metadata.display_mode || 'Auto-Modus'} · Rest €{creditsToEur(message.metadata.remaining_balance || 0).toFixed(2)}
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

                  {awaitingAgentReply ? (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] md:max-w-[78%] rounded-2xl px-4 py-3 bg-muted/40">
                        <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{selectedAgent?.name || 'Agent'}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <span>Agent schreibt...</span>
                          <span className="inline-flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div ref={scrollAnchorRef} />
                </div>

                <div className="border-t border-border/50 p-4 space-y-3 bg-background/40">
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
                      rows={3}
                      className="min-h-[84px] max-h-[220px] flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
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
