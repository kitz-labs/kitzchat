'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Bot, CreditCard, MessageSquare, Wallet } from 'lucide-react';
import { useAudienceGuard } from '@/hooks/use-audience-guard';

type CustomerRecord = {
  id: number;
  username: string;
  role: string;
  payment_status?: 'not_required' | 'pending' | 'paid';
  plan_amount_cents?: number | null;
  wallet_balance_cents?: number | null;
  onboarding_completed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
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

type CustomerPayload = {
  customer: CustomerRecord;
  summary: {
    conversations: number;
    total_tokens: number;
    total_cents: number;
    last_used_at: number | null;
  };
  agents: AgentUsageRecord[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { ready } = useAudienceGuard({ redirectCustomerTo: '/' });
  const [payload, setPayload] = useState<CustomerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !params?.id) return;

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/customers/${params.id}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load customer');
        if (!alive) return;
        setPayload(data);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError((err as Error).message);
        setPayload(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [params?.id, ready]);

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

  const { customer, summary, agents } = payload;

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft size={14} />
            Zurueck zur Kundenliste
          </Link>
          <h1 className="mt-3 text-xl font-semibold">{customer.username}</h1>
          <p className="text-xs text-muted-foreground">Zahlungsstatus, Nutzungssummen und Agentenaktivitaet dieses Kunden.</p>
        </div>
        <div className={`badge border ${customer.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {customer.payment_status === 'paid' ? 'bezahlt' : 'ausstehend'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<MessageSquare size={16} />} label="Unterhaltungen" value={String(summary.conversations)} />
        <SummaryCard icon={<Bot size={16} />} label="Genutzte Agenten" value={String(agents.length)} />
        <SummaryCard icon={<Wallet size={16} />} label="Token gesamt" value={summary.total_tokens.toLocaleString()} />
        <SummaryCard icon={<CreditCard size={16} />} label="Abgerechnet" value={`€${(summary.total_cents / 100).toFixed(2)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="text-sm font-semibold">Abrechnungsstand</h2>
              <p className="text-xs text-muted-foreground">Aktueller Kundenzugang und Stripe-Verknuepfung im Ueberblick.</p>
            </div>
          </div>
          <div className="panel-body space-y-3 text-sm">
            <InfoRow label="Plan" value={`€${((customer.plan_amount_cents ?? 0) / 100).toFixed(2)}`} />
            <InfoRow label="Guthaben" value={`€${((customer.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
            <InfoRow label="Onboarding" value={customer.onboarding_completed_at ? 'abgeschlossen' : 'offen'} />
            <InfoRow label="Stripe-Kunde" value={customer.stripe_customer_id || 'noch nicht angelegt'} />
            <InfoRow label="Checkout-Sitzung" value={customer.stripe_checkout_session_id || 'noch nicht gestartet'} />
            <InfoRow label="Erstellt" value={new Date(customer.created_at).toLocaleString()} />
            <InfoRow
              label="Letzte Agentennutzung"
              value={summary.last_used_at ? new Date(summary.last_used_at * 1000).toLocaleString() : 'noch keine Nutzung'}
            />
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
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-xl">
                        {agent.emoji}
                      </div>
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