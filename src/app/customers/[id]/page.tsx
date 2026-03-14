'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Bot, CreditCard, MessageSquare, Wallet } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type CustomerRecord = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  payment_status?: 'not_required' | 'pending' | 'paid';
  plan_amount_cents?: number | null;
  wallet_balance_cents?: number | null;
  onboarding_completed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
  next_topup_discount_percent?: number | null;
  created_at: string;
};

type AgentUsageRecord = {
  agent_id: string | null;
  name: string;
  emoji: string;
  runs: number;
  total_tokens: number;
  total_cents: number;
  last_used_at: number | null;
};

type FreeMessageUsage = {
  limit: number;
  used: number;
  remaining: number;
};

type CustomerPayload = {
  customer: CustomerRecord;
  free_messages: FreeMessageUsage;
  summary: {
    conversations: number;
    total_tokens: number;
    total_cents: number;
    last_used_at: number | null;
  };
  agents: AgentUsageRecord[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [payload, setPayload] = useState<CustomerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [voucherPercent, setVoucherPercent] = useState('0');
  const [creditAmount, setCreditAmount] = useState('20');
  const [supportMessage, setSupportMessage] = useState('');

  async function loadCustomer() {
    if (!params?.id) return;

    const response = await fetch(`/api/customers/${params.id}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || 'Failed to load customer'));

    setPayload(data);
    setError(null);
    setUsername(data.customer?.username ?? '');
    setEmail(data.customer?.email ?? '');
    setVoucherPercent(String(data.customer?.next_topup_discount_percent ?? 0));
  }

  useEffect(() => {
    if (!ready || !params?.id) return;

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/customers/${params.id}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error || 'Failed to load customer'));
        if (!alive) return;

        setPayload(data);
        setError(null);
        setUsername(data.customer?.username ?? '');
        setEmail(data.customer?.email ?? '');
        setVoucherPercent(String(data.customer?.next_topup_discount_percent ?? 0));
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load customer');
        setPayload(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [params?.id, ready]);

  async function patchCustomer(body: Record<string, unknown>, successMessage: string) {
    if (!params?.id) return;

    setSaving(true);
    setNotice(null);
    setActionError(null);

    try {
      const response = await fetch(`/api/customers/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Aktion fehlgeschlagen'));
      await loadCustomer();
      setNotice(successMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function sendSupportReply() {
    if (!params?.id || !supportMessage.trim()) return;

    setSaving(true);
    setNotice(null);
    setActionError(null);

    try {
      const response = await fetch(`/api/admin/support/${params.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: supportMessage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Nachricht konnte nicht gesendet werden'));
      setSupportMessage('');
      setNotice('Support-Nachricht gesendet');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error || !payload) {
    return (
      <div className="panel">
        <div className="panel-body space-y-2">
          <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft size={14} />
            Zurueck zur Kundenliste
          </Link>
          <div className="text-sm font-medium">Kundendetail nicht verfuegbar</div>
          <div className="text-xs text-muted-foreground">{error || 'Unbekannter Fehler'}</div>
        </div>
      </div>
    );
  }

  const { customer, free_messages: freeMessages, summary, agents } = payload;
  const creditAmountCents = Math.max(0, Math.round(Number(creditAmount || '0') * 100));
  const isPaid = customer.payment_status === 'paid';

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft size={14} />
            Zurueck zur Kundenliste
          </Link>
          <h1 className="mt-3 text-xl font-semibold">{customer.username}</h1>
          <p className="text-xs text-muted-foreground">Kunde bearbeiten, Zugriff sperren, Guthaben buchen und direkte Support-Nachrichten senden.</p>
        </div>
        <div className={`badge border ${isPaid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {isPaid ? 'bezahlt' : 'gesperrt oder ausstehend'}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<MessageSquare size={16} />} label="Unterhaltungen" value={String(summary.conversations)} />
        <SummaryCard icon={<Bot size={16} />} label="Genutzte Agenten" value={String(agents.length)} />
        <SummaryCard icon={<Wallet size={16} />} label="Token gesamt" value={summary.total_tokens.toLocaleString()} />
        <SummaryCard icon={<CreditCard size={16} />} label="Abgerechnet" value={`€${(summary.total_cents / 100).toFixed(2)}`} />
        <SummaryCard icon={<MessageSquare size={16} />} label="Freie Nachrichten" value={`${freeMessages.remaining}/${freeMessages.limit}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-4">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Admin-Aktionen</h2>
                <p className="text-xs text-muted-foreground">Stammdaten, Zahlung, Voucher und manuelle Credits direkt an diesem Konto.</p>
              </div>
            </div>
            <div className="panel-body space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Benutzername</div>
                  <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">E-Mail</div>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={() => patchCustomer({ username, email: email || null }, 'Kundendaten gespeichert')} disabled={saving} className="btn btn-primary text-sm">
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => patchCustomer({ payment_status: isPaid ? 'pending' : 'paid' }, isPaid ? 'Kunde gesperrt' : 'Kunde freigeschaltet')}
                  disabled={saving}
                  className="btn text-sm"
                >
                  {isPaid ? 'Sperren' : 'Freischalten'}
                </button>
                <button type="button" onClick={() => patchCustomer({ ensure_stripe_customer: true }, 'Stripe-Kunde bereit')} disabled={saving} className="btn text-sm">
                  Stripe-Kunde anlegen
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Kunden wirklich löschen? Dies kann nicht rückgängig gemacht werden.')) return;
                    setSaving(true);
                    setActionError(null);
                    try {
                      const res = await fetch('/api/users', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: Number(params.id) }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(String(data?.error || 'Kunde konnte nicht gelöscht werden'));
                      setNotice('Kunde gelöscht');
                      window.location.href = '/customers';
                    } catch (err) {
                      setActionError(err instanceof Error ? err.message : 'Kunde konnte nicht gelöscht werden');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="btn btn-destructive text-sm"
                >
                  Kunde löschen
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="space-y-1.5 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Voucher fuer naechsten Kauf</div>
                  <input value={voucherPercent} onChange={(event) => setVoucherPercent(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
                </label>
                <div className="flex items-end">
                  <button type="button" onClick={() => patchCustomer({ next_topup_discount_percent: Number(voucherPercent || '0') }, 'Voucher aktualisiert')} disabled={saving} className="btn text-sm">
                    Voucher setzen
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <label className="space-y-1.5 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Credits in Euro</div>
                  <input value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm" />
                </label>
                <div className="flex items-end">
                  <button type="button" onClick={() => patchCustomer({ add_credits_cents: creditAmountCents }, 'Credits gutgeschrieben')} disabled={saving || creditAmountCents <= 0} className="btn text-sm">
                    Credits buchen
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => patchCustomer({ mark_paid_with_credits_cents: creditAmountCents }, 'Zahlung ueber Credits markiert')}
                    disabled={saving || creditAmountCents <= 0}
                    className="btn text-sm"
                  >
                    Als bezahlt markieren
                  </button>
                </div>
              </div>

              {notice ? <div className="text-sm text-success">{notice}</div> : null}
              {actionError ? <div className="text-sm text-destructive">{actionError}</div> : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Support-Nachricht</h2>
                <p className="text-xs text-muted-foreground">Direkte Antwort an den Kunden ohne den normalen Support-Thread oeffnen zu muessen.</p>
              </div>
            </div>
            <div className="panel-body space-y-3">
              <textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-border/60 bg-background px-3 py-3 text-sm"
                placeholder="Nachricht an den Kunden..."
              />
              <button type="button" onClick={sendSupportReply} disabled={saving || !supportMessage.trim()} className="btn btn-primary text-sm">
                Nachricht senden
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Abrechnungsstand</h2>
                <p className="text-xs text-muted-foreground">Aktueller Kundenzugang und Stripe-Verknuepfung im Ueberblick.</p>
              </div>
            </div>
            <div className="panel-body space-y-3 text-sm">
              <InfoRow label="E-Mail" value={customer.email || 'nicht hinterlegt'} />
              <InfoRow label="Plan" value={`€${((customer.plan_amount_cents ?? 0) / 100).toFixed(2)}`} />
              <InfoRow label="Guthaben" value={`€${((customer.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
              <InfoRow label="Freie Nachrichten" value={`${freeMessages.remaining} verbleibend von ${freeMessages.limit}`} />
              <InfoRow label="Voucher" value={customer.next_topup_discount_percent ? `${customer.next_topup_discount_percent}%` : 'kein aktiver Rabatt'} />
              <InfoRow label="Onboarding" value={customer.onboarding_completed_at ? 'abgeschlossen' : 'offen'} />
              <InfoRow label="Stripe-Kunde" value={customer.stripe_customer_id || 'noch nicht angelegt'} />
              <InfoRow label="Checkout-Sitzung" value={customer.stripe_checkout_session_id || 'noch nicht gestartet'} />
              <InfoRow label="Erstellt" value={new Date(customer.created_at).toLocaleString()} />
              <InfoRow label="Letzte Agentennutzung" value={summary.last_used_at ? new Date(summary.last_used_at * 1000).toLocaleString() : 'noch keine Nutzung'} />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">Agentenaktivitaet</h2>
              <p className="text-xs text-muted-foreground">Welche Agenten dieser Kunde tatsaechlich verwendet hat und wie haeufig.</p>
            </div>
          </div>
          <div className="panel-body grid gap-3">
            {agents.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                Bisher wurde noch keine Agentennutzung erfasst.
              </div>
            ) : (
              agents.map((agent) => (
                <div key={agent.agent_id || agent.name} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-xl">{agent.emoji}</div>
                      <div>
                        <div className="text-sm font-semibold">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">{agent.agent_id || 'unbekannter-agent'}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{agent.runs} Nutzungsvorgaenge</div>
                      <div>{agent.last_used_at ? new Date(agent.last_used_at * 1000).toLocaleString() : 'nie'}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Tokens" value={agent.total_tokens.toLocaleString()} />
                    <MiniStat label="Abgerechnet" value={`€${(agent.total_cents / 100).toFixed(2)}`} />
                    <MiniStat label="Laeufe" value={String(agent.runs)} />
                  </div>
                </div>
              ))
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
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl sm:text-2xl font-semibold break-words">{value}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="max-w-[60%] text-right text-sm">{value}</div>
    </div>
  );
}