'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';

type UsageTotals = {
  tokens_today: number;
  tokens_week: number;
  tokens_30d: number;
  cost_today: number;
  cost_week: number;
  cost_30d: number;
};

type UsageByAgentRow = {
  agent_id: string;
  tokens_today: number;
  tokens_week: number;
  cost_today: number;
  cost_week: number;
};

type UsageDailyRow = {
  day: string;
  total_tokens: number;
  total_cost: number;
};

type UsagePayload = {
  days: number;
  totals: UsageTotals;
  by_agent: UsageByAgentRow[];
  daily: UsageDailyRow[];
};

function nf0() {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
}

function nf2() {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCentsEur(cents: number) {
  return `${nf2().format((Number(cents) || 0) / 100)} €`;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

export function HelpUsageTable({ days = 14 }: { days?: number }) {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setPayload(null);

    fetch(`/api/usage?days=${encodeURIComponent(String(days))}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as UsagePayload & { error?: string };
        if (!res.ok) throw new Error(data?.error || 'Usage konnte nicht geladen werden');
        if (!alive) return;
        setPayload(data);
      })
      .catch((err) => {
        if (!alive) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [days]);

  const totals = payload?.totals;
  const byAgent = useMemo(() => payload?.by_agent || [], [payload]);
  const daily = useMemo(() => payload?.daily || [], [payload]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!payload || !totals) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
        Keine Daten verfuegbar.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Tokens heute" value={nf0().format(totals.tokens_today)} />
        <Summary label="Tokens 7 Tage" value={nf0().format(totals.tokens_week)} />
        <Summary label="Tokens 30 Tage" value={nf0().format(totals.tokens_30d)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Kosten heute" value={formatCentsEur(totals.cost_today)} />
        <Summary label="Kosten 7 Tage" value={formatCentsEur(totals.cost_week)} />
        <Summary label="Kosten 30 Tage" value={formatCentsEur(totals.cost_30d)} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
        <div className="text-sm font-semibold">Nach Agent (7 Tage)</div>
        <div className="mt-3">
          <DataTable
            keyField="agent_id"
            data={byAgent}
            columns={[
              { key: 'agent_id', label: 'Agent', sortable: true },
              { key: 'tokens_today', label: 'Tokens (heute)', sortable: true, render: (r) => nf0().format(r.tokens_today) },
              { key: 'tokens_week', label: 'Tokens (7T)', sortable: true, render: (r) => nf0().format(r.tokens_week) },
              { key: 'cost_week', label: 'Kosten (7T)', sortable: true, render: (r) => formatCentsEur(r.cost_week) },
            ]}
            emptyMessage="Noch keine Agent-Nutzung erfasst."
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
        <div className="text-sm font-semibold">Pro Tag (letzte {payload.days} Tage)</div>
        <div className="mt-3">
          <DataTable
            keyField="day"
            data={[...daily].reverse()}
            columns={[
              { key: 'day', label: 'Tag', sortable: true },
              { key: 'total_tokens', label: 'Tokens', sortable: true, render: (r) => nf0().format(r.total_tokens) },
              { key: 'total_cost', label: 'Kosten', sortable: true, render: (r) => formatCentsEur(r.total_cost) },
            ]}
            emptyMessage="Noch keine Tagesdaten vorhanden."
          />
        </div>
      </div>
    </div>
  );
}

