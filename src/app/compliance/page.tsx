'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, SendHorizontal, ShieldAlert, ShieldX } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';
import { toast } from '@/components/ui/toast';

type IncidentType = 'danger' | 'policy-violation';

type Incident = {
  id: number;
  type: IncidentType;
  severity: string;
  title: string | null;
  message: string;
  data: {
    user_id?: number;
    username?: string;
    email?: string | null;
    source?: string;
    conversation_id?: string | null;
    matched_terms?: string[];
    category?: string;
  } | null;
  read: boolean;
  created_at: string;
};

type IncidentPayload = {
  incidents: Incident[];
  summary: {
    danger_count: number;
    violation_count: number;
    unread_count: number;
  };
};

export default function CompliancePage() {
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [payload, setPayload] = useState<IncidentPayload | null>(null);
  const [filter, setFilter] = useState<'all' | IncidentType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const query = filter === 'all' ? '' : `?filter=${filter}`;
        const response = await fetch(`/api/admin/incidents${query}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Protokolle konnten nicht geladen werden');
        if (!alive) return;
        setPayload(data);
        setError(null);
      } catch (fetchError) {
        if (!alive) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Protokolle konnten nicht geladen werden');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filter, ready]);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/admin/telegram/test', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setTelegramConfigured(Boolean(data?.configured)))
      .catch(() => setTelegramConfigured(false));
  }, [ready]);

  async function sendTelegramTest() {
    setTelegramTesting(true);
    try {
      const response = await fetch('/api/admin/telegram/test', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Telegram-Test fehlgeschlagen'));
      toast.success('Telegram-Test erfolgreich gesendet');
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Telegram-Test fehlgeschlagen');
    } finally {
      setTelegramTesting(false);
    }
  }

  const incidents = useMemo(() => payload?.incidents || [], [payload]);

  if (!ready || loading) {
    return <div className="min-h-[40vh] animate-pulse rounded-3xl bg-muted/20" />;
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body text-sm text-destructive">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-semibold">Verstossprotokolle</h1>
        <p className="text-xs text-muted-foreground">Zentrale Uebersicht ueber blockierte Anfragen, Gefahrmeldungen und betroffene Konten.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<ShieldAlert size={16} />} label="Gefahrmeldungen" value={String(payload?.summary.danger_count ?? 0)} tone="danger" />
        <SummaryCard icon={<ShieldX size={16} />} label="Richtlinienverstoesse" value={String(payload?.summary.violation_count ?? 0)} tone="warning" />
        <SummaryCard icon={<AlertTriangle size={16} />} label="Ungelesen" value={String(payload?.summary.unread_count ?? 0)} tone="neutral" />
      </div>

      <div className="panel">
        <div className="panel-body flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'danger', label: 'Gefahr' },
            { id: 'policy-violation', label: 'Verstoesse' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id as 'all' | IncidentType)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === item.id ? 'border-primary bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-body flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-medium">Alert-Kanaele</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Telegram ist aktuell {telegramConfigured ? 'konfiguriert' : 'nicht konfiguriert'}. Hier kannst du die Zustellung direkt testen.
            </div>
          </div>
          <button
            type="button"
            onClick={sendTelegramTest}
            disabled={!telegramConfigured || telegramTesting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizontal size={14} />
            {telegramTesting ? 'Sende Test...' : 'Telegram testen'}
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {incidents.length === 0 ? (
          <div className="panel">
            <div className="panel-body text-sm text-muted-foreground">Aktuell liegen keine Verstoesse oder Gefahrmeldungen vor.</div>
          </div>
        ) : incidents.map((incident) => (
          <div key={incident.id} className="panel">
            <div className="panel-body space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">{incident.title || (incident.type === 'danger' ? 'Gefahrmeldung' : 'Richtlinienverstoss')}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(incident.created_at).toLocaleString('de-DE')}</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${incident.type === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
                  {incident.type === 'danger' ? 'Gefahr' : 'Verstoss'}
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                {incident.message}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                <DataBlock label="Benutzer" value={incident.data?.username || 'unbekannt'} />
                <DataBlock label="E-Mail" value={incident.data?.email || 'nicht hinterlegt'} />
                <DataBlock label="Quelle" value={incident.data?.source || 'n/a'} />
                <DataBlock label="Konversation" value={incident.data?.conversation_id || 'n/a'} />
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Treffer</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(incident.data?.matched_terms || []).length > 0 ? (incident.data?.matched_terms || []).map((term) => (
                    <span key={term} className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">{term}</span>
                  )) : <span className="text-sm text-muted-foreground">Keine Schlagwoerter gespeichert.</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'danger' | 'warning' | 'neutral' }) {
  const toneClass = tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary';
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

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  );
}