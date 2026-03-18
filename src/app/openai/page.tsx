'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { Plus, RefreshCw, Trash2, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';

type OverviewPayload = {
  ok?: boolean;
  range?: { start: string; end: string };
  fx?: { usd_to_eur: number; fixed: boolean };
  config?: {
    project_id: string | null;
    admin_key_configured: boolean;
    api_key_configured: boolean;
    webhook_secret_configured: boolean;
    configured: boolean;
    webhook_url: string;
  };
  openai?: {
    credit_balance?: {
      configured: boolean;
      source?: string;
      remaining_usd: number | null;
      remaining_eur: number | null;
      used_usd: number | null;
      granted_usd: number | null;
      note: string;
    };
    costs?: {
      range_total_usd: number;
      range_total_eur: number;
      to_date_total_usd: number;
      to_date_total_eur: number;
      buckets_1d?: any[];
      error?: string | null;
    };
    usage?: {
      totals?: { inputTokens: number; outputTokens: number; totalTokens: number; numRequests: number };
      buckets_1d?: any[];
      source?: string;
    };
    prepaid?: {
      topups_total_usd: number;
      topups_total_eur: number;
      remaining_usd: number | null;
      remaining_eur: number | null;
    };
    ledger?: {
      topups?: Array<{ id: string; purchased_at: string; amount_usd: number; note?: string; reference?: string }>;
    };
  };
  internal?: {
    stripe_topups_eur: number;
    credits_issued: number;
    wallet_balance_credits: number;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number; openaiCostEur: number };
  };
  comparison?: { delta_eur: number };
  error?: string;
};

function currency(value: number, code: 'EUR' | 'USD'): string {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: code }).format(v);
}

function numberFmt(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('de-DE').format(Math.round(v));
}

function OpenAiPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultStartIso = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return d.toISOString().slice(0, 10);
  }, []);

  function isIsoDay(value: string | null): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  const start = isIsoDay(searchParams.get('start')) ? (searchParams.get('start') as string) : defaultStartIso;
  const end = isIsoDay(searchParams.get('end')) ? (searchParams.get('end') as string) : todayIso;
  const rangeKey = `${start}..${end}`;

  const [startDraft, setStartDraft] = useState(start);
  const [endDraft, setEndDraft] = useState(end);

  const { data, loading, error, refetch } = useSmartPoll<OverviewPayload>(
    () => fetch(`/api/admin/openai/overview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({})))?.error || 'Request failed')))),
    { interval: 60_000, key: rangeKey },
  );

  const cfg = data?.config;
  const topups = data?.openai?.ledger?.topups || [];
  const fx = data?.fx?.usd_to_eur ?? 0.92;

  const [topupDate, setTopupDate] = useState(todayIso);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [topupRef, setTopupRef] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupOk, setTopupOk] = useState<string | null>(null);

  function applyRange() {
    const nextStart = isIsoDay(startDraft) ? startDraft : defaultStartIso;
    const nextEnd = isIsoDay(endDraft) ? endDraft : todayIso;
    const p = new URLSearchParams(searchParams.toString());
    p.set('start', nextStart);
    p.set('end', nextEnd);
    router.replace(`/openai?${p.toString()}`);
  }

  async function addTopup() {
    setTopupBusy(true);
    setTopupError(null);
    setTopupOk(null);
    try {
      const purchasedAt = `${topupDate}T12:00:00.000Z`;
      const amountUsd = Number(topupAmount);
      const res = await fetch('/api/admin/openai/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchased_at: purchasedAt,
          amount_usd: amountUsd,
          note: topupNote || undefined,
          reference: topupRef || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error || 'Top-up konnte nicht gespeichert werden'));
      setTopupAmount('');
      setTopupNote('');
      setTopupRef('');
      setTopupOk('Top-up gespeichert.');
      await refetch();
    } catch (e) {
      setTopupError((e as Error).message || 'Top-up fehlgeschlagen');
    } finally {
      setTopupBusy(false);
    }
  }

  async function deleteTopup(id: string) {
    if (!id) return;
    setTopupBusy(true);
    setTopupError(null);
    setTopupOk(null);
    try {
      const res = await fetch(`/api/admin/openai/topups?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error || 'Loeschen fehlgeschlagen'));
      setTopupOk('Top-up geloescht.');
      await refetch();
    } catch (e) {
      setTopupError((e as Error).message || 'Loeschen fehlgeschlagen');
    } finally {
      setTopupBusy(false);
    }
  }

  const openaiConfigured = Boolean(cfg?.configured);
  const openaiCostsUsd = data?.openai?.costs?.range_total_usd ?? 0;
  const openaiCostsEur = data?.openai?.costs?.range_total_eur ?? 0;
  const prepaidRemainingEur = data?.openai?.prepaid?.remaining_eur ?? null;
  const creditRemainingUsd = data?.openai?.credit_balance?.remaining_usd ?? null;
  const creditRemainingEur = data?.openai?.credit_balance?.remaining_eur ?? null;
  const creditNote = String(data?.openai?.credit_balance?.note || '').trim();
  const creditSource = String(data?.openai?.credit_balance?.source || 'unknown');

  const [balanceOverrideUsd, setBalanceOverrideUsd] = useState('');
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceMsg, setBalanceMsg] = useState<string | null>(null);

  useEffect(() => {
    setBalanceMsg(null);
  }, [rangeKey]);

  async function saveCreditBalanceOverride() {
    setBalanceSaving(true);
    setBalanceMsg(null);
    try {
      const raw = balanceOverrideUsd.trim();
      const num = Number(raw.replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) throw new Error('Bitte USD Betrag eingeben (z.B. 29.44)');
      const res = await fetch('/api/admin/openai/credit-balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override_usd: num }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error || 'Speichern fehlgeschlagen'));
      setBalanceMsg('Credit Balance gespeichert.');
      setBalanceOverrideUsd('');
      await refetch();
    } catch (e) {
      setBalanceMsg((e as Error).message || 'Speichern fehlgeschlagen');
    } finally {
      setBalanceSaving(false);
    }
  }

  async function clearCreditBalanceOverride() {
    setBalanceSaving(true);
    setBalanceMsg(null);
    try {
      const res = await fetch('/api/admin/openai/credit-balance', { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error || 'Loeschen fehlgeschlagen'));
      setBalanceMsg('Manueller Wert geloescht.');
      await refetch();
    } catch (e) {
      setBalanceMsg((e as Error).message || 'Loeschen fehlgeschlagen');
    } finally {
      setBalanceSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">OpenAI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Projekt-Reporting: Usage + Kosten + Prepaid-Restguthaben (Ledger) und Abgleich mit Nexora Wallet/Top-ups.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-9 rounded-md border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          disabled={loading}
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </span>
        </button>
      </div>

      <div className="panel">
        <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
          <h2 className="section-title">Zeitraum</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">bis</span>
            <input
              type="date"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={endDraft}
              onChange={(e) => setEndDraft(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={() => applyRange()}>
              Anwenden
            </button>
          </div>
        </div>
        <div className="panel-body text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <div>FX fix: <span className="font-mono text-foreground">USD→EUR {fx}</span></div>
          <div className="flex items-center gap-3">
            <a className="hover:text-foreground inline-flex items-center gap-1" href="/api/openai/webhook" target="_blank" rel="noreferrer">
              Webhook Endpoint <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">OpenAI Kosten (Range)</div>
          <div className="mt-1 text-lg font-semibold font-mono text-foreground">{currency(openaiCostsUsd, 'USD')}</div>
          <div className="text-[11px] text-muted-foreground">≈ {currency(openaiCostsEur, 'EUR')}</div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Stripe Top-ups (Range)</div>
          <div className="mt-1 text-lg font-semibold font-mono text-foreground">{currency(data?.internal?.stripe_topups_eur ?? 0, 'EUR')}</div>
          <div className="text-[11px] text-muted-foreground">Credits issued: {numberFmt(data?.internal?.credits_issued ?? 0)}</div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Credit Balance (OpenAI)</div>
          <div className={`mt-1 text-lg font-semibold font-mono ${
            creditRemainingUsd === null ? 'text-muted-foreground' : creditRemainingUsd > 0 ? 'text-success' : 'text-warning'
          }`}>
            {creditRemainingUsd === null ? '—' : currency(creditRemainingUsd, 'USD')}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {creditRemainingEur === null ? '—' : `≈ ${currency(creditRemainingEur, 'EUR')}`}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Quelle: <span className="font-mono text-foreground">{creditSource}</span>
          </div>
        </div>
        <div className="stat-tile">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Prepaid Rest (Ledger)</div>
          <div className={`mt-1 text-lg font-semibold font-mono ${prepaidRemainingEur === null ? 'text-muted-foreground' : prepaidRemainingEur > 0 ? 'text-success' : 'text-warning'}`}>
            {prepaidRemainingEur === null ? '—' : currency(prepaidRemainingEur, 'EUR')}
          </div>
          <div className="text-[11px] text-muted-foreground">Berechnet aus Top-ups (USD) − OpenAI Costs (USD)</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
          <h2 className="section-title">Konfiguration</h2>
          <div className="text-xs text-muted-foreground">
            Projekt: <code className="text-foreground">{cfg?.project_id || '—'}</code>
          </div>
        </div>
        <div className="panel-body grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Secrets (ENV)</div>
            <div className="space-y-1 text-sm">
              <FlagRow label="OPENAI_ADMIN_KEY" ok={Boolean(cfg?.admin_key_configured)} />
              <FlagRow label="OPENAI_PROJECT" ok={Boolean(cfg?.project_id)} />
              <FlagRow label="OPENAI_API_KEY" ok={Boolean(cfg?.api_key_configured)} />
              <FlagRow label="OPENAI_WEBHOOK_SECRET" ok={Boolean(cfg?.webhook_secret_configured)} />
            </div>
            {!openaiConfigured ? (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5" />
                <div>
                  Fuer Costs/Usage wird ein <span className="font-mono">OPENAI_ADMIN_KEY</span> benoetigt. Du kannst die Secrets danach in Hostinger/VPS setzen.
                </div>
              </div>
            ) : null}
            {data?.openai?.costs?.error ? (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                OpenAI API Fehler: {String(data.openai.costs.error)}
              </div>
            ) : null}
            {creditRemainingUsd === null ? (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <div className="font-semibold">Credit Balance nicht automatisch lesbar.</div>
                <div className="mt-1 text-muted-foreground">
                  {creditNote || 'OpenAI blockiert die Billing-Credit-API fuer diesen Key (403).'}
                </div>
              </div>
            ) : null}

            <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Credit Balance (manuell)</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Falls OpenAI keinen API-Zugriff liefert, setze hier den Wert aus dem OpenAI Billing-UI (USD).
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <input
                  value={balanceOverrideUsd}
                  onChange={(e) => setBalanceOverrideUsd(e.target.value)}
                  className="h-9 w-36 rounded-md border border-border/60 bg-background/60 px-3 text-xs font-mono"
                  placeholder="29.44"
                />
                <button className="btn btn-primary btn-sm" onClick={() => saveCreditBalanceOverride()} disabled={balanceSaving}>
                  Speichern
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => clearCreditBalanceOverride()} disabled={balanceSaving}>
                  Zuruecksetzen
                </button>
              </div>
              {balanceMsg ? <div className="mt-2 text-[11px] text-muted-foreground">{balanceMsg}</div> : null}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Usage (intern)</div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Input Tokens" value={numberFmt(data?.internal?.usage?.inputTokens ?? 0)} />
              <MiniStat label="Output Tokens" value={numberFmt(data?.internal?.usage?.outputTokens ?? 0)} />
              <MiniStat label="Total Tokens" value={numberFmt(data?.internal?.usage?.totalTokens ?? 0)} />
              <MiniStat label="Kosten (EUR)" value={currency(data?.internal?.usage?.openaiCostEur ?? 0, 'EUR')} />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Quelle: Nexora <code>usage_runs</code> (modellbasiertes Routing + Wallet-Abrechnung).
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header flex items-center justify-between gap-3 flex-wrap">
          <h2 className="section-title">OpenAI Prepaid Top-up Ledger (USD)</h2>
          <div className="text-xs text-muted-foreground">
            Gesamt: <span className="font-mono text-foreground">{currency(data?.openai?.prepaid?.topups_total_usd ?? 0, 'USD')}</span> (≈ {currency(data?.openai?.prepaid?.topups_total_eur ?? 0, 'EUR')})
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="date"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              value={topupDate}
              onChange={(e) => setTopupDate(e.target.value)}
            />
            <input
              inputMode="decimal"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              placeholder="Amount USD (z.B. 100)"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
            />
            <input
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              placeholder="Note (optional)"
              value={topupNote}
              onChange={(e) => setTopupNote(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm flex-1"
                placeholder="Reference (optional)"
                value={topupRef}
                onChange={(e) => setTopupRef(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => addTopup()}
                disabled={topupBusy}
                title="Top-up speichern"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus size={14} /> Hinzufuegen
                </span>
              </button>
            </div>
          </div>

          {topupOk ? (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success flex items-center gap-2">
              <CheckCircle2 size={14} /> {topupOk}
            </div>
          ) : null}
          {topupError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {topupError}
            </div>
          ) : null}

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/60">
                  <th className="text-left py-2 pr-3 font-medium">Datum</th>
                  <th className="text-left py-2 pr-3 font-medium">Amount</th>
                  <th className="text-left py-2 pr-3 font-medium">Note</th>
                  <th className="text-left py-2 pr-3 font-medium">Reference</th>
                  <th className="text-right py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {topups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Keine Top-ups gespeichert.
                    </td>
                  </tr>
                ) : (
                  topups.map((t) => (
                    <tr key={t.id} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-mono text-xs">{String(t.purchased_at).slice(0, 10)}</td>
                      <td className="py-2 pr-3 font-mono">{currency(Number(t.amount_usd || 0), 'USD')}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{t.note || '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{t.reference || '—'}</td>
                      <td className="py-2 text-right">
                        <button
                          className="inline-flex items-center gap-2 text-xs text-destructive hover:underline disabled:opacity-50"
                          onClick={() => deleteTopup(t.id)}
                          disabled={topupBusy}
                        >
                          <Trash2 size={14} /> Loeschen
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="section-title">Abgleich (Range)</h2>
        </div>
        <div className="panel-body grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniStat label="Stripe Top-ups (EUR)" value={currency(data?.internal?.stripe_topups_eur ?? 0, 'EUR')} />
          <MiniStat label="OpenAI Costs (EUR)" value={currency(openaiCostsUsd * fx, 'EUR')} />
          <MiniStat label="Delta (EUR)" value={currency(data?.comparison?.delta_eur ?? 0, 'EUR')} />
        </div>
        <div className="panel-body pt-0 text-[11px] text-muted-foreground">
          Hinweis: OpenAI Costs kommen aus dem Projekt (Org Costs API, USD), die Umrechnung ist fix (USD→EUR).
        </div>
      </div>

      {loading ? (
        <div className="panel p-6 h-24 animate-pulse bg-muted/20" />
      ) : null}
      {error ? (
        <div className="panel p-4 text-sm text-destructive border border-destructive/30 bg-destructive/10">
          {(error as Error).message}
        </div>
      ) : null}
    </div>
  );
}

function FlagRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-xs">{label}</span>
      <span className={`text-xs font-semibold ${ok ? 'text-success' : 'text-muted-foreground'}`}>
        {ok ? 'OK' : '—'}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm font-semibold font-mono text-foreground">{value}</div>
    </div>
  );
}

export default function OpenAiPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <OpenAiPageInner />
    </Suspense>
  );
}
