'use client';

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCcw, Tag, Users, Boxes } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { toast } from '@/components/ui/toast';
import { DataTable } from '@/components/ui/data-table';
import { StatCard } from '@/components/ui/stat-card';

type StripeOverview = {
  configured: boolean;
  checked_at?: string;
  account?: {
    id: string;
    country: string | null;
    email: string | null;
    business_name: string | null;
    charges_enabled: boolean | null;
    payouts_enabled: boolean | null;
  } | null;
  balance?: {
    available: Array<{ amount: number; currency: string }>;
    pending: Array<{ amount: number; currency: string }>;
  } | null;
  webhook_endpoints?: { count: number };
  error?: string;
};

type StripeProduct = {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
  default_price: string | null;
  created_at: string | null;
};

type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: string;
  recurring: unknown | null;
  product_id: string | null;
  product_name: string | null;
  nickname: string | null;
  lookup_key: string | null;
  created_at: string | null;
};

type StripeProductsPayload = {
  configured: boolean;
  products: StripeProduct[];
  prices: StripePrice[];
  checked_at?: string;
  error?: string;
};

type StripeCustomerRow = {
  id: number;
  username: string;
  email: string | null;
  stripe_customer_id: string | null;
  payment_status: string;
  wallet_balance_cents: number;
  next_topup_discount_percent: number;
  stripe_synced: boolean;
  stripe_name?: string | null;
  stripe_balance_cents?: number;
  stripe_created_at?: string | null;
};

type StripeCustomersPayload = { customers: StripeCustomerRow[]; error?: string };

type StripeCouponRow = {
  id: string;
  name: string | null;
  valid: boolean;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  times_redeemed: number;
  max_redemptions: number | null;
  redeem_by: string | null;
  created_at: string | null;
};

type StripePromotionCodeRow = {
  id: string;
  code: string;
  active: boolean;
  coupon_id: string | null;
  coupon_name: string | null;
  times_redeemed: number;
  max_redemptions: number | null;
  expires_at: string | null;
  created_at: string | null;
};

type StripeVouchersPayload = {
  configured: boolean;
  allow_write?: boolean;
  coupons: StripeCouponRow[];
  promotion_codes: StripePromotionCodeRow[];
  checked_at?: string;
  error?: string;
};

type StripeEventRow = {
  id: string;
  type: string;
  created_at: string | null;
  livemode: boolean;
  api_version: string | null;
  request_id: string | null;
  pending_webhooks: number | null;
  object_id: string | null;
  object_type: string | null;
};

type StripeEventsPayload = {
  configured: boolean;
  events: StripeEventRow[];
  checked_at?: string;
  error?: string;
};

type TabKey = 'overview' | 'products' | 'customers' | 'vouchers' | 'events';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

function centsToEur(cents: number): string {
  const v = Number(cents || 0) / 100;
  return `€ ${v.toFixed(2)}`;
}

export default function StripePage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [tab, setTab] = useState<TabKey>('overview');

  const [overview, setOverview] = useState<StripeOverview | null>(null);
  const [products, setProducts] = useState<StripeProductsPayload | null>(null);
  const [customers, setCustomers] = useState<StripeCustomersPayload | null>(null);
  const [vouchers, setVouchers] = useState<StripeVouchersPayload | null>(null);
  const [events, setEvents] = useState<StripeEventsPayload | null>(null);

  const [loading, setLoading] = useState(false);

  const [voucherName, setVoucherName] = useState('Welcome 20%');
  const [voucherPercent, setVoucherPercent] = useState(20);
  const [promotionCode, setPromotionCode] = useState('WELCOME20');
  const [eventType, setEventType] = useState('');

  async function refresh(activeTab: TabKey = tab) {
    setLoading(true);
    try {
      if (activeTab === 'overview') setOverview(await fetchJson('/api/admin/stripe/overview'));
      if (activeTab === 'products') setProducts(await fetchJson('/api/admin/stripe/products'));
      if (activeTab === 'customers') setCustomers(await fetchJson('/api/admin/stripe/customers'));
      if (activeTab === 'vouchers') setVouchers(await fetchJson('/api/admin/stripe/vouchers'));
      if (activeTab === 'events') {
        const qs = eventType.trim() ? `?type=${encodeURIComponent(eventType.trim())}` : '';
        setEvents(await fetchJson(`/api/admin/stripe/events${qs}`));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    refresh('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (tab === 'overview' && !overview) refresh('overview');
    if (tab === 'products' && !products) refresh('products');
    if (tab === 'customers' && !customers) refresh('customers');
    if (tab === 'vouchers' && !vouchers) refresh('vouchers');
    if (tab === 'events' && !events) refresh('events');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab]);

  const configured = overview?.configured ?? false;
  const availableBalanceLabel = useMemo(() => {
    const a = overview?.balance?.available ?? [];
    if (a.length === 0) return '—';
    const primary = a[0];
    return `${(primary.amount / 100).toFixed(2)} ${primary.currency.toUpperCase()}`;
  }, [overview]);
  const availableBalanceCents = useMemo(() => {
    const a = overview?.balance?.available ?? [];
    if (a.length === 0) return 0;
    return Number(a[0]?.amount ?? 0) || 0;
  }, [overview]);

  if (!ready) return <div className="min-h-[40vh]" />;

  return (
    <div className="space-y-6 animate-in">
      <div className="panel">
        <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            <h1 className="text-xl font-semibold">Stripe</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh(tab)} disabled={loading}>
              <RefreshCcw size={14} />
              Refresh
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`badge border ${configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {configured ? 'configured' : 'not configured'}
            </span>
            {overview?.account?.id ? <span className="font-mono">{overview.account.id}</span> : null}
            {overview?.checked_at ? <span>· {new Date(overview.checked_at).toLocaleString()}</span> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BalanceCard label="Available Balance" valueLabel={availableBalanceLabel} valueCents={availableBalanceCents} />
        <StatCard label="Webhooks" value={overview?.webhook_endpoints?.count ?? 0} icon={Tag as any} color="var(--info)" />
        <StatCard label="Products" value={products?.products?.length ?? 0} icon={Boxes} color="var(--primary)" />
        <StatCard label="Customers (App)" value={customers?.customers?.length ?? 0} icon={Users} color="var(--warning)" />
      </div>

      <div className="panel">
        <div className="panel-body flex items-center gap-2 flex-wrap">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} label="Overview" />
          <TabButton active={tab === 'products'} onClick={() => setTab('products')} label="Products" />
          <TabButton active={tab === 'customers'} onClick={() => setTab('customers')} label="Customers" />
          <TabButton active={tab === 'vouchers'} onClick={() => setTab('vouchers')} label="Vouchers" />
          <TabButton active={tab === 'events'} onClick={() => setTab('events')} label="Events" />
        </div>
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Account</h3>
            </div>
            <div className="panel-body text-sm">
              {!overview?.configured ? (
                <div className="text-muted-foreground">Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY fehlt).</div>
              ) : (
                <div className="space-y-2">
                  <Row label="Business" value={overview.account?.business_name || '—'} />
                  <Row label="Email" value={overview.account?.email || '—'} />
                  <Row label="Country" value={overview.account?.country || '—'} />
                  <Row label="Charges" value={String(overview.account?.charges_enabled ?? '—')} mono />
                  <Row label="Payouts" value={String(overview.account?.payouts_enabled ?? '—')} mono />
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Balance</h3>
            </div>
            <div className="panel-body text-sm space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Available</div>
                <pre className="mt-2 rounded-xl bg-muted/20 p-3 text-[12px] overflow-auto">{JSON.stringify(overview?.balance?.available ?? [], null, 2)}</pre>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Pending</div>
                <pre className="mt-2 rounded-xl bg-muted/20 p-3 text-[12px] overflow-auto">{JSON.stringify(overview?.balance?.pending ?? [], null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'products' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Products</h3>
            </div>
            <div className="panel-body">
              <DataTable
                keyField="id"
                data={products?.products ?? []}
                emptyMessage="No products"
                columns={[
                  { key: 'name', label: 'Name', sortable: true },
                  { key: 'id', label: 'ID', render: (r: StripeProduct) => <span className="font-mono text-xs">{r.id}</span> },
                  { key: 'default_price', label: 'Default Price', render: (r: StripeProduct) => r.default_price ? <span className="font-mono text-xs">{r.default_price}</span> : '—' },
                  { key: 'created_at', label: 'Created', sortable: true, render: (r: StripeProduct) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
                ]}
              />
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Prices</h3>
            </div>
            <div className="panel-body">
              <DataTable
                keyField="id"
                data={products?.prices ?? []}
                emptyMessage="No prices"
                columns={[
                  { key: 'product_name', label: 'Product', sortable: true, render: (r: StripePrice) => r.product_name || r.product_id || '—' },
                  { key: 'unit_amount', label: 'Amount', sortable: true, render: (r: StripePrice) => r.unit_amount != null ? `${(r.unit_amount / 100).toFixed(2)} ${r.currency.toUpperCase()}` : '—' },
                  { key: 'id', label: 'ID', render: (r: StripePrice) => <span className="font-mono text-xs">{r.id}</span> },
                  { key: 'active', label: 'Active', render: (r: StripePrice) => String(r.active) },
                ]}
              />
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'customers' ? (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Customers (App ↔ Stripe)</h3>
          </div>
          <div className="panel-body">
            <DataTable
              keyField="id"
              data={customers?.customers ?? []}
              emptyMessage="No customers"
              columns={[
                { key: 'username', label: 'User', sortable: true },
                { key: 'email', label: 'Email', render: (r: StripeCustomerRow) => r.email || '—' },
                { key: 'stripe_customer_id', label: 'Stripe Customer', render: (r: StripeCustomerRow) => r.stripe_customer_id ? <span className="font-mono text-xs">{r.stripe_customer_id}</span> : '—' },
                { key: 'wallet_balance_cents', label: 'Wallet', sortable: true, render: (r: StripeCustomerRow) => centsToEur(r.wallet_balance_cents) },
                { key: 'stripe_synced', label: 'Synced', render: (r: StripeCustomerRow) => String(r.stripe_synced) },
              ]}
            />
          </div>
        </div>
      ) : null}

      {tab === 'vouchers' ? (
        <div className="space-y-4">
          {vouchers?.configured && vouchers.allow_write ? (
            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Create Voucher</h3>
              </div>
              <div className="panel-body space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Coupon Name</div>
                    <input
                      value={voucherName}
                      onChange={(e) => setVoucherName(e.target.value)}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">% Off</div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={voucherPercent}
                      onChange={(e) => setVoucherPercent(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <div className="text-xs text-muted-foreground">Promotion Code</div>
                    <input
                      value={promotionCode}
                      onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-mono"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/admin/stripe/vouchers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ coupon_name: voucherName, percent_off: voucherPercent, promotion_code: promotionCode }),
                      });
                      const payload = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(payload.error || 'Failed to create voucher');
                      toast.success('Voucher erstellt');
                      await refresh('vouchers');
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Coupons</h3>
              </div>
              <div className="panel-body">
                <DataTable
                  keyField="id"
                  data={vouchers?.coupons ?? []}
                  emptyMessage="No coupons"
                  columns={[
                    { key: 'name', label: 'Name', sortable: true, render: (r: StripeCouponRow) => r.name || '—' },
                    { key: 'id', label: 'ID', render: (r: StripeCouponRow) => <span className="font-mono text-xs">{r.id}</span> },
                    { key: 'percent_off', label: '%', sortable: true, render: (r: StripeCouponRow) => r.percent_off == null ? '—' : `${r.percent_off}%` },
                    { key: 'valid', label: 'Valid', render: (r: StripeCouponRow) => String(r.valid) },
                    { key: 'times_redeemed', label: 'Redeemed', sortable: true },
                  ]}
                />
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Promotion Codes</h3>
              </div>
              <div className="panel-body">
                <DataTable
                  keyField="id"
                  data={vouchers?.promotion_codes ?? []}
                  emptyMessage="No promotion codes"
                  columns={[
                    { key: 'code', label: 'Code', sortable: true, render: (r: StripePromotionCodeRow) => <span className="font-mono">{r.code}</span> },
                    { key: 'active', label: 'Active', render: (r: StripePromotionCodeRow) => String(r.active) },
                    { key: 'coupon_id', label: 'Coupon', render: (r: StripePromotionCodeRow) => r.coupon_id ? <span className="font-mono text-xs">{r.coupon_id}</span> : '—' },
                    { key: 'times_redeemed', label: 'Redeemed', sortable: true },
                    { key: 'expires_at', label: 'Expires', sortable: true, render: (r: StripePromotionCodeRow) => r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'events' ? (
        <div className="panel">
          <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
            <h3 className="section-title">Webhook Events</h3>
            <div className="flex items-center gap-2">
              <input
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="type filter (optional)"
                className="w-64 max-w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => refresh('events')}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="panel-body">
            <DataTable
              keyField="id"
              data={events?.events ?? []}
              emptyMessage="No events"
              columns={[
                { key: 'created_at', label: 'Created', sortable: true, render: (r: StripeEventRow) => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
                { key: 'type', label: 'Type', sortable: true, render: (r: StripeEventRow) => <span className="font-mono text-xs">{r.type}</span> },
                { key: 'object_id', label: 'Object', render: (r: StripeEventRow) => r.object_id ? <span className="font-mono text-xs">{r.object_type}:{r.object_id}</span> : '—' },
                { key: 'id', label: 'Event ID', render: (r: StripeEventRow) => <span className="font-mono text-xs">{r.id}</span> },
                { key: 'livemode', label: 'Live', render: (r: StripeEventRow) => String(r.livemode) },
                { key: 'pending_webhooks', label: 'Pending', sortable: true, render: (r: StripeEventRow) => r.pending_webhooks == null ? '—' : String(r.pending_webhooks) },
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`px-3 py-2 rounded-xl text-sm border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border/60 bg-muted/10 hover:border-primary/40'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</div>
    </div>
  );
}

function BalanceCard({ label, valueLabel, valueCents }: { label: string; valueLabel: string; valueCents: number }) {
  return (
    <div className="card card-hover stat-glow p-4 relative">
      <div className="flex items-start justify-between relative z-10">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs text-muted-foreground mb-1 truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight break-words">{valueLabel}</p>
          <p className="text-[11px] text-muted-foreground mt-1">raw: {String(valueCents)}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex shrink-0 items-center justify-center" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
          <CreditCard size={18} style={{ color: 'var(--success)' }} />
        </div>
      </div>
    </div>
  );
}
