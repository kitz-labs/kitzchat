'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gauge, Bot, PenLine, MessageCircle, Mail, Contact, Zap,
  Search, BarChart3, LineChart, BrainCircuit, Rocket, Clock, List, Settings,
  FolderOpen, Users, CreditCard, Database,
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

type CountKey = keyof NavCounts;

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gauge;
  countKey?: CountKey;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'KERN',
    items: [
      { href: '/', label: 'Uebersicht', icon: Gauge },
      { href: '/agents/catalog', label: 'Agentenkatalog', icon: Bot },
      { href: '/agents/squads', label: 'Squads', icon: Bot },
      { href: '/agents/comms', label: 'Comms', icon: MessageCircle },
      {
        href: '/agents/workspace',
        label: 'Workspace',
        icon: FolderOpen,
        children: [
          {
            href: '/support',
            label: 'Support',
            icon: Mail,
            children: [
              { href: '/support/db', label: 'DB', icon: Database },
            ],
          },
        ],
      },
    ],
  },
  {
    label: 'BETRIEB',
    items: [
      { href: '/customers', label: 'Kunden', icon: Users },
      { href: '/billing', label: 'Abrechnung', icon: CreditCard },
      { href: '/compliance', label: 'Verstoesse', icon: Search },
      { href: '/content', label: 'Content', icon: PenLine, countKey: 'content' },
      { href: '/engagement', label: 'Engagement', icon: MessageCircle },
      { href: '/outreach', label: 'Outreach', icon: Mail, countKey: 'outreach' },
      { href: '/crm', label: 'CRM', icon: Contact, countKey: 'new_leads' },
      { href: '/automations', label: 'Automations', icon: Zap, countKey: 'outreach' },
    ],
  },
  {
    label: 'EINBLICKE',
    items: [
      { href: '/research', label: 'Research', icon: Search, countKey: 'signals_today' },
      { href: '/kpis', label: 'KPIs', icon: BarChart3 },
      { href: '/analytics', label: 'Analytics', icon: LineChart },
      { href: '/memory', label: 'Memory', icon: BrainCircuit },
      { href: '/deploy', label: 'Deploy', icon: Rocket },
      { href: '/cron', label: 'Cron', icon: Clock },
      { href: '/activity', label: 'Activity', icon: List },
    ],
  },
];

const CUSTOMER_NAV_GROUPS: NavGroup[] = [
  {
    label: 'KUNDE',
    items: [
      { href: '/', label: 'Webchat', icon: MessageCircle },
      { href: '/agents', label: 'Agenten', icon: Bot },
      { href: '/usage-token', label: 'Guthaben', icon: BarChart3 },
      { href: '/settings', label: 'Einstellungen', icon: Settings },
      { href: '/hilfe', label: 'Hilfe', icon: Search },
    ],
  },
];

export function NavRail({ currentUser, appAudience }: { currentUser: { account_type?: 'staff' | 'customer'; username?: string } | null; appAudience: AppAudience }) {
  const pathname = usePathname();
  const realOnly = useDashboard(s => s.realOnly);
  const customerView = appAudience === 'customer';

  const { data: counts } = useSmartPoll<NavCounts>(
    () => fetch(`/api/counts${realOnly ? '?real=true' : ''}`).then(r => r.json()),
    { interval: 30_000, key: realOnly, enabled: !customerView },
  );

  const groups = customerView ? CUSTOMER_NAV_GROUPS : NAV_GROUPS;

  function renderNavItem(item: NavItem, depth = 0) {
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    const count = item.countKey && counts ? counts[item.countKey] : 0;
    const Icon = item.icon;

    return (
      <div key={item.href} className="space-y-0.5">
        <Link
          href={item.href}
          className={`relative w-full flex items-center gap-2 rounded-lg text-sm transition-smooth ${
            active
              ? 'bg-primary/14 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/80'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px' }}
        >
          {active && <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />}
          <Icon size={depth > 0 ? 14 : 16} />
          <span className="flex-1 truncate">{item.label}</span>
          {!customerView && count > 0 && (
            <span className={`min-w-[18px] h-4 px-1 text-[9px] font-bold rounded-full flex items-center justify-center ${
              item.countKey === 'signals_today' ? 'count-badge-info' : 'count-badge'
            }`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Link>
        {item.children?.map((child) => renderNavItem(child, depth + 1))}
      </div>
    );
  }

  return (
    <nav className="nav-rail fixed left-0 header-offset-top bottom-0 nav-width bg-card/92 backdrop-blur-lg border-r border-border/70 z-40 hidden md:flex flex-col">
      <div className="px-3 py-4 border-b border-border/60">
        {customerView ? (
          <div className="flex flex-col items-center text-center gap-2">
            <BrandLogo compact className="justify-center" imageClassName="h-[47px]" />
            <div className="text-sm font-semibold">{currentUser?.username || 'Kunde'}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <BrandLogo compact />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group, idx) => (
          <div key={group.label} className={idx > 0 ? 'mt-3 pt-3 border-t border-border/50' : ''}>
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => renderNavItem(item))}
            </div>
          </div>
        ))}
      </div>

      {!customerView ? (
        <div className="px-2 py-2 border-t border-border/60">
          <Link
            href="/settings"
            className={`relative w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-smooth ${
              pathname === '/settings'
                ? 'bg-primary/14 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-2/80'
            }`}
          >
            {pathname === '/settings' && <span className="absolute left-0 w-0.5 h-5 bg-primary rounded-r" />}
            <Settings size={16} />
            <span>Einstellungen</span>
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
