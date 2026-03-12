'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, GaugeCircle, Settings2, Sparkles, Wallet } from 'lucide-react';
import { PaymentCTA } from './payment-cta';
import { useCustomerBillingSync } from '@/hooks/use-customer-billing-sync';
import { CustomerOnboarding } from './customer-onboarding';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { normalizeWalletPayload, type WalletPayloadBase } from '@/lib/wallet-payload';

type UsagePayload = {
  totals: {
    tokens_today: number;
    tokens_week: number;
    cost_today: number;
    cost_week: number;
    tokens_30d: number;
    cost_30d: number;
  };
  by_agent: Array<{
    agent_id: string;
    tokens_today: number;
    tokens_week: number;
    cost_today: number;
    cost_week: number;
  }>;
};

type MeUser = {
  username?: string;
  email?: string | null;
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  plan_amount_cents?: number;
  wallet_balance_cents?: number;
  onboarding_completed_at?: string | null;
  next_topup_discount_percent?: number;
  completed_payments_count?: number;
};

type InvoiceItem = {
  session_id: string;
  checkout_type: 'activation' | 'topup';
  amount_cents: number;
  credit_amount_cents: number;
  discount_percent: number;
  created_at: string;
  title: string;
  download_url: string;
};

type WalletPayload = WalletPayloadBase & {
  uiMessages?: Array<{
    message_code: string;
    title: string;
    body: string;
    context_area: string;
  }>;
};

type WalletLedgerItem = {
  id: number;
  entry_type: string;
  credits_delta: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  note: string | null;
  created_at: string;
};

type TopupOffer = {
  offerCode: string;
  name: string;
  amountEur: number;
  credits: number;
  bonusCredits: number;
  marketingLabel: string | null;
};

const QUICK_TOPUPS = [1000, 2000, 5000] as const;

export function CustomerUsage() {
  const { ready, appAudience } = useAudienceGuard({ redirectAdminTo: '/' });
  const canLoadCustomerData = ready && appAudience === 'customer';
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [me, setMe] = useState<MeUser | null>(null);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerItem[]>([]);
  const [offers, setOffers] = useState<TopupOffer[]>([]);
  const [customAmount, setCustomAmount] = useState('35');
  const [checkoutLoading, setCheckoutLoading] = useState<number | 'custom' | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function loadUsage() {
    const payload = await fetch('/api/usage?days=30', { cache: 'no-store' }).then((response) => response.json());
    setUsage(payload);
  }

  async function loadMe() {
    const payload = await fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.json());
    setMe(payload?.user || null);
  }

  async function loadInvoices() {
    const payload = await fetch('/api/billing/invoices', { cache: 'no-store' }).then((response) => response.json());
    setInvoices(Array.isArray(payload?.invoices) ? payload.invoices : []);
  }

  async function loadWallet() {
    const response = await fetch('/api/wallet', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    setWallet(response.ok ? (normalizeWalletPayload<WalletPayload>(payload) as WalletPayload | null) : null);
  }

  async function loadLedger() {
    const payload = await fetch('/api/wallet/ledger', { cache: 'no-store' }).then((response) => response.json());
    setLedger(Array.isArray(payload?.entries) ? payload.entries : []);
  }

  async function loadOffers() {
    const payload = await fetch('/api/topup-offers', { cache: 'no-store' }).then((response) => response.json());
    setOffers(Array.isArray(payload?.offers) ? payload.offers : []);
  }

  useEffect(() => {
    if (!canLoadCustomerData) return;
    loadUsage().catch(() => setUsage(null));
    loadMe().catch(() => setMe(null));
    loadInvoices().catch(() => setInvoices([]));
    loadWallet().catch(() => setWallet(null));
    loadLedger().catch(() => setLedger([]));
    loadOffers().catch(() => setOffers([]));
  }, [canLoadCustomerData]);

  useCustomerBillingSync({
    enabled: canLoadCustomerData,
    onConfirmed: async () => {
      setConfirmingPayment(true);
      await Promise.all([loadUsage(), loadMe(), loadInvoices(), loadWallet(), loadLedger(), loadOffers()]);
      setConfirmingPayment(false);
    },
  });

  useEffect(() => {
    if (!canLoadCustomerData) return;

    function handleStorage(event: StorageEvent) {
      if (event.key !== 'kitzchat-payment-complete') return;
      setConfirmingPayment(true);
      Promise.all([loadUsage(), loadMe(), loadInvoices(), loadWallet(), loadLedger(), loadOffers()])
        .catch(() => {})
        .finally(() => setConfirmingPayment(false));
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [canLoadCustomerData]);

  const planCents = me?.plan_amount_cents ?? 2000;
  const spentCents = usage?.totals.cost_30d ?? 0;
  const fallbackCredits = Math.max(0, Math.round((me?.wallet_balance_cents ?? 0) * 10));
  const balanceCredits = wallet?.balance ?? fallbackCredits;
  const balanceEur = balanceCredits / 1000;
  const loadedCents = Math.round(balanceEur * 100);
  const balanceCents = Math.max(loadedCents - spentCents, 0);
  const hasAccess = Boolean(me?.has_agent_access);
  const nextTopupDiscountPercent = Math.max(0, Math.round(me?.next_topup_discount_percent ?? 0));
  const customAmountCents = useMemo(() => Math.max(100, Math.round(Number(customAmount || 0) * 100)), [customAmount]);
  const discountedCustomAmountCents = useMemo(
    () => Math.max(100, Math.round(customAmountCents * (100 - nextTopupDiscountPercent) / 100)),
    [customAmountCents, nextTopupDiscountPercent],
  );

  const offerCards = offers.length > 0
    ? offers.map((offer) => ({
        key: Math.round(offer.amountEur * 100),
        label: `€${offer.amountEur.toFixed(0)}`,
        amountCents: Math.round(offer.amountEur * 100),
        credits: offer.credits + offer.bonusCredits,
        note: offer.marketingLabel || offer.name,
      }))
    : QUICK_TOPUPS.map((amount) => ({
        key: amount,
        label: `€${(amount / 100).toFixed(0)}`,
        amountCents: amount,
        credits: amount * 10,
        note: amount === 2000 ? 'meist genutzt' : 'Flex Top-up',
      }));

  async function completeOnboarding() {
    setSavingOnboarding(true);
    try {
      await fetch('/api/customer/onboarding', { method: 'POST' });
      await loadMe();
    } finally {
      setSavingOnboarding(false);
    }
  }

  async function startTopup(amountCents: number, key: number | 'custom') {
    setCheckoutLoading(key);
    setCheckoutError(null);
    const pendingWindow = window.open('', '_blank');
    if (pendingWindow) {
      pendingWindow.document.write('<title>Stripe Checkout</title><p style="font-family: sans-serif; padding: 24px;">Stripe Checkout wird geladen...</p>');
    }

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutType: 'topup', amountCents, returnPath: '/usage-token' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Checkout konnte nicht gestartet werden'));
      }
      if (typeof data?.redirect_url === 'string' && data.redirect_url) {
        if (pendingWindow) {
          pendingWindow.location.href = data.redirect_url;
        } else {
          window.location.href = data.redirect_url;
        }
        return;
      }
      pendingWindow?.close();
    } catch (error) {
      pendingWindow?.close();
      setCheckoutError(error instanceof Error ? error.message : 'Checkout konnte nicht gestartet werden');
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (appAudience !== 'customer') {
    return null;
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Guthaben</h1>
        <p className="text-xs text-muted-foreground">Verwalte Aktivierung, Guthaben, Rabatt, Onboarding und Rechnungen zentral an einem Ort.</p>
      </div>

      {confirmingPayment ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          Zahlung erkannt. Dein Kundenkonto wird gerade aktualisiert.
        </div>
      ) : null}

      <CustomerOnboarding
        hasAccess={hasAccess}
        onboardingCompleted={Boolean(me?.onboarding_completed_at)}
        walletBalanceCents={Math.round(balanceEur * 100)}
        onFinish={completeOnboarding}
      />

      {wallet?.uiMessages?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {wallet.uiMessages.slice(0, 2).map((message) => (
            <div key={message.message_code} className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="text-sm font-medium">{message.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{message.body}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="panel">
          <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-medium">Einzahlungen und Guthaben</h2>
              <p className="text-xs text-muted-foreground">Waehle 10 €, 20 €, 50 € oder gib deinen Wunschbetrag ein. Bei 20 € ist "meist genutzt" markiert.</p>
            </div>
            <div className={`badge border ${hasAccess ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {hasAccess ? 'Bezahlt / aktiv' : 'Aktivierung offen'}
            </div>
          </div>

          <div className="panel-body space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard icon={<CreditCard size={14} />} label="Aktivierung" value={`€${(planCents / 100).toFixed(2)}`} hint="Einmalige Freischaltung des Kundenkontos" />
              <MetricCard icon={<Wallet size={14} />} label="Verbrauch 30 Tage" value={`€${(spentCents / 100).toFixed(2)}`} hint="Auf Basis der erfassten Chat-Nutzung" />
              <MetricCard icon={<Sparkles size={14} />} label="Verfuegbare Credits" value={`${balanceCredits.toLocaleString('de-DE')}`} hint={wallet?.premiumModeMessage || 'Geladenes Guthaben als Credit-Wallet'} />
            </div>

            {wallet ? (
              <div className={`rounded-2xl border p-4 ${wallet.lowBalanceWarning ? 'border-warning/40 bg-warning/5' : 'border-border/60 bg-muted/10'}`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GaugeCircle size={16} /> Premium-Routing
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{wallet.premiumModeMessage}. Aktuell verfuegbar: {balanceCredits.toLocaleString('de-DE')} Credits, entspricht ca. €{balanceEur.toFixed(2)} internem Wallet-Wert.</div>
              </div>
            ) : null}

            {!hasAccess ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="text-sm font-medium">Erste Einzahlung / Aktivierung</div>
                <div className="text-xs text-muted-foreground">Mit der ersten erfolgreichen Zahlung werden alle Agenten freigeschaltet. Danach erhaeltst du automatisch 30 % Rabatt auf deine naechste Guthaben-Aufladung.</div>
                <PaymentCTA label="€20 Aktivierung starten" returnPath="/usage-token" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                  <div className="text-sm font-medium">Naechster Auflade-Rabatt</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {nextTopupDiscountPercent > 0
                      ? `Du hast aktuell ${nextTopupDiscountPercent}% Rabatt auf deine naechste Einzahlung.`
                      : 'Aktuell ist kein Folgerabatt aktiv. Nach deiner ersten erfolgreichen Einzahlung wird der Rabatt automatisch vorbereitet.'}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium">Guthaben aufladen</div>
                  <div className="mt-1 text-xs text-muted-foreground">1 Euro entspricht 1.000 Credits. Stripe kassiert, dein KitzChat-Wallet fuehrt die eigentlichen Credits separat als Ledger.</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {offerCards.map((offer) => {
                    const discounted = Math.max(100, Math.round(offer.amountCents * (100 - nextTopupDiscountPercent) / 100));
                    const mostUsed = offer.note.toLowerCase().includes('meist');
                    return (
                      <button
                        key={offer.key}
                        type="button"
                        onClick={() => startTopup(offer.amountCents, offer.key)}
                        disabled={checkoutLoading !== null}
                        className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-base font-semibold">{offer.label}</div>
                          {mostUsed ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">meist genutzt</span> : null}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {nextTopupDiscountPercent > 0 ? `Heute zahlst du nur €${(discounted / 100).toFixed(2)} statt ${offer.label}.` : `${offer.credits.toLocaleString('de-DE')} Credits werden direkt in dein Wallet eingebucht.`}
                        </div>
                        <div className="mt-3 text-xs font-medium text-primary">{checkoutLoading === offer.key ? 'Wird gestartet...' : 'Jetzt aufladen'}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3">
                  <div className="text-sm font-medium">Eigener Betrag</div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="space-y-1 text-sm">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Wunschbetrag in Euro</div>
                      <input
                        value={customAmount}
                        onChange={(event) => setCustomAmount(event.target.value)}
                        inputMode="decimal"
                        className="w-40 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => startTopup(customAmountCents, 'custom')}
                      disabled={checkoutLoading !== null || !Number.isFinite(customAmountCents)}
                      className="btn btn-primary text-sm"
                    >
                      {checkoutLoading === 'custom' ? 'Wird gestartet...' : 'Betrag einzahlen'}
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Gutgeschrieben werden {(customAmountCents * 10).toLocaleString('de-DE')} Credits.
                    {nextTopupDiscountPercent > 0 ? ` Durch deinen Rabatt zahlst du aktuell nur €${(discountedCustomAmountCents / 100).toFixed(2)}.` : ' Der volle Betrag wird im Checkout berechnet.'}
                  </div>
                </div>

                {checkoutError ? <div className="text-sm text-destructive">{checkoutError}</div> : null}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-medium">Onboarding-Status</h2>
                <p className="text-xs text-muted-foreground">Neue Kunden sehen hier sofort, was als Naechstes ansteht.</p>
              </div>
            </div>
            <div className="panel-body space-y-3 text-sm">
              {[
                { label: 'Erste Einzahlung erfolgreich', done: hasAccess },
                { label: '30 % Rabatt fuer naechste Einzahlung vorbereitet', done: nextTopupDiscountPercent > 0 || (me?.completed_payments_count ?? 0) > 1 },
                { label: 'Onboarding abschliessen', done: Boolean(me?.onboarding_completed_at) },
              ].map((step) => (
                <div key={step.label} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3">
                  <span>{step.label}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${step.done ? 'text-success' : 'text-muted-foreground'}`}>
                    <CheckCircle2 size={14} /> {step.done ? 'Erledigt' : 'Offen'}
                  </span>
                </div>
              ))}
              {!me?.onboarding_completed_at && hasAccess ? (
                <button type="button" onClick={completeOnboarding} disabled={savingOnboarding} className="btn btn-primary text-sm">
                  {savingOnboarding ? 'Wird gespeichert...' : 'Onboarding abschliessen'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2 className="text-sm font-medium">Einstellungen direkt darunter</h2>
                <p className="text-xs text-muted-foreground">Schneller Blick auf Konto und Abrechnungsstand, ohne die Seite zu wechseln.</p>
              </div>
            </div>
            <div className="panel-body grid gap-3">
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Settings2 size={14} /> Konto
                </div>
                <div className="mt-2 text-sm font-medium">{me?.username || 'Kundenkonto'}</div>
                <div className="mt-1 text-xs text-muted-foreground">{me?.email || 'Keine E-Mail-Adresse hinterlegt'}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Abrechnungsstatus</div>
                <div className="mt-2 text-sm font-medium">{hasAccess ? 'Kundenzugang aktiv' : 'Wartet auf Aktivierung'}</div>
                <div className="mt-1 text-xs text-muted-foreground">Geladenes Guthaben: {balanceCredits.toLocaleString('de-DE')} Credits</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Heute', usage?.totals.tokens_today ?? 0],
          ['7 Tage', usage?.totals.tokens_week ?? 0],
          ['30 Tage', usage?.totals.tokens_30d ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="panel">
            <div className="panel-body space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold">{Number(value).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Gesamtzahl der erfassten Tokens</div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-medium">Wallet Ledger</h2>
        </div>
        <div className="panel-body space-y-3">
          {ledger.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              Noch keine Credit-Buchungen vorhanden.
            </div>
          ) : ledger.slice(0, 8).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/10 p-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">{entry.note || entry.entry_type}</div>
                <div className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('de-DE')} · {entry.reference_type} · Saldo {entry.balance_after.toLocaleString('de-DE')} Credits</div>
              </div>
              <div className={`text-sm font-semibold ${entry.credits_delta >= 0 ? 'text-success' : 'text-foreground'}`}>
                {entry.credits_delta >= 0 ? '+' : ''}{entry.credits_delta.toLocaleString('de-DE')} Credits
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-medium">Rechnungen</h2>
        </div>
        <div className="panel-body space-y-3">
          {invoices.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              Noch keine Rechnungen vorhanden.
            </div>
          ) : invoices.map((invoice) => (
            <div key={invoice.session_id} className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/10 p-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">{invoice.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(invoice.created_at).toLocaleString('de-DE')} · berechnet €{(invoice.amount_cents / 100).toFixed(2)} · gutgeschrieben €{((invoice.credit_amount_cents || invoice.amount_cents) / 100).toFixed(2)}</div>
                {invoice.discount_percent > 0 ? <div className="mt-1 text-xs text-success">Rabatt angewendet: {invoice.discount_percent}%</div> : null}
              </div>
              <a href={invoice.download_url} className="btn btn-primary text-sm" download>
                PDF herunterladen
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}