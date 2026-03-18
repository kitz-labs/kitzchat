'use client';

import { useEffect, useState } from 'react';
import {
  Activity, PenLine, MessageCircle, Mail, Users, AlertTriangle, Info, AlertCircle,
  Bell, ThumbsUp, ThumbsDown, Loader2, Zap,
  CheckCircle, Search, Send, CreditCard, Database, ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { TrendChart } from '@/components/ui/trend-chart';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useDashboard } from '@/store';
import { timeAgo } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import type { OverviewStats, Alert, ActivityEntry, DailyMetrics } from '@/types';
import { PipelineFunnel } from '@/components/pipeline/pipeline-funnel';
import { AgentSessions } from '@/components/sessions/agent-sessions';
import { ContentCalendar } from '@/components/content/content-calendar';
import { CustomerHome } from '@/components/customer/customer-home';

interface AgentBrief {
  id: string;
  name: string;
  emoji: string;
  status: string;
  model: string;
  last_action?: string;
  last_action_at?: string;
  actions_today: number;
  next_job?: string;
  next_job_time?: string;
}

interface ActionItem {
  id: string;
  type: 'content' | 'sequence';
  title: string;
  subtitle: string;
  tier?: string;
  created_at: string;
}

interface XBudget {
  date: string;
  calls: number;
  posts: number;
  daily_search_limit: number;
  daily_post_limit: number;
  search_remaining: number;
  post_remaining: number;
}

interface OverviewData {
  stats: OverviewStats;
  alerts: Alert[];
  recentActivity: ActivityEntry[];
  metrics: DailyMetrics[];
  agents?: AgentBrief[];
  action_items?: ActionItem[];
  admin_summary?: {
    customers: {
      total: number;
      new_last_7d: number;
      active_last_30d: number;
      paid: number;
      pending: number;
      top_customers: Array<{
        id: number;
        username: string;
        payment_status?: string | null;
        wallet_balance_cents: number;
        tokens_7d: number;
        messages_7d: number;
        last_active_at: string | null;
      }>;
    };
    stripe: {
      configured: boolean;
      linked_customers: number;
      total_wallet_balance_cents: number;
      total_stripe_customer_balance_cents: number;
      account_available_cents: number | null;
      account_pending_cents: number | null;
    };
    usage: {
      tokens_today: number;
      tokens_week: number;
      tokens_30d: number;
      cost_today: number;
      cost_week: number;
      cost_30d: number;
      active_customers_7d: number;
      top_agents: Array<{ agent_id: string; tokens_week: number; cost_week: number }>;
      daily: Array<{ day: string; total_tokens: number; total_cost: number }>;
    };
    compliance: {
      unread_count: number;
      danger_count: number;
      violation_count: number;
      latest: Array<{ id: number; type: string; message: string; created_at: string; read: boolean }>;
    };
    openai: {
      configured: boolean;
      tracked_tokens_today: number;
      tracked_tokens_week: number;
      tracked_tokens_30d: number;
      tracked_cost_today: number;
      tracked_cost_week: number;
      tracked_cost_30d: number;
      credits_remaining: number | null;
      credits_used: number | null;
      credits_granted: number | null;
      note: string;
    };
  };
}

type Role = 'admin' | 'editor' | 'viewer';

interface ViewerState {
  role: Role;
  account_type?: 'staff' | 'customer';
  app_audience?: 'admin' | 'customer';
}

interface CycleTimeBenchmarkPayload {
  metric: string;
  days: number;
  baseline_mode: 'rolling_window' | 'launch_anchored';
  window: {
    before: { start: string; end: string };
    after: { start: string; end: string };
    now: string;
    launch_at: string | null;
  };
  before: { n: number; medianHours: number | null; p90Hours: number | null };
  after: { n: number; medianHours: number | null; p90Hours: number | null };
  delta: { median_pct: number | null; p90_pct: number | null };
}

export default function OverviewPage() {
  const { realOnly } = useDashboard();
  const realParam = realOnly ? '?real=true' : '';
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const role = viewer?.role ?? 'viewer';
  const customerView = viewer?.app_audience === 'customer';

  const { data, loading } = useSmartPoll<OverviewData>(
    () => fetch(`/api/overview${realParam}`).then(r => r.json()),
    { interval: 30_000, key: `${realOnly}-${refreshKey}`, enabled: viewerLoaded && !customerView },
  );

  const { data: budget } = useSmartPoll<XBudget>(
    () => fetch('/api/x-budget').then(r => r.json()),
    { interval: 60_000, enabled: viewerLoaded && !customerView },
  );

  const { data: cycleBenchmark } = useSmartPoll<CycleTimeBenchmarkPayload>(
    () => fetch(`/api/benchmarks/cycle-time?days=30${realOnly ? '&real=true' : ''}`).then(r => r.json()),
    { interval: 300_000, key: `cycle-${realOnly}`, enabled: viewerLoaded && !customerView },
  );

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((payload) => {
        setViewer({
          role: payload?.user?.role === 'admin' || payload?.user?.role === 'editor' ? payload.user.role : 'viewer',
          account_type: payload?.user?.account_type,
          app_audience: payload?.app_audience,
        });
        setViewerLoaded(true);
      })
      .catch(() => {
        setViewer({ role: 'viewer' });
        setViewerLoaded(true);
      });
  }, []);

  // Start sync service once
  useEffect(() => {
    if (viewerLoaded && !customerView) {
      fetch('/api/sync').catch(() => {});
    }
  }, [customerView, viewerLoaded]);

  if (!viewerLoaded) {
    return <PageSkeleton />;
  }

  if (customerView) {
    return <CustomerHome />;
  }

  if (!data || loading) {
    return <PageSkeleton />;
  }

  const { stats, alerts, recentActivity, metrics, agents, action_items } = data;
  const adminSummary = data.admin_summary;
  const canEdit = role === 'admin' || role === 'editor';

  const metricsReversed = [...metrics].reverse();
  const impressionData = metricsReversed.map(m => ({ date: m.date, value: m.total_impressions }));
  const engagementData = metricsReversed.map(m => ({ date: m.date, value: m.total_engagement }));
  const sendsData = metricsReversed.map(m => ({ date: m.date, value: m.sends }));
  const discoveryData = metricsReversed.map(m => ({ date: m.date, value: m.discoveries }));

  return (
    <div className="space-y-6 animate-in">
      <div className="panel">
        <div className="panel-header">
          <h1 className="text-xl font-semibold">Übersicht</h1>
        </div>
      </div>

      {adminSummary ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Kunden gesamt" value={String(adminSummary.customers.total)} subtitle={`${adminSummary.customers.new_last_7d} neu in 7 Tagen`} icon={<Users size={16} />} tone="primary" />
            <SummaryCard title="Aktive Kunden" value={String(adminSummary.customers.active_last_30d)} subtitle={`${adminSummary.customers.paid} bezahlt, ${adminSummary.customers.pending} offen`} icon={<Activity size={16} />} tone="success" />
            <SummaryCard title="Wallet gesamt" value={formatEuro(adminSummary.stripe.total_wallet_balance_cents)} subtitle={`${adminSummary.stripe.linked_customers} Stripe-Kunden verknuepft`} icon={<CreditCard size={16} />} tone="warning" />
            <SummaryCard title="OpenAI Nutzung" value={formatEuro(adminSummary.openai.tracked_cost_30d)} subtitle={`${formatNumber(adminSummary.openai.tracked_tokens_30d)} Tokens in 30 Tagen`} icon={<Database size={16} />} tone="info" />
            <SummaryCard title="Neue Verstoesse" value={String(adminSummary.compliance.unread_count)} subtitle={`${adminSummary.compliance.danger_count} Gefahr, ${adminSummary.compliance.violation_count} Regelverstoesse`} icon={<ShieldAlert size={16} />} tone={adminSummary.compliance.unread_count > 0 ? 'danger' : 'success'} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.9fr_0.8fr]">
            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Live Nutzung Kunden / OpenAI</h3>
              </div>
              <div className="panel-body">
                <TrendChart
                  data={adminSummary.usage.daily.map((entry) => ({ date: entry.day.slice(5), tokens: entry.total_tokens, cost: entry.total_cost / 100 }))}
                  xKey="date"
                  lines={[
                    { key: 'tokens', color: 'var(--primary)', label: 'Tokens' },
                    { key: 'cost', color: 'var(--warning)', label: 'Kosten €' },
                  ]}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Top 5 Kunden</h3>
              </div>
              <div className="panel-body space-y-3">
                {adminSummary.customers.top_customers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Noch keine aktive Kundennutzung.</div>
                ) : adminSummary.customers.top_customers.map((customer, index) => (
                  <div key={customer.id} className="rounded-2xl border border-border/60 bg-muted/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{index + 1}. {customer.username}</div>
                        <div className="text-xs text-muted-foreground">{customer.payment_status === 'paid' ? 'Bezahlt' : 'Offen'} · {customer.messages_7d} Antworten in 7 Tagen</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-mono">{formatNumber(customer.tokens_7d)} Tok.</div>
                        <div className="text-muted-foreground">{formatEuro(customer.wallet_balance_cents)}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Letzte Aktivitaet {customer.last_active_at ? timeAgo(customer.last_active_at) : 'keine'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <SummaryStack
                title="Stripe"
                rows={[
                  { label: 'Account verfuegbar', value: adminSummary.stripe.account_available_cents !== null ? formatEuro(adminSummary.stripe.account_available_cents) : 'nicht verfuegbar' },
                  { label: 'Account pending', value: adminSummary.stripe.account_pending_cents !== null ? formatEuro(adminSummary.stripe.account_pending_cents) : 'nicht verfuegbar' },
                  { label: 'Kunden-Guthaben', value: formatEuro(adminSummary.stripe.total_wallet_balance_cents) },
                  { label: 'Planvolumen', value: formatEuro(adminSummary.stripe.total_stripe_customer_balance_cents) },
                ]}
              />
              <SummaryStack
                title="OpenAI Nutzung"
                rows={[
                  { label: 'Kosten heute', value: formatEuro(adminSummary.openai.tracked_cost_today) },
                  { label: 'Kosten 7 Tage', value: formatEuro(adminSummary.openai.tracked_cost_week) },
                  { label: 'Kosten 30 Tage', value: formatEuro(adminSummary.openai.tracked_cost_30d) },
                  { label: 'Tokens heute', value: formatNumber(adminSummary.openai.tracked_tokens_today) },
                  { label: 'Tokens 7 Tage', value: formatNumber(adminSummary.openai.tracked_tokens_week) },
                  { label: 'Tokens 30 Tage', value: formatNumber(adminSummary.openai.tracked_tokens_30d) },
                ]}
                footer={adminSummary.openai.note}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Verstosslage</h3>
              </div>
              <div className="panel-body space-y-3">
                {adminSummary.compliance.latest.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Keine Vorfaelle vorhanden.</div>
                ) : adminSummary.compliance.latest.map((incident) => (
                  <div key={incident.id} className={`rounded-2xl border px-4 py-3 text-sm ${incident.type === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{incident.type === 'danger' ? 'Gefahrmeldung' : 'Policy-Verstoss'}</span>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(incident.created_at)}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{incident.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3 className="section-title">Top Agenten nach 7-Tage-Nutzung</h3>
              </div>
              <div className="panel-body space-y-3">
                {adminSummary.usage.top_agents.map((agent) => (
                  <div key={agent.agent_id} className="rounded-2xl border border-border/60 bg-muted/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{agent.agent_id}</div>
                      <div className="text-right text-xs">
                        <div className="font-mono">{formatNumber(agent.tokens_week)} Tokens</div>
                        <div className="text-muted-foreground">{formatEuro(agent.cost_week)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Agent Status Strip */}
      {agents && agents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agents.map(agent => (
            <Link key={agent.id} href="/agents/squads" className="panel card-hover p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-lg shrink-0">
                {agent.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{agent.name}</span>
                  <span className={`w-2 h-2 rounded-full ${
                    agent.status === 'active' ? 'bg-success' :
                    agent.status === 'idle' ? 'bg-warning' :
                    agent.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
                  }`} />
                  <span className="text-[10px] text-muted-foreground capitalize">{agent.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono">{agent.actions_today} Aktionen heute</span>
                  {agent.last_action_at && (
                    <span className="truncate">Letzte: {timeAgo(agent.last_action_at)}</span>
                  )}
                </div>
              </div>
              {agent.next_job && (
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">Nächste</div>
                  <div className="text-xs font-medium">{agent.next_job}</div>
                  {agent.next_job_time && (
                    <div className="text-[10px] text-muted-foreground font-mono">{agent.next_job_time}</div>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* X API Budget + Action Items row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* X API Budget Widget */}
        {budget && !('error' in budget) && (
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title flex items-center gap-2">
              <Search size={14} />
              X-API Budget
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{budget.date}</span>
              </h3>
            </div>
            <div className="panel-body space-y-3">
              <BudgetBar
                label="Suche"
                used={budget.calls}
                limit={budget.daily_search_limit}
                icon={<Search size={12} />}
              />
              <BudgetBar
                label="Beiträge"
                used={budget.posts}
                limit={budget.daily_post_limit}
                icon={<Zap size={12} />}
              />
            </div>
          </div>
        )}

        {/* Action Items — pending approvals */}
        {action_items && action_items.length > 0 && (
          <div className="panel lg:col-span-2">
            <div className="panel-header flex items-center justify-between">
              <h3 className="section-title flex items-center gap-2">
                <Zap size={14} className="text-warning" />
                Action Items
                <span className="text-[10px] bg-warning/15 text-warning px-2 py-0.5 rounded-full font-semibold">
                  {action_items.length}
                </span>
              </h3>
              <div className="flex gap-2">
                <Link
                  href="/content"
                  className="text-[10px] text-primary hover:underline"
                >
                  Content Queue
                </Link>
                <Link
                  href="/outreach"
                  className="text-[10px] text-primary hover:underline"
                >
                  Outreach Approvals
                </Link>
              </div>
            </div>
            <div className="panel-body space-y-2 max-h-64 overflow-y-auto">
              {action_items.map(item => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  onAction={() => setRefreshKey(k => k + 1)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Posts Today"
          value={stats.posts_today}
          icon={PenLine}
          sparkline={impressionData.slice(-14).map(d => ({ value: d.value }))}
          color="var(--primary)"
        />
        <StatCard
          label="Engagements Today"
          value={stats.engagement_today}
          icon={MessageCircle}
          sparkline={engagementData.slice(-14).map(d => ({ value: d.value }))}
          color="var(--success)"
        />
        <StatCard
          label="Emails Sent"
          value={stats.emails_sent}
          icon={Mail}
          sparkline={sendsData.slice(-14).map(d => ({ value: d.value }))}
          color="var(--warning)"
        />
        <StatCard
          label="Pipeline"
          value={stats.pipeline_count}
          icon={Users}
          sparkline={discoveryData.slice(-14).map(d => ({ value: d.value }))}
          color="var(--info)"
        />
      </div>

      <CycleTimeBenchmarkPanel data={cycleBenchmark || undefined} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Impressions (12 weeks)</h3>
          </div>
          <div className="panel-body">
          <TrendChart
            data={metricsReversed.map(m => ({ date: m.date.slice(5), impressions: m.total_impressions }))}
            xKey="date"
            lines={[{ key: 'impressions', color: 'var(--primary)', label: 'Impressions' }]}
          />
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Engagement & Sends (12 weeks)</h3>
          </div>
          <div className="panel-body">
          <TrendChart
            data={metricsReversed.map(m => ({
              date: m.date.slice(5),
              engagement: m.total_engagement,
              sends: m.sends,
            }))}
            xKey="date"
            lines={[
              { key: 'engagement', color: 'var(--success)', label: 'Engagement' },
              { key: 'sends', color: 'var(--warning)', label: 'Sends' },
            ]}
          />
          </div>
        </div>
      </div>

      {/* Pipeline + Sessions + Content row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PipelineFunnel />
        <ContentCalendar />
        <AgentSessions />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Feed */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Recent Activity</h3>
          </div>
          <div className="panel-body space-y-2 max-h-80 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet</p>
            ) : (
              recentActivity.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                    <ActionIcon action={entry.action} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{entry.detail || entry.action}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(entry.ts)}</p>
                  </div>
                  {entry.result && (
                    <span className="text-xs text-success">{entry.result}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Alerts</h3>
          </div>
          <div className="panel-body space-y-2">
            {alerts.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                <CheckCircle size={16} className="mr-2 text-success" />
                All clear
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    alert.type === 'error' ? 'bg-destructive/10' :
                    alert.type === 'warning' ? 'bg-warning/10' :
                    'bg-info/10'
                  }`}
                >
                  {alert.type === 'error' && <AlertCircle size={16} className="text-destructive mt-0.5" />}
                  {alert.type === 'warning' && <AlertTriangle size={16} className="text-warning mt-0.5" />}
                  {alert.type === 'info' && <Info size={16} className="text-info mt-0.5" />}
                  <p className="text-sm">{alert.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetBar({ label, used, limit, icon }: { label: string; used: number; limit: number; icon: React.ReactNode }) {
  const pct = Math.min(100, (used / limit) * 100);
  const isHigh = pct >= 80;
  const isDepleted = pct >= 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={`font-mono font-medium ${isDepleted ? 'text-destructive' : isHigh ? 'text-warning' : ''}`}>
          {used}/{limit}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isDepleted ? 'bg-destructive' : isHigh ? 'bg-warning' : 'bg-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE').format(value || 0);
}

function formatEuro(valueCents: number): string {
  return `€${((valueCents || 0) / 100).toFixed(2)}`;
}

function formatUsd(value: number | null | undefined): string {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'nicht verfuegbar';
}

function SummaryCard({ title, value, subtitle, icon, tone }: { title: string; value: string; subtitle: string; icon: React.ReactNode; tone: 'primary' | 'success' | 'warning' | 'info' | 'danger' }) {
  const toneClass = {
    primary: 'border-primary/30 bg-primary/5',
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    info: 'border-info/30 bg-info/5',
    danger: 'border-destructive/30 bg-destructive/5',
  }[tone];

  return (
    <div className={`panel ${toneClass}`}>
      <div className="panel-body space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span>{title}</span>
          <span>{icon}</span>
        </div>
        <div className="text-3xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

function SummaryStack({ title, rows, footer }: { title: string; rows: Array<{ label: string; value: string }>; footer?: string }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title">{title}</h3>
      </div>
      <div className="panel-body space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
        {footer ? <div className="rounded-2xl border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 1) return `${Math.round(value * 60)}m`;
  return `${value.toFixed(1)}h`;
}

function formatDelta(deltaPct: number | null): string {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return '—';
  const rounded = Math.round(deltaPct * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}%`;
}

function CycleTimeBenchmarkPanel({ data }: { data?: CycleTimeBenchmarkPayload }) {
  if (!data) return null;
  const improveCls = (data.delta.median_pct ?? -1) >= 0 ? 'text-success' : 'text-warning';

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <h3 className="section-title">Lead → Approved Campaign Cycle Time</h3>
        <span className="text-[10px] text-muted-foreground font-mono">
          {data.baseline_mode === 'launch_anchored' ? 'launch anchored' : `rolling ${data.days}d`}
        </span>
      </div>
      <div className="panel-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Before median</div>
            <div className="text-lg font-mono font-semibold mt-1">{formatHours(data.before.medianHours)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">After median</div>
            <div className="text-lg font-mono font-semibold mt-1">{formatHours(data.after.medianHours)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Before p90</div>
            <div className="text-lg font-mono font-semibold mt-1">{formatHours(data.before.p90Hours)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">After p90</div>
            <div className="text-lg font-mono font-semibold mt-1">{formatHours(data.after.p90Hours)}</div>
          </div>
        </div>

        <div className="card p-4 text-sm flex flex-wrap items-center justify-between gap-2">
          <div className="text-muted-foreground">
            n before <span className="font-mono text-foreground">{data.before.n}</span> · n after <span className="font-mono text-foreground">{data.after.n}</span>
          </div>
          <div className={`font-mono ${improveCls}`}>
            median {formatDelta(data.delta.median_pct)} · p90 {formatDelta(data.delta.p90_pct)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionItemCard({ item, onAction, canEdit }: { item: ActionItem; onAction: () => void; canEdit: boolean }) {
  const [acting, setActing] = useState<string | null>(null);

  async function handleAction(action: 'approve' | 'reject') {
    if (!canEdit) return;
    setActing(action);
    try {
      if (item.type === 'content') {
        await fetch('/api/content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, status: action === 'approve' ? 'ready' : 'rejected' }),
        });
      } else {
        await fetch('/api/sequences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, status: action === 'approve' ? 'approved' : 'cancelled' }),
        });
      }
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      onAction();
    } catch {
      toast.error('Failed to update');
    }
    setActing(null);
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${
      item.type === 'content' ? 'bg-primary/5' : 'bg-warning/5'
    }`}>
      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {item.type === 'content' ? <PenLine size={14} /> : <Mail size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{item.title}</span>
          {item.tier && (
            <span className="text-[9px] bg-muted px-1 rounded">Tier {item.tier}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => handleAction('approve')}
            disabled={acting !== null}
            className="flex items-center gap-1 text-[10px] font-medium bg-success/15 text-success hover:bg-success/25 px-2 py-1 rounded transition-colors disabled:opacity-50"
          >
            {acting === 'approve' ? <Loader2 size={10} className="animate-spin" /> : <ThumbsUp size={10} />}
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={acting !== null}
            className="flex items-center gap-1 text-[10px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 px-2 py-1 rounded transition-colors disabled:opacity-50"
          >
            {acting === 'reject' ? <Loader2 size={10} className="animate-spin" /> : <ThumbsDown size={10} />}
          </button>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0">read-only</span>
      )}
    </div>
  );
}

function ActionIcon({ action }: { action: string | null }) {
  const size = 12;
  switch (action) {
    case 'post': return <PenLine size={size} />;
    case 'engage': return <MessageCircle size={size} />;
    case 'send': return <Mail size={size} />;
    case 'alert': return <Bell size={size} />;
    default: return <Info size={size} />;
  }
}

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2].map(i => (
          <div key={i} className="panel p-4 h-20 animate-pulse bg-muted/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="panel p-4 h-32 animate-pulse bg-muted/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="panel p-4 h-64 animate-pulse bg-muted/20" />
        ))}
      </div>
    </div>
  );
}
