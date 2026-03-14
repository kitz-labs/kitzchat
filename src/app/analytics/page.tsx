"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Globe,
  LineChart,
  MousePointerClick,
  Users,
  Send,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  FileText,
  UserPlus,
  UserCheck,
  Compass,
  LayoutTemplate,
} from "lucide-react";
import { useSmartPoll } from "@/hooks/use-smart-poll";
import { useDashboard } from "@/store";
import { StatCard } from "@/components/ui/stat-card";
import { TrendChart } from "@/components/ui/trend-chart";
import { DataTable } from "@/components/ui/data-table";
import type { SocialAnalyticsPoint, SocialAnalyticsSummary } from "@/lib/analytics";
import { formatDurationSeconds } from "@/lib/analytics";
import { timeAgo } from "@/lib/utils";
import type {
  Ga4TopPage,
  Ga4TrafficSource,
  Ga4DeviceSplit,
  Ga4NewVsReturning,
  Ga4GeoEntry,
} from "@/lib/ga4";

interface Ga4Summary {
  activeUsers: number;
  sessions: number;
  pageviews: number;
  bounceRatePct?: number;
  avgSessionDurationSeconds?: number;
}

interface Ga4SeriesPoint {
  date: string;
  activeUsers: number;
  sessions: number;
  pageviews: number;
}

interface PlausibleWebsiteSummary {
  visitors: number;
  pageviews: number;
  bounceRatePct: number;
  visitDurationSeconds: number;
}

interface PlausibleSeriesPoint {
  date: string;
  visitors: number;
  pageviews: number;
}

interface ProviderHealth {
  latency_ms?: number;
  attempts?: number;
  retry_count?: number;
  last_success_at?: string;
  last_error_at?: string;
  stale_after_seconds?: number;
  next_retry_after_seconds?: number;
}

type WebsitePayload =
  | {
      provider: "ga4";
      configured: boolean;
      summary?: Ga4Summary;
      series?: Ga4SeriesPoint[];
      topPages?: Ga4TopPage[];
      trafficSources?: Ga4TrafficSource[];
      deviceSplit?: Ga4DeviceSplit[];
      newVsReturning?: Ga4NewVsReturning[];
      countries?: Ga4GeoEntry[];
      error?: string;
      iframeUrl?: string;
      health?: ProviderHealth;
    }
  | {
      provider: "plausible";
      configured: boolean;
      summary?: PlausibleWebsiteSummary;
      series?: PlausibleSeriesPoint[];
      error?: string;
      iframeUrl?: string;
      health?: ProviderHealth;
    }
  | { provider: "iframe"; configured: boolean; iframeUrl: string; health?: ProviderHealth }
  | { provider: "none"; configured: false; error?: string; iframeUrl?: string; health?: ProviderHealth };

interface AnalyticsPayload {
  days: number;
  website: WebsitePayload;
  social: {
    provider: "internal";
    configured: boolean;
    summary: SocialAnalyticsSummary;
    series: SocialAnalyticsPoint[];
    iframeUrl?: string | null;
  };
}

export default function AnalyticsPage() {
  const { realOnly } = useDashboard();
  const [days, setDays] = useState(30);

  const url = `/api/analytics?days=${days}${realOnly ? "&real=true" : ""}`;
  const { data, loading } = useSmartPoll<AnalyticsPayload>(
    () => fetch(url).then((r) => r.json()),
    { interval: 300_000, key: `${days}-${realOnly}` },
  );

  const socialSeries = useMemo(() => data?.social?.series ?? [], [data]);
  const executiveStats = useMemo(() => {
    if (!data) return null;

    const websiteUsers =
      data.website.provider === "ga4"
        ? data.website.summary?.activeUsers ?? 0
        : data.website.provider === "plausible"
          ? data.website.summary?.visitors ?? 0
          : 0;
    const websitePageviews =
      data.website.provider === "ga4"
        ? data.website.summary?.pageviews ?? 0
        : data.website.provider === "plausible"
          ? data.website.summary?.pageviews ?? 0
          : 0;

    const sessions = data.website.provider === "ga4"
      ? data.website.summary?.sessions ?? 0
      : data.website.provider === "plausible"
        ? data.website.summary?.visitors ?? 0
        : 0;
    const bounceRatePct = data.website.provider === "ga4"
      ? data.website.summary?.bounceRatePct ?? 0
      : data.website.provider === "plausible"
        ? data.website.summary?.bounceRatePct ?? 0
        : 0;
    const pagesPerSession = sessions > 0 ? websitePageviews / sessions : 0;
    const returningUsers = data.website.provider === "ga4"
      ? data.website.newVsReturning?.find((segment) => segment.segment.toLowerCase() === "returning")?.activeUsers ?? 0
      : 0;

    return {
      websiteUsers,
      sessions,
      websitePageviews,
      pagesPerSession,
      bounceRatePct,
      returningUsers,
    };
  }, [data]);

  if (!data || loading) {
    return (
      <div className="space-y-6 animate-in">
        <div className="panel">
          <div className="panel-header">
            <h1 className="text-xl font-semibold">Analytics</h1>
          </div>
          <div className="panel-body">
            <div className="text-sm text-muted-foreground">Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="panel">
        <div className="panel-header flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <LineChart size={18} className="text-primary" />
            <h1 className="text-xl font-semibold">Analytics</h1>
          </div>
          <div className="flex items-center gap-1">
            <RangeButton active={days === 7} onClick={() => setDays(7)} label="7d" />
            <RangeButton active={days === 30} onClick={() => setDays(30)} label="30d" />
            <RangeButton active={days === 90} onClick={() => setDays(90)} label="90d" />
          </div>
        </div>
      </div>

      {executiveStats ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          <StatCard label="Website Users" value={executiveStats.websiteUsers} icon={Globe} color="var(--primary)" />
          <StatCard label="Sessions" value={executiveStats.sessions} icon={Compass} color="var(--success)" />
          <StatCard label="Pageviews" value={executiveStats.websitePageviews} icon={FileText} color="var(--info)" />
          <StatCard label="Views / Session" value={Number(executiveStats.pagesPerSession.toFixed(2))} icon={LayoutTemplate} color="var(--warning)" />
          <StatCard label="Bounce Rate %" value={Number(executiveStats.bounceRatePct.toFixed(1))} icon={Activity} color="var(--destructive)" />
          <StatCard label="Returning Users" value={executiveStats.returningUsers} icon={Users} color="var(--primary)" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <WebsitePanel website={data.website} />
        <WebsiteAudiencePanel website={data.website} />
        <WebsiteContentPanel website={data.website} />
      </div>

      <SocialPanel social={data.social} series={socialSeries} />
    </div>
  );
}

function WebsiteAudiencePanel({ website }: { website: WebsitePayload }) {
  if (website.provider !== "ga4" || !website.configured) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h3 className="section-title flex items-center gap-2">
            <Users size={14} /> Audience
          </h3>
        </div>
        <div className="panel-body text-sm text-muted-foreground">
          Erweiterte Zielgruppenanalyse ist verfuegbar, sobald GA4-Dimensionen geladen werden.
        </div>
      </div>
    );
  }

  const devices = website.deviceSplit ?? [];
  const segments = website.newVsReturning ?? [];
  const countries = website.countries ?? [];
  const topCountry = countries[0];

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title flex items-center gap-2">
          <Users size={14} /> Audience
        </h3>
      </div>
      <div className="panel-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Top Country</div>
            <div className="mt-1 text-lg font-mono font-semibold">{topCountry?.country ?? '—'}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {topCountry ? `${topCountry.activeUsers.toLocaleString()} aktive Nutzer · ${topCountry.sessions.toLocaleString()} Sitzungen` : 'Noch keine Laenderdaten verfuegbar.'}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Ø Sitzungsdauer</div>
            <div className="mt-1 text-lg font-mono font-semibold">{formatDurationSeconds(website.summary?.avgSessionDurationSeconds ?? 0)}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">Wie lange Besucher im Mittel aktiv bleiben.</div>
          </div>
        </div>

        {devices.length > 0 && <DeviceSplitSection devices={devices} />}
        {segments.length > 0 && <NewVsReturningSection segments={segments} />}
        {countries.length > 0 && <CountriesSection countries={countries} />}
      </div>
    </div>
  );
}

function WebsiteContentPanel({ website }: { website: WebsitePayload }) {
  const topPages = website.provider === "ga4" ? website.topPages ?? [] : [];
  const trafficSources = website.provider === "ga4" ? website.trafficSources ?? [] : [];
  const topPage = topPages[0];
  const topSource = trafficSources[0];

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title flex items-center gap-2">
          <FileText size={14} /> Website Analysen
        </h3>
      </div>
      <div className="panel-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Top Page</div>
            <div className="mt-1 text-sm font-semibold truncate">{topPage?.pagePath ?? '—'}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {topPage ? `${topPage.pageviews.toLocaleString()} Views · ${topPage.activeUsers.toLocaleString()} aktive Nutzer` : 'Noch keine Seitenanalyse verfuegbar.'}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Top Traffic Source</div>
            <div className="mt-1 text-sm font-semibold truncate">{topSource?.channel ?? '—'}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {topSource ? `${topSource.sessions.toLocaleString()} Sitzungen · ${topSource.activeUsers.toLocaleString()} aktive Nutzer` : 'Noch keine Kanalanalyse verfuegbar.'}
            </div>
          </div>
        </div>

        {trafficSources.length > 0 && <TrafficSourcesSection sources={trafficSources} />}
        {topPages.length > 0 && <TopPagesSection pages={topPages} />}
      </div>
    </div>
  );
}

function ProviderHealthHint({
  health,
  compact = false,
}: {
  health?: ProviderHealth;
  compact?: boolean;
}) {
  if (!health) return null;
  const parts: string[] = [];
  if (typeof health.latency_ms === "number") parts.push(`${health.latency_ms}ms`);
  if (typeof health.retry_count === "number") parts.push(`retries ${health.retry_count}`);
  if (health.last_success_at) parts.push(`ok ${timeAgo(health.last_success_at)}`);
  if (health.last_error_at) parts.push(`error ${timeAgo(health.last_error_at)}`);
  if (parts.length === 0) return null;

  return (
    <div className={`text-[10px] text-muted-foreground ${compact ? "" : "mt-1"}`}>
      {parts.join(" · ")}
    </div>
  );
}

function RangeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors border ${
        active
          ? "bg-primary/15 text-primary border-primary/30"
          : "bg-muted/50 text-muted-foreground hover:bg-muted border-border/30"
      }`}
    >
      {label}
    </button>
  );
}

/* ─── Traffic Sources Bar ─────────────────────── */

function TrafficSourcesSection({ sources }: { sources: Ga4TrafficSource[] }) {
  const total = sources.reduce((s, c) => s + c.sessions, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="section-title text-xs flex items-center gap-1.5">
        <Activity size={12} />
        Traffic Sources
      </h4>
      <div className="space-y-1.5">
        {sources.map((s) => {
          const pct = total > 0 ? (s.sessions / total) * 100 : 0;
          return (
            <div key={s.channel} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-muted-foreground">{s.channel}</span>
              <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden relative">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max(pct, 1)}%`,
                    background: "var(--primary)",
                    opacity: 0.6,
                  }}
                />
              </div>
              <span className="w-10 text-right font-mono text-muted-foreground">{pct.toFixed(0)}%</span>
              <span className="w-12 text-right font-mono">{s.sessions.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Top Pages Table ─────────────────────────── */

function TopPagesSection({ pages }: { pages: Ga4TopPage[] }) {
  const columns = [
    {
      key: "pagePath",
      label: "Page",
      sortable: true,
      render: (row: Ga4TopPage) => (
        <div className="max-w-[200px]">
          <div className="font-mono text-[11px] truncate">{row.pagePath}</div>
          <div className="text-[10px] text-muted-foreground truncate">{row.pageTitle}</div>
        </div>
      ),
    },
    { key: "pageviews", label: "Views", sortable: true },
    { key: "activeUsers", label: "Users", sortable: true },
  ];

  return (
    <div className="space-y-2">
      <h4 className="section-title text-xs flex items-center gap-1.5">
        <FileText size={12} />
        Top Pages
      </h4>
      <DataTable columns={columns} data={pages} keyField="pagePath" emptyMessage="No page data" />
    </div>
  );
}

/* ─── Device Split ────────────────────────────── */

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function DeviceSplitSection({ devices }: { devices: Ga4DeviceSplit[] }) {
  return (
    <div className="space-y-2">
      <h4 className="section-title text-xs flex items-center gap-1.5">
        <Monitor size={12} />
        Devices
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {devices.map((d) => {
          const Icon = DEVICE_ICONS[d.device.toLowerCase()] || Monitor;
          return (
            <StatCard
              key={d.device}
              label={d.device.charAt(0).toUpperCase() + d.device.slice(1)}
              value={d.activeUsers}
              icon={Icon}
              color="var(--info)"
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── New vs Returning ────────────────────────── */

const NVR_ICONS: Record<string, typeof UserPlus> = {
  new: UserPlus,
  returning: UserCheck,
};

function NewVsReturningSection({ segments }: { segments: Ga4NewVsReturning[] }) {
  return (
    <div className="space-y-2">
      <h4 className="section-title text-xs flex items-center gap-1.5">
        <Users size={12} />
        New vs Returning
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {segments.map((s) => {
          const Icon = NVR_ICONS[s.segment.toLowerCase()] || Users;
          return (
            <StatCard
              key={s.segment}
              label={s.segment.charAt(0).toUpperCase() + s.segment.slice(1)}
              value={s.activeUsers}
              icon={Icon}
              color={s.segment.toLowerCase() === "new" ? "var(--success)" : "var(--primary)"}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Top Countries ───────────────────────────── */

function CountriesSection({ countries }: { countries: Ga4GeoEntry[] }) {
  return (
    <div className="space-y-2">
      <h4 className="section-title text-xs flex items-center gap-1.5">
        <MapPin size={12} />
        Top Countries
      </h4>
      <div className="space-y-1">
        {countries.map((c, i) => (
          <div key={c.country} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-muted-foreground font-mono">{i + 1}</span>
            <span className="flex-1 truncate">{c.country}</span>
            <span className="font-mono text-muted-foreground">{c.activeUsers.toLocaleString()} users</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Website Panel ───────────────────────────── */

function WebsitePanel({ website }: { website: WebsitePayload }) {
  const series = useMemo(() => {
    if (website.provider === "ga4") return Array.isArray(website.series) ? website.series : [];
    if (website.provider === "plausible") return Array.isArray(website.series) ? website.series : [];
    return [];
  }, [website]);
  const ga4Series: Ga4SeriesPoint[] =
    website.provider === "ga4" && Array.isArray(website.series) ? website.series : [];
  const plausibleSeries: PlausibleSeriesPoint[] =
    website.provider === "plausible" && Array.isArray(website.series) ? website.series : [];

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title flex items-center gap-2">
          <Globe size={14} />
          Website
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">
            {website.provider.toUpperCase()}
          </span>
        </h3>
        <ProviderHealthHint health={website.health} compact />
      </div>

      <div className="panel-body space-y-4">
        {website.provider === "ga4" && website.configured && website.summary ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="Active users"
                value={website.summary.activeUsers}
                icon={Users}
                sparkline={ga4Series.map((p) => ({ value: p.activeUsers }))}
                color="var(--primary)"
              />
              <StatCard
                label="Pageviews"
                value={website.summary.pageviews}
                icon={Activity}
                sparkline={ga4Series.map((p) => ({ value: p.pageviews }))}
                color="var(--info)"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card p-4">
                <div className="text-xs text-muted-foreground">Sessions</div>
                <div className="text-lg font-mono font-semibold mt-1">
                  {website.summary.sessions.toLocaleString()}
                </div>
              </div>
              <div className="card p-4">
                <div className="text-xs text-muted-foreground">Avg session</div>
                <div className="text-lg font-mono font-semibold mt-1">
                  {formatDurationSeconds(website.summary.avgSessionDurationSeconds ?? 0)}
                </div>
              </div>
            </div>

            {typeof website.summary.bounceRatePct === "number" && (
              <div className="card p-4">
                <div className="text-xs text-muted-foreground">Bounce rate</div>
                <div className="text-lg font-mono font-semibold mt-1">
                  {website.summary.bounceRatePct.toFixed(1)}%
                </div>
              </div>
            )}

            {series.length > 1 && (
              <div className="panel bg-transparent border border-border/30">
                <div className="panel-header">
                  <h4 className="section-title">Traffic (daily)</h4>
                </div>
                <div className="panel-body">
                  <TrendChart
                    data={series as unknown as Record<string, unknown>[]}
                    xKey="date"
                    lines={[
                      { key: "activeUsers", color: "var(--primary)", label: "Users" },
                      { key: "pageviews", color: "var(--info)", label: "Pageviews" },
                      { key: "sessions", color: "var(--success)", label: "Sessions" },
                    ]}
                  />
                </div>
              </div>
            )}

            {"iframeUrl" in website && website.iframeUrl && (
              <AnalyticsEmbed title="Website analytics embed" src={website.iframeUrl} />
            )}
          </>
        ) : website.provider === "plausible" && website.configured && website.summary ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="Visitors"
                value={website.summary.visitors}
                icon={Users}
                sparkline={plausibleSeries.map((p) => ({ value: p.visitors }))}
                color="var(--primary)"
              />
              <StatCard
                label="Pageviews"
                value={website.summary.pageviews}
                icon={Activity}
                sparkline={plausibleSeries.map((p) => ({ value: p.pageviews }))}
                color="var(--info)"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card p-4">
                <div className="text-xs text-muted-foreground">Bounce rate</div>
                <div className="text-lg font-mono font-semibold mt-1">
                  {(website.summary.bounceRatePct ?? 0).toFixed(1)}%
                </div>
              </div>
              <div className="card p-4">
                <div className="text-xs text-muted-foreground">Visit duration</div>
                <div className="text-lg font-mono font-semibold mt-1">
                  {formatDurationSeconds(website.summary.visitDurationSeconds ?? 0)}
                </div>
              </div>
            </div>

            {series.length > 1 && (
              <div className="panel bg-transparent border border-border/30">
                <div className="panel-header">
                  <h4 className="section-title">Traffic (daily)</h4>
                </div>
                <div className="panel-body">
                  <TrendChart
                    data={series as unknown as Record<string, unknown>[]}
                    xKey="date"
                    lines={[
                      { key: "visitors", color: "var(--primary)", label: "Visitors" },
                      { key: "pageviews", color: "var(--info)", label: "Pageviews" },
                    ]}
                  />
                </div>
              </div>
            )}

            {"iframeUrl" in website && website.iframeUrl && (
              <AnalyticsEmbed title="Website analytics embed" src={website.iframeUrl} />
            )}
          </>
        ) : website.provider === "iframe" ? (
          <AnalyticsEmbed title="Website analytics embed" src={website.iframeUrl} />
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Website analytics not configured.</div>
            {"error" in website && website.error && (
              <div className="text-xs text-warning">{website.error}</div>
            )}
            <div className="text-xs text-muted-foreground">
              Configure either:
              <div className="mt-1 font-mono text-[11px]">GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_JSON</div>
              <div className="mt-1">
                or an embed URL:
                <div className="mt-1 font-mono text-[11px]">KITZCHAT_ANALYTICS_WEBSITE_IFRAME_URL</div>
              </div>
            </div>
            {"iframeUrl" in website && website.iframeUrl && (
              <AnalyticsEmbed title="Website analytics embed" src={website.iframeUrl} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SocialPanel({
  social,
  series,
}: {
  social: AnalyticsPayload["social"];
  series: SocialAnalyticsPoint[];
}) {
  const sparkImpressions = series.map((p) => ({ value: p.impressions }));
  const sparkEngagement = series.map((p) => ({ value: p.engagement }));
  const sparkLeads = series.map((p) => ({ value: p.leads }));
  const sparkSends = series.map((p) => ({ value: p.emailsSent }));

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title flex items-center gap-2">
          <MousePointerClick size={14} />
          Social (Internal Rollups)
        </h3>
      </div>

      <div className="panel-body space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Impressions"
            value={social.summary.impressions}
            icon={Activity}
            sparkline={sparkImpressions}
            color="var(--primary)"
          />
          <StatCard
            label="Engagement"
            value={social.summary.engagement}
            icon={MousePointerClick}
            sparkline={sparkEngagement}
            color="var(--success)"
          />
          <StatCard
            label="Leads"
            value={social.summary.leads}
            icon={Users}
            sparkline={sparkLeads}
            color="var(--info)"
          />
          <StatCard
            label="Emails Sent"
            value={social.summary.emailsSent}
            icon={Send}
            sparkline={sparkSends}
            color="var(--warning)"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Engagement rate</div>
            <div className="text-lg font-mono font-semibold mt-1">
              {social.summary.engagementRatePct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              Zeigt, wie stark die internen Kampagnen-, Outreach- und Response-Aktivitaeten im gewaehlten Zeitraum reagieren.
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted-foreground">Pipeline Fokus</div>
            <div className="text-[11px] text-muted-foreground mt-2">
              Leads <span className="font-mono text-foreground">{social.summary.leads}</span>, versendete Nachrichten{" "}
              <span className="font-mono text-foreground">{social.summary.emailsSent}</span>.
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              Diese Werte stammen aus den internen KitzChat-Rollups, nicht aus nativen Social-Plattform-APIs.
            </div>
          </div>
        </div>

        {series.length > 1 && (
          <div className="panel bg-transparent border border-border/30">
            <div className="panel-header">
              <h4 className="section-title">Impressions & Engagement (daily)</h4>
            </div>
            <div className="panel-body">
              <TrendChart
                data={series as unknown as Record<string, unknown>[]}
                xKey="date"
                lines={[
                  { key: "impressions", color: "var(--primary)", label: "Impressions" },
                  { key: "engagement", color: "var(--success)", label: "Engagement" },
                ]}
              />
            </div>
          </div>
        )}

        {social.iframeUrl && (
          <AnalyticsEmbed title="Social analytics embed" src={social.iframeUrl} />
        )}
      </div>
    </div>
  );
}

function AnalyticsEmbed({ title, src }: { title: string; src: string }) {
  return (
    <div className="card p-0 overflow-hidden border border-border/40">
      <div className="px-4 py-2 border-b border-border/30 text-xs text-muted-foreground">
        {title}
      </div>
      <div className="w-full aspect-[16/10] bg-muted">
        <iframe
          title={title}
          src={src}
          className="w-full h-full"
          referrerPolicy="no-referrer"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
