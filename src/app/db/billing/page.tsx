'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Search, X } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type TablesPayload = { ok?: boolean; tables?: string[]; error?: string };
type TablePayload = {
  ok?: boolean;
  table?: string | null;
  columns?: Array<{ column_name: string; data_type: string }>;
  rows?: Array<Record<string, unknown>>;
  limit?: number;
  offset?: number;
  total?: number;
  error?: string;
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function BillingDbPage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TablePayload | null>(null);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  async function loadTables() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/db/billing/tables', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as TablesPayload;
      if (!res.ok) throw new Error(String(data?.error || 'Tabellen konnten nicht geladen werden'));
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (e) {
      setError((e as Error).message || 'Tabellen konnten nicht geladen werden');
      setTables([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTable(name: string, nextOffset = offset, nextLimit = limit) {
    setTableLoading(true);
    setTableError(null);
    try {
      const url = new URL('/api/admin/db/billing/table', window.location.origin);
      url.searchParams.set('name', name);
      url.searchParams.set('limit', String(nextLimit));
      url.searchParams.set('offset', String(nextOffset));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as TablePayload;
      if (!res.ok) throw new Error(String(data?.error || 'Tabelle konnte nicht geladen werden'));
      setTableData(data);
    } catch (e) {
      setTableError((e as Error).message || 'Tabelle konnte nicht geladen werden');
      setTableData(null);
    } finally {
      setTableLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    loadTables();
  }, [ready]);

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(tables) ? tables : [];
    if (!q) return list;
    return list.filter((t) => t.toLowerCase().includes(q));
  }, [tables, query]);

  const columns = tableData?.columns ?? [];
  const rows = tableData?.rows ?? [];
  const total = Number(tableData?.total ?? 0);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Database size={18} /> Billing Datenbank</h1>
          <p className="text-xs text-muted-foreground mt-1">Tabellen ansehen (read-only). Klick auf Tabelle → Popup mit Rows.</p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => loadTables()} disabled={loading}>
          Neu laden
        </button>
      </div>

      {loading ? (
        <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />
      ) : error ? (
        <div className="panel">
          <div className="panel-body">
            <div className="text-sm font-medium">Billing DB nicht verfuegbar</div>
            <div className="mt-1 text-xs text-muted-foreground">{error}</div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-body space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border/60 bg-background/60 pl-9 pr-3 text-sm"
                  placeholder="Tabelle suchen…"
                />
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">{filteredTables.length} Tabellen</div>
            </div>

            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {filteredTables.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rounded-2xl border border-border/60 bg-background/40 hover:bg-background/60 transition-colors p-4 text-left"
                  onClick={() => {
                    setSelectedTable(t);
                    setOffset(0);
                    loadTable(t, 0, limit);
                  }}
                >
                  <div className="text-sm font-semibold truncate">{t}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Ansehen</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedTable ? (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTable('')} />
          <div className="absolute left-1/2 top-1/2 w-[min(1200px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-3xl border border-border/60 bg-card/95 shadow-2xl overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-5 border-b border-border/60">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tabelle</div>
                  <div className="mt-1 text-lg font-semibold truncate">{selectedTable}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {total > 0 ? `${total.toLocaleString('de-DE')} Zeilen` : '—'}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedTable('')}>
                  <X size={16} /> Schliessen
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Limit</label>
                    <select
                      value={limit}
                      onChange={(e) => {
                        const next = Math.max(10, Math.min(200, Number(e.target.value)));
                        setLimit(next);
                        setOffset(0);
                        loadTable(selectedTable, 0, next);
                      }}
                      className="h-9 rounded-md border border-border/60 bg-background/60 px-2 text-xs"
                      disabled={tableLoading}
                    >
                      {[25, 50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={tableLoading || offset <= 0}
                      onClick={() => {
                        const next = Math.max(0, offset - limit);
                        setOffset(next);
                        loadTable(selectedTable, next, limit);
                      }}
                    >
                      Zurueck
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={tableLoading || (offset + limit) >= total}
                      onClick={() => {
                        const next = offset + limit;
                        setOffset(next);
                        loadTable(selectedTable, next, limit);
                      }}
                    >
                      Weiter
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={tableLoading}
                      onClick={() => loadTable(selectedTable, offset, limit)}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {tableLoading ? (
                  <div className="h-[50vh] animate-pulse rounded-3xl bg-muted/20" />
                ) : tableError ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                    {tableError}
                  </div>
                ) : (
                  <div className="overflow-auto rounded-2xl border border-border/60 max-h-[55vh]">
                    <table className="min-w-[920px] w-full text-xs">
                      <thead className="bg-muted/20 text-[11px] text-muted-foreground">
                        <tr>
                          {columns.map((c) => (
                            <th key={c.column_name} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                              {c.column_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td className="px-3 py-4 text-muted-foreground" colSpan={Math.max(1, columns.length)}>
                              Keine Daten.
                            </td>
                          </tr>
                        ) : rows.map((row, idx) => (
                          <tr key={idx} className="border-t border-border/60">
                            {columns.map((c) => (
                              <td key={c.column_name} className="px-3 py-2 align-top">
                                <div className="max-w-[360px] truncate" title={formatCell(row[c.column_name])}>
                                  {formatCell(row[c.column_name])}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
