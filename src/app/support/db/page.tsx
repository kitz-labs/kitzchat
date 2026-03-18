'use client';

import { useEffect, useState } from 'react';
import { Database, HardDrive, ServerCog } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type DbPayload = {
  sqlite: {
    db_path: string;
    state_dir: string;
    db_size_mb: number;
    seed_count: number;
    tables: Array<{ name: string; count: number }>;
  };
  billing: {
    configured: boolean;
    kind: 'postgres' | 'mysql' | null;
    health: 'ok' | 'error' | 'unconfigured';
    error?: string;
    tables: Array<{ name: string; count: number }>;
  };
};

export default function SupportDbPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [payload, setPayload] = useState<DbPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    (async () => {
      try {
        const response = await fetch('/api/admin/support/db', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'DB-Ansicht konnte nicht geladen werden');
        if (!alive) return;
        setPayload(data);
        setError(null);
      } catch (fetchError) {
        if (!alive) return;
        setError(fetchError instanceof Error ? fetchError.message : 'DB-Ansicht konnte nicht geladen werden');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready]);

  if (!ready || loading) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error || !payload) {
    return (
      <div className="panel">
        <div className="panel-body text-sm text-destructive">{error || 'DB-Ansicht konnte nicht geladen werden'}</div>
      </div>
    );
  }
  const sqliteTables = Array.isArray(payload.sqlite?.tables) ? payload.sqlite.tables : [];
  const billingTables = Array.isArray(payload.billing?.tables) ? payload.billing.tables : [];

  return (
    <div className="space-y-6 animate-in">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<Database size={16} />} label="SQLite-Tabellen" value={String(sqliteTables.length)} />
        <SummaryCard icon={<HardDrive size={16} />} label="SQLite-Groesse" value={`${payload.sqlite.db_size_mb.toFixed(2)} MB`} />
        <SummaryCard icon={<ServerCog size={16} />} label="Billing-DB" value={payload.billing.configured ? (payload.billing.kind || 'aktiv') : 'aus'} />
        <SummaryCard icon={<Database size={16} />} label="Seed-Eintraege" value={String(payload.sqlite.seed_count)} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h1 className="text-xl font-semibold">Support / DB</h1>
            <p className="text-xs text-muted-foreground">Zentrale Einsicht in SQLite-Status, State-Verzeichnis und Billing-Datenbank.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">SQLite Runtime</h2>
              <p className="text-xs text-muted-foreground">Lokale Dashboard-Daten, Support-Chats, Sessions und Notifications.</p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <InfoRow label="DB Path" value={payload.sqlite.db_path} mono />
            <InfoRow label="State Directory" value={payload.sqlite.state_dir} mono />
            <InfoRow label="Groesse" value={`${payload.sqlite.db_size_mb.toFixed(2)} MB`} />
            <InfoRow label="Seed-Eintraege" value={String(payload.sqlite.seed_count)} />
            <TableGrid tables={sqliteTables} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">Billing Datenbank</h2>
              <p className="text-xs text-muted-foreground">Wallet, Payments, Ledger, Entitlements und Stripe-Webhooks.</p>
            </div>
          </div>
          <div className="panel-body space-y-4">
            <InfoRow label="Konfiguriert" value={payload.billing.configured ? 'Ja' : 'Nein'} />
            <InfoRow label="Typ" value={payload.billing.kind || 'nicht konfiguriert'} />
            <InfoRow label="Health" value={payload.billing.health} />
            {payload.billing.error ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{payload.billing.error}</div>
            ) : null}
            <TableGrid tables={billingTables} />
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

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`max-w-[65%] text-right text-sm break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function TableGrid({ tables }: { tables: Array<{ name: string; count: number }> }) {
  if (tables.length === 0) {
    return <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">Keine Tabelleninformationen verfuegbar.</div>;
  }

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Tabellen</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {tables.map((table) => (
          <div key={table.name} className="rounded-2xl border border-border/60 bg-muted/10 px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-sm truncate">{table.name}</span>
            <span className="text-xs font-mono text-muted-foreground">{table.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
