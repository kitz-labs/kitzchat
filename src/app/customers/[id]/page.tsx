'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Bot, CreditCard, MessageSquare, RefreshCcw, Wallet } from 'lucide-react';
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
  payments?: Array<{
    stripe_session_id: string;
    stripe_payment_intent_id: string | null;
    stripe_customer_id: string | null;
    gross_amount_eur: number;
    currency: string;
    status: string;
    credits_issued: number;
    created_at: string;
  }>;
};

type MemoryFile = { path: string; name: string; size_bytes: number; updated_at: string };
type MemoryPayload = { basePath: string; files: MemoryFile[] };
type EntitlementFeature = { feature_code: string; name: string; default_enabled: boolean; enabled: boolean; source: string; enabled_at?: string | null };
type EntitlementsPayload = { user_id: number; features: EntitlementFeature[] };

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
  const [memory, setMemory] = useState<MemoryPayload | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryFile, setMemoryFile] = useState<string | null>(null);
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [entitlements, setEntitlements] = useState<EntitlementsPayload | null>(null);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(null);

  async function loadEntitlements(userId: number) {
    setEntitlementsLoading(true);
    setEntitlementsError(null);
    try {
      const response = await fetch(`/api/admin/entitlements?user_id=${encodeURIComponent(String(userId))}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Failed to load entitlements'));
      setEntitlements(data);
    } catch (err) {
      setEntitlementsError(err instanceof Error ? err.message : 'Failed to load entitlements');
      setEntitlements(null);
    } finally {
      setEntitlementsLoading(false);
    }
  }

  async function loadMemory() {
    if (!params?.id) return;
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch(`/api/admin/customers/${params.id}/memory`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Failed to load memory'));
      setMemory(data);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to load memory');
      setMemory(null);
    } finally {
      setMemoryLoading(false);
    }
  }

  async function openMemoryFile(file: string) {
    if (!params?.id) return;
    setMemoryFile(file);
    setMemoryContent('');
    try {
      const response = await fetch(`/api/admin/customers/${params.id}/memory?file=${encodeURIComponent(file)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Failed to read memory file'));
      setMemoryContent(String(data?.content || ''));
    } catch (err) {
      setMemoryContent(`Error: ${(err as Error).message}`);
    }
  }

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
    loadMemory().catch(() => {});
    if (data.customer?.id) loadEntitlements(Number(data.customer.id)).catch(() => {});
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
        loadMemory().catch(() => {});
        if (data.customer?.id) loadEntitlements(Number(data.customer.id)).catch(() => {});
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

  async function toggleEntitlement(featureCode: string, enabled: boolean) {
    const userId = payload?.customer?.id;
    if (!userId) return;
    setSaving(true);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch('/api/admin/entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, feature_code: featureCode, enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Entitlement update failed'));
      await loadEntitlements(userId);
      setNotice('Entitlements aktualisiert');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Entitlement update failed');
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

              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature Flags / Entitlements</div>
                    <div className="text-[11px] text-muted-foreground">Pro Kunde steuerbar (Overrides werden im Billing-DB Entitlements gespeichert).</div>
                  </div>
                  <button type="button" onClick={() => loadEntitlements(customer.id)} className="btn text-xs px-2 py-1" disabled={entitlementsLoading}>
                    {entitlementsLoading ? 'Laedt…' : 'Aktualisieren'}
                  </button>
                </div>

                {entitlementsError ? <div className="text-xs text-destructive">{entitlementsError}</div> : null}
                {!entitlements ? (
                  <div className="text-xs text-muted-foreground">{entitlementsLoading ? 'Laedt…' : 'Keine Daten.'}</div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {entitlements.features.map((f) => (
                      <label key={f.feature_code} className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{f.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {f.feature_code} · default: {f.default_enabled ? 'on' : 'off'} · source: {f.source}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={!!f.enabled}
                          onChange={(e) => toggleEntitlement(f.feature_code, e.target.checked)}
                          disabled={saving}
                        />
                      </label>
                    ))}
                  </div>
                )}
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

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-semibold">Zahlungen (Stripe)</h2>
                <p className="text-xs text-muted-foreground">Letzte Checkouts inkl. Betrag, Status und Zuordnung.</p>
              </div>
            </div>
            <div className="panel-body">
              {(payload?.payments?.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  Noch keine Zahlungen gefunden.
                </div>
              ) : (
                <div className="overflow-auto rounded-2xl border border-border/60">
                  <table className="min-w-[720px] w-full text-sm">
                    <thead className="bg-muted/20 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Zeit</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Betrag</th>
                        <th className="px-3 py-2 text-right font-medium">Credits</th>
                        <th className="px-3 py-2 text-left font-medium">Session</th>
                        <th className="px-3 py-2 text-left font-medium">Stripe Customer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payload?.payments ?? []).map((p) => (
                        <tr key={p.stripe_session_id} className="border-t border-border/60">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                            {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              p.status === 'completed' ? 'bg-success/10 text-success' : 'bg-muted/20 text-muted-foreground'
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            €{Number(p.gross_amount_eur || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                            {Number(p.credits_issued || 0).toLocaleString('de-DE')}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {p.stripe_session_id}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                            {p.stripe_customer_id || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold">Customer Memory</h2>
                <p className="text-xs text-muted-foreground">Gespeicherte Conversation-Snapshots (State → customer-memory).</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadMemory()} disabled={memoryLoading}>
                <RefreshCcw size={14} />
                Refresh
              </button>
            </div>
            <div className="panel-body space-y-3 text-sm">
              <InfoRow label="Base Path" value={memory?.basePath ? memory.basePath : memoryLoading ? 'loading…' : '—'} />
              {memoryError ? <div className="text-sm text-warning">{memoryError}</div> : null}
              {!memoryLoading && (memory?.files?.length ?? 0) === 0 ? (
                <div className="text-xs text-muted-foreground">Noch keine Memory-Files. Sobald der Kunde im Webchat schreibt, werden Eintraege angelegt.</div>
              ) : (
                <div className="space-y-2">
                  {(memory?.files ?? []).slice(0, 8).map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => openMemoryFile(f.path)}
                      className="w-full rounded-2xl border border-border/60 bg-muted/10 p-3 text-left hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium truncate">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(f.updated_at).toLocaleString()}</div>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono truncate">{f.path} · {Math.round(f.size_bytes / 1024)}KB</div>
                    </button>
                  ))}
                </div>
              )}
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

      {memoryFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMemoryFile(null)} />
          <div className="relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border bg-background p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Memory File</div>
                <div className="text-xs text-muted-foreground font-mono">{memoryFile}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMemoryFile(null)}>
                Schliessen
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-muted/20 p-4 text-[12px] overflow-auto">{memoryContent || 'Loading…'}</pre>
          </div>
        </div>
      ) : null}
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
