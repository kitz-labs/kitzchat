'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type CustomerHealthRecord = {
  id: number;
  username: string;
  email?: string | null;
  created_at: string;
  payment_status: 'not_required' | 'pending' | 'paid';
  activated: boolean;
  email_verified: boolean;
  terms_accepted: boolean;
  onboarding_completed: boolean;
  stripe_customer_connected: boolean;
  last_login_at: string | null;
  last_active_at: string | null;
  last_support_at: string | null;
  unread_support_count: number;
  local_wallet_balance_cents: number;
  billing_wallet_balance_cents: number | null;
  effective_wallet_balance_cents: number;
  billing_wallet_status: string | null;
  billing_truth: 'not-configured' | 'live' | 'local-only' | 'missing-wallet' | 'mismatch';
  billing_successful_payments: number;
  billing_total_paid_eur: number;
  last_payment_at: string | null;
  legacy_secret_storage: boolean;
  risk: 'ok' | 'attention' | 'critical';
  risk_reasons: string[];
  stale_login: boolean;
};

type SecurityWarning = {
  level: 'info' | 'warning' | 'critical';
  code: string;
  title: string;
  detail: string;
};

type HealthPayload = {
  summary: {
    total: number;
    activated: number;
    ok: number;
    attention: number;
    critical: number;
    missing_terms: number;
    missing_email_verification: number;
    billing_mismatches: number;
    open_support_threads: number;
  };
  security: {
    billing_configured: boolean;
    customer_secret_encryption_available: boolean;
    customer_secret_encryption_source: 'dedicated' | 'api_key' | 'missing';
    legacy_secret_customer_count: number;
    warnings: SecurityWarning[];
  };
  customers: CustomerHealthRecord[];
  checked_at: string;
};

export default function CustomersPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [dashboard, setDashboard] = useState<HealthPayload | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadDashboard() {
    const response = await fetch('/api/admin/customer-health', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String((payload as { error?: string }).error || 'Kundenstatus konnte nicht geladen werden'));
    setDashboard(payload as HealthPayload);
    setLoadingError(null);
  }

  useEffect(() => {
    if (!ready) return;

    let alive = true;

    (async () => {
      try {
        const response = await fetch('/api/admin/customer-health', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String((payload as { error?: string }).error || 'Kundenstatus konnte nicht geladen werden'));
        if (!alive) return;
        setDashboard(payload as HealthPayload);
        setLoadingError(null);
      } catch (error) {
        if (!alive) return;
        setDashboard(null);
        setLoadingError(error instanceof Error ? error.message : 'Kundenstatus konnte nicht geladen werden');
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  async function createCustomer() {
    if (!username.trim() || !password.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          email: email || null,
          accountType: 'customer',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String((payload as { error?: string }).error || 'Kunde konnte nicht erstellt werden'));
      setUsername('');
      setEmail('');
      setPassword('');
      await loadDashboard();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Kunde konnte nicht erstellt werden');
    } finally {
      setCreating(false);
    }
  }

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  const customers = dashboard?.customers ?? [];
  const mismatches = customers.filter((customer) => customer.billing_truth === 'mismatch' || customer.billing_truth === 'missing-wallet').slice(0, 6);

  return (
    <div className="space-y-6 animate-in">
      <div className="rounded-[1.75rem] border border-border/70 bg-card/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.10)] lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ops Snapshot</div>
            <div className="mt-1 text-base font-semibold text-foreground">Customer Health in einer mobilen Einsatzansicht</div>
          </div>
          <span className={`status-pill ${(dashboard?.summary.critical ?? 0) > 0 ? 'status-danger' : (dashboard?.summary.attention ?? 0) > 0 ? 'status-warn' : 'status-ok'}`}>
            {(dashboard?.summary.critical ?? 0) > 0 ? 'kritisch' : (dashboard?.summary.attention ?? 0) > 0 ? 'achtung' : 'stabil'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniInfo label="Offene Risiken" value={String((dashboard?.summary.critical ?? 0) + (dashboard?.summary.attention ?? 0))} />
          <MiniInfo label="Support offen" value={String(dashboard?.summary.open_support_threads ?? 0)} />
          <MiniInfo label="Billing Diffs" value={String(dashboard?.summary.billing_mismatches ?? 0)} />
          <MiniInfo label="Aktive Kunden" value={String(dashboard?.summary.activated ?? 0)} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#new-customer" className="btn btn-primary w-full text-sm">Neuen Kunden anlegen</a>
          <a href="#health-board" className="btn btn-ghost w-full text-sm">Health Board</a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard icon={<Users size={16} />} label="Kunden" value={String(dashboard?.summary.total ?? 0)} />
        <SummaryCard icon={<CheckCircle2 size={16} />} label="Aktiv" value={String(dashboard?.summary.activated ?? 0)} tone="success" />
        <SummaryCard icon={<Activity size={16} />} label="Gesund" value={String(dashboard?.summary.ok ?? 0)} />
        <SummaryCard icon={<AlertTriangle size={16} />} label="Attention" value={String(dashboard?.summary.attention ?? 0)} tone="warning" />
        <SummaryCard icon={<ShieldAlert size={16} />} label="Kritisch" value={String(dashboard?.summary.critical ?? 0)} tone="danger" />
        <SummaryCard icon={<Wallet size={16} />} label="Billing Diffs" value={String(dashboard?.summary.billing_mismatches ?? 0)} tone="warning" />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Kunden</h1>
            <p className="text-xs text-muted-foreground">Customer Health, Billing Truth und Security-Warnungen in einer Admin-Ansicht.</p>
          </div>
        </div>
        <div className="panel-body border-b border-border/50 space-y-3" id="new-customer">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Benutzername</div>
              <input value={username} placeholder="z.B. firma-admin" onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50" />
            </label>
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">E-Mail</div>
              <input value={email} placeholder="name@firma.at" onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50" />
            </label>
            <label className="space-y-1.5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Passwort</div>
              <input type="password" value={password} placeholder="mind. 10 Zeichen" onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={createCustomer} disabled={creating} className="btn btn-primary w-full text-sm">
                {creating ? 'Erstelle...' : 'Kunden erstellen'}
              </button>
            </div>
          </div>
          {createError ? <div className="text-sm text-destructive">{createError}</div> : null}
          {loadingError ? <div className="text-sm text-destructive">{loadingError}</div> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Security Warning Center</h2>
              <p className="text-xs text-muted-foreground">Serverhygiene, Rechtliches und Alt-Daten auf einen Blick.</p>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniStat label="Terms fehlen" value={String(dashboard?.summary.missing_terms ?? 0)} />
              <MiniStat label="E-Mail offen" value={String(dashboard?.summary.missing_email_verification ?? 0)} />
              <MiniStat label="Support offen" value={String(dashboard?.summary.open_support_threads ?? 0)} />
              <MiniStat label="Legacy Secrets" value={String(dashboard?.security.legacy_secret_customer_count ?? 0)} />
            </div>

            {dashboard?.security.warnings?.length ? (
              <div className="space-y-2">
                {dashboard.security.warnings.map((warning) => (
                  <div key={warning.code} className={`rounded-2xl border px-4 py-3 text-sm ${warning.level === 'critical' ? 'border-destructive/40 bg-destructive/5 text-destructive' : warning.level === 'warning' ? 'border-warning/40 bg-warning/5 text-warning' : 'border-border/60 bg-muted/10 text-foreground'}`}>
                    <div className="font-medium">{warning.title}</div>
                    <div className="mt-1 text-xs opacity-80">{warning.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                Keine aktiven Security-Warnungen. Verschluesselung, Terms und Billing sehen aktuell sauber aus.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-medium">Billing Truth Board</h2>
              <p className="text-xs text-muted-foreground">Zeigt dir sofort, wo App-Status und Billing-Wallet auseinanderlaufen.</p>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-xs text-muted-foreground">
              Billing DB: {dashboard?.security.billing_configured ? 'verbunden' : 'nicht konfiguriert'} · Secret Storage: {dashboard?.security.customer_secret_encryption_source === 'dedicated' ? 'dedizierter Key' : dashboard?.security.customer_secret_encryption_source === 'api_key' ? 'API_KEY Fallback' : 'kein Key'}
            </div>
            {mismatches.length === 0 ? (
              <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                Keine aktuellen Wallet- oder Billing-Mismatches erkannt.
              </div>
            ) : (
              mismatches.map((customer) => (
                <Link key={customer.id} href={`/customers/${customer.id}`} className="block rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{customer.username}</div>
                      <div className="text-xs text-muted-foreground">
                        Lokal €{(customer.local_wallet_balance_cents / 100).toFixed(2)} · Billing {customer.billing_wallet_balance_cents == null ? '—' : `€${(customer.billing_wallet_balance_cents / 100).toFixed(2)}`}
                      </div>
                    </div>
                    <BillingTruthBadge value={customer.billing_truth} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel" id="health-board">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-medium">Customer Health Board</h2>
            <p className="text-xs text-muted-foreground">Aktivierung, Risiko, Wallet, Support und letzte Aktivitaet pro Kunde.</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid gap-3 md:hidden">
            {customers.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`} className="card card-hover p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{customer.username}</div>
                    <div className="text-xs text-muted-foreground">{customer.email || 'Keine E-Mail hinterlegt'}</div>
                  </div>
                  <RiskBadge risk={customer.risk} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <InlineFlag label="Billing" done={customer.billing_truth === 'live' || customer.billing_truth === 'not-configured'} />
                  <InlineFlag label="Terms" done={customer.terms_accepted} />
                  <InlineFlag label="Mail" done={customer.email_verified || !customer.email} />
                  <InlineFlag label="Onboarding" done={customer.onboarding_completed} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <MiniInfo label="Wallet" value={`€${(customer.effective_wallet_balance_cents / 100).toFixed(2)}`} />
                  <MiniInfo label="Support" value={customer.unread_support_count > 0 ? `${customer.unread_support_count} offen` : 'ruhig'} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {customer.risk_reasons.length > 0 ? customer.risk_reasons.slice(0, 2).join(' · ') : 'Keine akuten Risiken'}
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4">Kunde</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Risk</th>
                  <th className="pb-3 pr-4">Billing Truth</th>
                  <th className="pb-3 pr-4">Support</th>
                  <th className="pb-3">Letzte Aktivitaet</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-border/50 align-top">
                    <td className="py-3 pr-4">
                      <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                        {customer.username}
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">{customer.email || 'Keine E-Mail'}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <InlineFlag label="Aktiv" done={customer.activated} />
                        <InlineFlag label="Terms" done={customer.terms_accepted} />
                        <InlineFlag label="Mail" done={customer.email_verified || !customer.email} />
                        <InlineFlag label="Onboarding" done={customer.onboarding_completed} />
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-2">
                        <PaymentBadge paymentStatus={customer.payment_status} />
                        <div className="text-xs text-muted-foreground">Wallet €{(customer.effective_wallet_balance_cents / 100).toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">Stripe {customer.stripe_customer_connected ? 'verbunden' : 'offen'}</div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <RiskBadge risk={customer.risk} />
                      <div className="mt-2 text-xs text-muted-foreground">
                        {customer.risk_reasons.length > 0 ? customer.risk_reasons.slice(0, 2).join(' · ') : 'Keine akuten Risiken'}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <BillingTruthBadge value={customer.billing_truth} />
                      <div className="mt-2 text-xs text-muted-foreground">
                        Lokal €{(customer.local_wallet_balance_cents / 100).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Billing {customer.billing_wallet_balance_cents == null ? '—' : `€${(customer.billing_wallet_balance_cents / 100).toFixed(2)}`}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-sm font-medium">{customer.unread_support_count > 0 ? `${customer.unread_support_count} offen` : 'Keine offenen Tickets'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatRelativeDate(customer.last_support_at)}</div>
                    </td>
                    <td className="py-3">
                      <div className="text-sm font-medium">{formatRelativeDate(customer.last_active_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Login {formatRelativeDate(customer.last_login_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Erstellt {new Date(customer.created_at).toLocaleDateString('de-DE')}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneClass = tone === 'success'
    ? 'bg-success/10 text-success'
    : tone === 'warning'
      ? 'bg-warning/10 text-warning'
      : tone === 'danger'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-primary/10 text-primary';
  return (
    <div className="panel">
      <div className="panel-body flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/70 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: CustomerHealthRecord['risk'] }) {
  if (risk === 'critical') {
    return <span className="badge border bg-destructive/10 text-destructive">kritisch</span>;
  }
  if (risk === 'attention') {
    return <span className="badge border bg-warning/10 text-warning">attention</span>;
  }
  return <span className="badge border bg-success/10 text-success">ok</span>;
}

function PaymentBadge({ paymentStatus }: { paymentStatus: CustomerHealthRecord['payment_status'] }) {
  if (paymentStatus === 'paid') {
    return <span className="badge border bg-success/10 text-success">bezahlt</span>;
  }
  if (paymentStatus === 'pending') {
    return <span className="badge border bg-warning/10 text-warning">ausstehend</span>;
  }
  return <span className="badge border bg-muted/30 text-muted-foreground">nicht noetig</span>;
}

function BillingTruthBadge({ value }: { value: CustomerHealthRecord['billing_truth'] }) {
  if (value === 'live') {
    return <span className="badge border bg-success/10 text-success">live</span>;
  }
  if (value === 'mismatch' || value === 'missing-wallet') {
    return <span className="badge border bg-destructive/10 text-destructive">{value === 'mismatch' ? 'mismatch' : 'wallet fehlt'}</span>;
  }
  if (value === 'local-only') {
    return <span className="badge border bg-warning/10 text-warning">nur lokal</span>;
  }
  return <span className="badge border bg-muted/30 text-muted-foreground">nicht konfiguriert</span>;
}

function InlineFlag({ label, done }: { label: string; done: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${done ? 'bg-success/15 text-success' : 'bg-warning/10 text-warning'}`}>
      {label}
    </span>
  );
}

function formatRelativeDate(value: string | null): string {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const diffHours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
  if (diffHours < 1) return 'gerade eben';
  if (diffHours < 24) return `vor ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `vor ${diffDays}d`;
  return new Date(value).toLocaleDateString('de-DE');
}
