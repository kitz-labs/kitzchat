'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Euro, KeyRound, Wallet, Webhook } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type UserRecord = {
  id: number;
  username: string;
  email?: string | null;
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  plan_amount_cents?: number | null;
  wallet_balance_cents?: number | null;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
  next_topup_discount_percent?: number | null;
};

type BillingConfig = {
  stripe_secret_configured: boolean;
  stripe_webhook_configured: boolean;
  billing_mode: 'dev-simulated' | 'live-or-test';
  env_keys_required: string[];
  webhook_path: string;
};

type StripeCustomerOverview = {
  id: number;
  username: string;
  email: string | null;
  stripe_customer_id: string | null;
  payment_status: 'not_required' | 'pending' | 'paid';
  wallet_balance_cents: number;
  next_topup_discount_percent: number;
  stripe_synced: boolean;
  stripe_name?: string | null;
  stripe_balance_cents?: number;
  stripe_created_at?: string | null;
};

export default function BillingPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [stripeCustomers, setStripeCustomers] = useState<StripeCustomerOverview[]>([]);

  useEffect(() => {
    if (!ready) return;

    let alive = true;

    (async () => {
      try {
        const [usersPayload, configPayload, stripePayload] = await Promise.all([
          fetch('/api/users', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/api/billing/config', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/api/admin/stripe/customers', { cache: 'no-store' }).then((response) => response.json()),
        ]);
        if (!alive) return;
        setUsers(Array.isArray(usersPayload?.users) ? usersPayload.users : []);
        setConfig(configPayload || null);
        setStripeCustomers(Array.isArray(stripePayload?.customers) ? stripePayload.customers : []);
      } catch {
        if (!alive) return;
        setUsers([]);
        setConfig(null);
        setStripeCustomers([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  const customers = users.filter((user) => user.account_type === 'customer');
  const paidCustomers = customers.filter((user) => user.payment_status === 'paid');
  const pendingCustomers = customers.filter((user) => user.payment_status === 'pending');
  const monthlyRevenue = paidCustomers.reduce((sum, user) => sum + (user.plan_amount_cents ?? 0), 0) / 100;

  if (!ready) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<Euro size={16} />} label="Monatsumsatz" value={`€${monthlyRevenue.toFixed(2)}`} />
        <SummaryCard icon={<CreditCard size={16} />} label="Bezahlte Kunden" value={String(paidCustomers.length)} />
        <SummaryCard icon={<Wallet size={16} />} label="Offene Checkouts" value={String(pendingCustomers.length)} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-semibold">Stripe-Verbindung</h2>
            <p className="text-xs text-muted-foreground">Hier siehst du den Status der Stripe-Anbindung. Geheimnisse bleiben weiterhin ausschliesslich in den Server-Umgebungsvariablen.</p>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatusTile
              icon={<KeyRound size={16} />}
              label="Secret Key"
              value={config?.stripe_secret_configured ? 'Verbunden' : 'Fehlt'}
              ok={Boolean(config?.stripe_secret_configured)}
            />
            <StatusTile
              icon={<Webhook size={16} />}
              label="Webhook"
              value={config?.stripe_webhook_configured ? 'Konfiguriert' : 'Fehlt'}
              ok={Boolean(config?.stripe_webhook_configured)}
            />
            <StatusTile
              icon={<CheckCircle2 size={16} />}
              label="Modus"
              value={config?.billing_mode === 'live-or-test' ? 'Stripe aktiv' : 'Entwicklungsmodus'}
              ok={config?.billing_mode === 'live-or-test'}
            />
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm space-y-2">
            <div className="font-medium">So wird Stripe verbunden</div>
            <div className="text-muted-foreground">1. Trage den Stripe Secret Key in der .env als STRIPE_SECRET_KEY ein.</div>
            <div className="text-muted-foreground">2. Lege in Stripe einen Webhook auf /api/billing/webhook deiner App an.</div>
            <div className="text-muted-foreground">3. Hinterlege das Webhook-Signing-Secret in der .env als STRIPE_WEBHOOK_SECRET.</div>
            <div className="text-muted-foreground">4. Starte die App neu, damit der Server die Variablen neu einliest.</div>
            <div className="text-muted-foreground">Webhook-Pfad: {config?.webhook_path || '/api/billing/webhook'}</div>
          </div>

          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-xs text-muted-foreground">
            Stripe-Keys sollten nie in einer browserbasierten Admin-Oberflaeche eingetragen werden. Das Dashboard zeigt Status, Preise und Kundenstatus, die geheime Verbindung bleibt jedoch Server-Konfiguration.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Abrechnung</h1>
            <p className="text-xs text-muted-foreground">Stripe-gestuetzter Blick auf Zahlungsstatus, Sitzungen und Umsatzbereitschaft deiner Kunden.</p>
          </div>
        </div>
        <div className="panel-body grid gap-3">
          {customers.map((customer) => (
            <div key={customer.id} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <Link href={`/customers/${customer.id}`} className="text-sm font-semibold hover:underline">
                    {customer.username}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Stripe-Kunde: {customer.stripe_customer_id || 'noch nicht angelegt'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Checkout-Sitzung: {customer.stripe_checkout_session_id || 'noch nicht gestartet'}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`badge border ${customer.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    {customer.payment_status === 'paid' ? 'bezahlt' : 'ausstehend'}
                  </div>
                  <div className="mt-2 text-sm font-semibold">€{((customer.plan_amount_cents ?? 0) / 100).toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="text-sm font-semibold">Stripe Kunden-Management</h2>
            <p className="text-xs text-muted-foreground">Direkter Blick auf lokale Kundenkonten und ihre Stripe-Verknuepfung.</p>
          </div>
        </div>
        <div className="panel-body grid gap-3">
          {stripeCustomers.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
              Keine Stripe-Kundendaten verfuegbar.
            </div>
          ) : stripeCustomers.map((customer) => (
            <div key={customer.id} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground font-mono">Token: {customer.session_token ?? '—'}</div>
                  <div className="text-sm font-semibold">{customer.username}</div>
                  <div className="text-xs text-muted-foreground">E-Mail: {customer.email || 'nicht hinterlegt'}</div>
                  <div className="text-xs text-muted-foreground">Stripe ID: {customer.stripe_customer_id || 'noch nicht angelegt'}</div>
                  <div className="text-xs text-muted-foreground">Stripe Sync: {customer.stripe_synced ? 'verbunden' : 'lokal/offen'}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="text-sm font-semibold">Guthaben €{(customer.wallet_balance_cents / 100).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">Naechster Rabatt: {customer.next_topup_discount_percent > 0 ? `${customer.next_topup_discount_percent}%` : 'kein aktiver Rabatt'}</div>
                  <div className={`badge border ${customer.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{customer.payment_status}</div>
                </div>
              </div>
            </div>
          ))}
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

function StatusTile({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className={`badge border ${ok ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}