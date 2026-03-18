'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Bot, BrainCircuit, CreditCard, Database, Download, FolderOpen,
  Gauge, LifeBuoy, LineChart, List, Mail, MessageCircle, PanelLeftClose,
  PanelLeftOpen, PenLine, Rocket, Search, Settings, Users, Zap,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useDashboard } from '@/store';
import type { AppAudience } from '@/lib/app-audience';
import { BrandLogo } from './brand-logo';

interface NavCounts {
  content: number;
  outreach: number;
  signals_today: number;
  new_leads: number;
  total_pending: number;
}

type BadgeKey = 'customers' | 'billing' | 'support' | 'compliance' | 'signals' | 'pending';
type BadgeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

type HealthSnapshot = {
  summary?: {
    attention?: number;
    critical?: number;
    billing_mismatches?: number;
    open_support_threads?: number;
  };
};

type IncidentSnapshot = {
  summary?: {
    unread_count?: number;
    danger_count?: number;
  };
};

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gauge;
  badgeKey?: BadgeKey;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  badgeKey?: BadgeKey;
  items: NavItem[];
}

type NavBadge = {
  value: string;
  tone: BadgeTone;
};

const ADMIN_FOCUS_ITEMS: NavItem[] = [
  { href: '/', label: 'Uebersicht', icon: Gauge },
  { href: '/customers', label: 'Kunden', icon: Users, badgeKey: 'customers' },
  { href: '/billing', label: 'Billing', icon: CreditCard, badgeKey: 'billing' },
  { href: '/support', label: 'Support', icon: LifeBuoy, badgeKey: 'support' },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

const ADMIN_QUICK_ACTIONS = [
  { href: '/customers#new-customer', label: 'Kunde+', icon: Users },
  { href: '/support', label: 'Inbox', icon: LifeBuoy },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/deploy', label: 'Deploy', icon: Rocket },
];

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: 'REVENUE',
    badgeKey: 'billing',
    items: [
      { href: '/stripe', label: 'Stripe', icon: CreditCard, badgeKey: 'billing' },
      { href: '/db/billing', label: 'Billing DB', icon: Database, badgeKey: 'billing' },
    ],
  },
  {
    label: 'AI & SYSTEME',
    badgeKey: 'pending',
    items: [
      { href: '/openai', label: 'OpenAI', icon: BrainCircuit },
      { href: '/agents/catalog', label: 'Agentenkatalog', icon: Bot },
      { href: '/agents/squads', label: 'Squads', icon: Bot },
      { href: '/agents/workspace', label: 'Workspace', icon: FolderOpen },
      { href: '/memory', label: 'Memory', icon: BrainCircuit },
      { href: '/telegram', label: 'Telegram', icon: Mail },
      { href: '/maestro', label: 'MAESTRO', icon: Zap, badgeKey: 'pending' },
    ],
  },
  {
    label: 'OPERATIONS',
    badgeKey: 'compliance',
    items: [
      { href: '/support/db', label: 'Support DB', icon: Database, badgeKey: 'support' },
      { href: '/compliance', label: 'Verstoesse', icon: Search, badgeKey: 'compliance' },
      { href: '/engagement', label: 'Engagement', icon: MessageCircle },
      { href: '/activity', label: 'Activity', icon: List, badgeKey: 'signals' },
      { href: '/website', label: 'www.aikitz.at', icon: PenLine },
      { href: '/deploy', label: 'Deploy', icon: Rocket },
    ],
  },
  {
    label: 'INSIGHTS',
    badgeKey: 'signals',
    items: [
      { href: '/analytics', label: 'Analytics', icon: LineChart, badgeKey: 'signals' },
    ],
  },
];

const CUSTOMER_NAV_GROUPS: NavGroup[] = [
  {
    label: 'KUNDE',
    items: [
      { href: '/', label: 'Chat', icon: MessageCircle },
      { href: '/agents', label: 'Agenten', icon: Bot },
      { href: '/usage-token', label: 'Guthaben', icon: BarChart3 },
      { href: '/downloads', label: 'Downloads', icon: Download },
      { href: '/support-chat', label: 'Support', icon: LifeBuoy },
      { href: '/hilfe', label: 'Hilfe', icon: Search },
    ],
  },
];

function formatCount(value: number): string {
  if (value > 99) return '99+';
  return String(Math.max(0, value));
}

function toneClass(tone: BadgeTone): string {
  if (tone === 'danger') return 'status-danger';
  if (tone === 'warning') return 'status-warn';
  if (tone === 'success') return 'status-ok';
  if (tone === 'info') return 'status-info';
  return 'status-neutral';
}

export function NavRail({
  currentUser,
  appAudience,
  collapsed = false,
  onToggleCollapsed,
}: {
  currentUser: { account_type?: 'staff' | 'customer'; username?: string } | null;
  appAudience: AppAudience;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const realOnly = useDashboard((state) => state.realOnly);
  const customerView = appAudience === 'customer';

  const { data: counts } = useSmartPoll<NavCounts>(
    () => fetch(`/api/counts${realOnly ? '?real=true' : ''}`).then((response) => response.json()),
    { interval: 30_000, key: realOnly, enabled: !customerView },
  );

  const { data: customerHealth } = useSmartPoll<HealthSnapshot | null>(
    () => fetch('/api/admin/customer-health', { cache: 'no-store' }).then(async (response) => (response.ok ? response.json() : null)),
    { interval: 45_000, enabled: !customerView },
  );

  const { data: incidents } = useSmartPoll<IncidentSnapshot | null>(
    () => fetch('/api/admin/incidents?limit=1', { cache: 'no-store' }).then(async (response) => (response.ok ? response.json() : null)),
    { interval: 30_000, enabled: !customerView },
  );

  const groups = customerView ? CUSTOMER_NAV_GROUPS : ADMIN_NAV_GROUPS;

  function resolveBadge(badgeKey?: BadgeKey): NavBadge | null {
    if (!badgeKey) return null;

    if (badgeKey === 'customers') {
      const critical = Number(customerHealth?.summary?.critical ?? 0);
      const attention = Number(customerHealth?.summary?.attention ?? 0);
      if (critical > 0) return { value: formatCount(critical), tone: 'danger' };
      if (attention > 0) return { value: formatCount(attention), tone: 'warning' };
      return null;
    }

    if (badgeKey === 'billing') {
      const mismatches = Number(customerHealth?.summary?.billing_mismatches ?? 0);
      return mismatches > 0 ? { value: formatCount(mismatches), tone: 'warning' } : null;
    }

    if (badgeKey === 'support') {
      const openSupport = Number(customerHealth?.summary?.open_support_threads ?? 0);
      return openSupport > 0 ? { value: formatCount(openSupport), tone: 'warning' } : null;
    }

    if (badgeKey === 'compliance') {
      const unread = Number(incidents?.summary?.unread_count ?? 0);
      const danger = Number(incidents?.summary?.danger_count ?? 0);
      if (danger > 0) return { value: formatCount(danger), tone: 'danger' };
      if (unread > 0) return { value: formatCount(unread), tone: 'warning' };
      return null;
    }

    if (badgeKey === 'signals') {
      const signals = Number(counts?.signals_today ?? 0);
      return signals > 0 ? { value: formatCount(signals), tone: 'info' } : null;
    }

    if (badgeKey === 'pending') {
      const pending = Number(counts?.total_pending ?? 0);
      return pending > 0 ? { value: formatCount(pending), tone: 'info' } : null;
    }

    return null;
  }

  function renderBadge(badge: NavBadge | null, compact = false) {
    if (!badge) return null;
    return (
      <span
        className={`status-pill ${toneClass(badge.tone)} ${compact ? 'absolute -top-1 -right-1 min-w-[1.2rem] px-1 text-[9px]' : 'min-w-[1.45rem] px-1.5 text-[10px]'}`}
      >
        {badge.value}
      </span>
    );
  }

  function renderNavItem(item: NavItem, depth = 0) {
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    const Icon = item.icon;
    const badge = customerView ? null : resolveBadge(item.badgeKey);

    return (
      <div key={item.href} className="space-y-0.5">
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={`relative w-full flex items-center gap-2 rounded-xl text-sm transition-smooth ${
            customerView
              ? (active
                  ? 'bg-gradient-to-r from-primary/18 via-primary/10 to-transparent text-foreground border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/70 border border-transparent hover:border-border/60')
              : (active
                  ? 'bg-primary/14 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/80 border border-transparent')
          }`}
          style={{ paddingLeft: `${collapsed ? 8 : 8 + depth * 14}px`, paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px' }}
        >
          {active ? <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" /> : null}
          <span
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              customerView
                ? (active ? 'bg-primary/14 text-primary' : 'bg-muted/30 text-muted-foreground')
                : active
                  ? 'bg-primary/12 text-primary'
                  : 'bg-transparent'
            }`}
          >
            <Icon size={depth > 0 ? 14 : 16} />
            {collapsed ? renderBadge(badge, true) : null}
          </span>
          {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
          {!collapsed ? renderBadge(badge) : null}
        </Link>
        {item.children?.map((child) => renderNavItem(child, depth + 1))}
      </div>
    );
  }

  const criticalCustomers = Number(customerHealth?.summary?.critical ?? 0);
  const supportOpen = Number(customerHealth?.summary?.open_support_threads ?? 0);
  const billingDiffs = Number(customerHealth?.summary?.billing_mismatches ?? 0);
  const complianceUnread = Number(incidents?.summary?.unread_count ?? 0);

  return (
    <nav className={`nav-rail fixed left-0 header-offset-top bottom-0 bg-card/92 backdrop-blur-lg border-r border-border/70 z-40 hidden md:flex flex-col transition-[width] duration-300 ${collapsed ? 'nav-width-collapsed' : 'nav-width'}`}>
      <div className="px-3 py-4 border-b border-border/60">
        {customerView ? (
          <div className="flex flex-col items-center text-center gap-2">
            <BrandLogo compact className="justify-center" imageClassName="h-[47px]" />
            {!collapsed ? <div className="text-sm font-semibold">{currentUser?.username || 'Kunde'}</div> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2.5">
              <BrandLogo compact />
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
              >
                {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
            </div>
            {!collapsed ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Admin Focus</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">Mission Control</div>
                  </div>
                  <span className={`status-pill ${criticalCustomers > 0 ? 'status-danger' : (billingDiffs > 0 || supportOpen > 0) ? 'status-warn' : 'status-ok'}`}>
                    {criticalCustomers > 0 ? 'kritisch' : (billingDiffs > 0 || supportOpen > 0) ? 'achtung' : 'stabil'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ADMIN_QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2/80"
                      >
                        <Icon size={14} />
                        <span className="truncate">{action.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {ADMIN_QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      title={action.label}
                      className="flex h-10 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground hover:bg-surface-2/80"
                    >
                      <Icon size={15} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 pr-1 nav-rail-scroll" style={{ scrollbarWidth: 'thin' }}>
        {!customerView ? (
          <div className="mb-3">
            {!collapsed ? (
              <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                TOP-LEVEL
              </div>
            ) : null}
            <div className="space-y-0.5">
              {ADMIN_FOCUS_ITEMS.map((item) => renderNavItem(item))}
            </div>
          </div>
        ) : null}

        {groups.map((group, idx) => {
          const groupBadge = customerView ? null : resolveBadge(group.badgeKey);
          return (
            <div key={group.label} className={idx > 0 || !customerView ? 'mt-3 pt-3 border-t border-border/50' : ''}>
              {!collapsed ? (
                <div className="px-2 pb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                  <span>{group.label}</span>
                  {groupBadge ? (
                    <span className={`status-pill ${toneClass(groupBadge.tone)} min-w-[1.4rem] px-1.5 text-[9px]`}>
                      {groupBadge.value}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => renderNavItem(item))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 py-2 border-t border-border/60">
        {!collapsed && !customerView ? (
          <div className="mb-2 rounded-2xl border border-border/60 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Ops Summary</div>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span>Kritische Kunden</span>
                <span className={`status-pill ${criticalCustomers > 0 ? 'status-danger' : 'status-ok'} min-w-[1.4rem] px-1.5 text-[10px]`}>
                  {formatCount(criticalCustomers)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Support offen</span>
                <span className={`status-pill ${supportOpen > 0 ? 'status-warn' : 'status-ok'} min-w-[1.4rem] px-1.5 text-[10px]`}>
                  {formatCount(supportOpen)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Billing Diffs</span>
                <span className={`status-pill ${billingDiffs > 0 ? 'status-warn' : 'status-ok'} min-w-[1.4rem] px-1.5 text-[10px]`}>
                  {formatCount(billingDiffs)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Compliance</span>
                <span className={`status-pill ${complianceUnread > 0 ? 'status-danger' : 'status-ok'} min-w-[1.4rem] px-1.5 text-[10px]`}>
                  {formatCount(complianceUnread)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        <Link
          href="/settings"
          title={collapsed ? 'Einstellungen' : undefined}
          className={`relative w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-smooth ${
            pathname === '/settings'
              ? 'bg-primary/14 text-primary border border-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/80 border border-transparent'
          }`}
        >
          {pathname === '/settings' ? <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" /> : null}
          <Settings size={16} />
          {!collapsed ? <span>Einstellungen</span> : null}
        </Link>
      </div>
    </nav>
  );
}
