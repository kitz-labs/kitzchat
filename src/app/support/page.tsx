'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mail, MessageSquare, SendHorizontal, UserRound } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { toast } from '@/components/ui/toast';

type SupportThread = {
  user_id: number;
  username: string;
  email: string | null;
  payment_status: string | null;
  customer_created_at: string;
  message_count: number;
  unread_customer_count: number;
  unread_support_count: number;
  last_sender: 'customer' | 'support';
  last_message: string;
  last_message_at: string | null;
};

type SupportSummary = {
  total_threads: number;
  unread_threads: number;
  unread_customer_messages: number;
};

type SupportMessage = {
  id: number;
  sender: 'customer' | 'support';
  message: string;
  read_at: string | null;
  created_at: string;
};

type SupportConversation = {
  customer: {
    id: number;
    username: string;
    email?: string | null;
    payment_status?: string | null;
  };
  messages: SupportMessage[];
};

export default function SupportPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInbox() {
    setLoadingThreads(true);
    try {
      const response = await fetch('/api/admin/support', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Support-Inbox konnte nicht geladen werden');
      setThreads(Array.isArray(payload?.threads) ? payload.threads : []);
      setSummary(payload?.summary || null);
      setError(null);
      setSelectedUserId((current) => current ?? payload?.threads?.[0]?.user_id ?? null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Support-Inbox konnte nicht geladen werden');
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadConversation(userId: number) {
    setLoadingConversation(true);
    try {
      const response = await fetch(`/api/admin/support/${userId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Support-Chat konnte nicht geladen werden');
      setConversation(payload);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Support-Chat konnte nicht geladen werden');
      setConversation(null);
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadInbox().catch(() => null);
  }, [ready]);

  useEffect(() => {
    if (!ready || !selectedUserId) return;
    loadConversation(selectedUserId).then(() => loadInbox()).catch(() => null);
  }, [ready, selectedUserId]);

  async function sendReply() {
    if (!selectedUserId || !replyDraft.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/admin/support/${selectedUserId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Support-Antwort konnte nicht gesendet werden');
      setConversation(payload);
      setReplyDraft('');
      toast.success('Support-Antwort gesendet');
      await loadInbox();
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Support-Antwort konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
  }

  if (!ready || loadingThreads) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<Mail size={16} />} label="Support-Threads" value={String(summary?.total_threads ?? 0)} />
        <SummaryCard icon={<MessageSquare size={16} />} label="Ungelesene Threads" value={String(summary?.unread_threads ?? 0)} />
        <SummaryCard icon={<UserRound size={16} />} label="Offene Kunden-Nachrichten" value={String(summary?.unread_customer_messages ?? 0)} />
      </div>

      <div className="panel">
        <div className="panel-body flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Support</h1>
            <p className="text-xs text-muted-foreground">Hier siehst du alle Kundenanfragen im Chat-Verlauf. Neue Anfragen erzeugen Notifications und Operations-Alerts.</p>
          </div>
          <Link href="/support/db" className="text-sm text-primary hover:underline">
            Zur DB-Ansicht
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">Kundenanfragen</h2>
              <p className="text-xs text-muted-foreground">Waehle links einen Thread aus.</p>
            </div>
          </div>
          <div className="panel-body space-y-2 max-h-[70vh] overflow-y-auto">
            {threads.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                Aktuell liegen keine Support-Anfragen vor.
              </div>
            ) : threads.map((thread) => {
              const active = thread.user_id === selectedUserId;
              return (
                <button
                  key={thread.user_id}
                  type="button"
                  onClick={() => setSelectedUserId(thread.user_id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? 'border-primary/40 bg-primary/10' : 'border-border/60 bg-muted/10 hover:bg-muted/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{thread.username}</div>
                      <div className="text-xs text-muted-foreground truncate">{thread.email || 'keine E-Mail'}</div>
                    </div>
                    {thread.unread_customer_count > 0 ? (
                      <span className="badge border bg-warning/10 text-warning">{thread.unread_customer_count}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{thread.last_message}</div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{thread.last_sender === 'customer' ? 'Kunde' : 'Support'}</span>
                    <span>{thread.last_message_at ? new Date(thread.last_message_at).toLocaleString('de-DE') : 'n/a'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">Support-Chat</h2>
              <p className="text-xs text-muted-foreground">
                {conversation?.customer ? `${conversation.customer.username} · ${conversation.customer.email || 'keine E-Mail'}` : 'Noch kein Thread ausgewaehlt'}
              </p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            {loadingConversation ? (
              <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />
            ) : !conversation ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-6 text-sm text-muted-foreground">
                Waehle links einen Kunden-Thread aus.
              </div>
            ) : (
              <>
                <div className="max-h-[55vh] overflow-y-auto space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  {conversation.messages.map((message) => (
                    <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.sender === 'support' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-background border border-border/60'}`}>
                      <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{message.sender === 'support' ? 'Support' : 'Kunde'}</div>
                      <div className="whitespace-pre-wrap">{message.message}</div>
                      <div className="mt-2 text-[10px] opacity-70">{new Date(message.created_at).toLocaleString('de-DE')}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/80 p-3 space-y-3">
                  <textarea
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    className="min-h-28 w-full rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm"
                    placeholder="Antwort an den Kunden..."
                  />
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      Support-Antworten erscheinen direkt im Kundenbereich unter Einstellungen → Support.
                    </div>
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || !replyDraft.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SendHorizontal size={14} />
                      {sending ? 'Sende...' : 'Antwort senden'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="panel">
      <div className="panel-body flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}