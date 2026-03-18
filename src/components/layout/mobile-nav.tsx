'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gauge, Bot, Mail, Contact, MoreHorizontal,
  PenLine, MessageCircle, Search,
  LineChart, BrainCircuit, List, Settings,
  FolderOpen, ShieldAlert, LifeBuoy, Download, CreditCard, Database, Sparkles, Wallet,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useDashboard } from '@/store';
import type { AppAudience } from '@/lib/app-audience';

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
  priority?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Top-Level',
    items: [
      { href: '/', label: 'Uebersicht', icon: Gauge, priority: true },
      { href: '/customers', label: 'Kunden', icon: Contact, priority: true },
      { href: '/billing', label: 'Billing', icon: CreditCard, priority: true },
      { href: '/support', label: 'Support', icon: LifeBuoy, priority: true },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { href: '/stripe', label: 'Stripe', icon: CreditCard },
      { href: '/db/billing', label: 'Billing DB', icon: Database },
    ],
  },
  {
    label: 'AI & Systeme',
    items: [
      { href: '/openai', label: 'OpenAI', icon: BrainCircuit },
      { href: '/agents/catalog', label: 'Agenten', icon: Bot },
      { href: '/agents/squads', label: 'Squads', icon: Bot },
      { href: '/agents/workspace', label: 'Workspace', icon: FolderOpen },
      { href: '/memory', label: 'Memory', icon: BrainCircuit },
      { href: '/telegram', label: 'Telegram', icon: Mail },
      { href: '/maestro', label: 'MAESTRO', icon: Sparkles },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/support/db', label: 'Support DB', icon: Database },
      { href: '/compliance', label: 'Verstoesse', icon: ShieldAlert },
      { href: '/engagement', label: 'Engagement', icon: MessageCircle },
      { href: '/activity', label: 'Activity', icon: List },
      { href: '/website', label: 'www.aikitz.at', icon: PenLine },
      { href: '/deploy', label: 'Deploy', icon: Sparkles },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: LineChart },
      { href: '/settings', label: 'Einstellungen', icon: Settings },
    ],
  },
];

const CUSTOMER_PRIORITY_ITEMS: NavItem[] = [
  { href: '/', label: 'Chat', icon: MessageCircle, priority: true },
  { href: '/agents', label: 'Agenten', icon: Bot, priority: true },
  { href: '/usage-token', label: 'Guthaben', icon: CreditCard, priority: true },
  { href: '/support-chat', label: 'Support', icon: LifeBuoy, priority: true },
];

const CUSTOMER_SHEET_ITEMS: NavItem[] = [
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
  { href: '/hilfe', label: 'Hilfe', icon: Search },
];

export function MobileNav({
  currentUser,
  appAudience,
}: {
  currentUser: { account_type?: 'staff' | 'customer'; payment_status?: 'not_required' | 'pending' | 'paid'; wallet_balance_cents?: number } | null;
  appAudience: AppAudience;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const realOnly = useDashboard(s => s.realOnly);
  const customerView = appAudience === 'customer';
  const customerHasMore = CUSTOMER_SHEET_ITEMS.length > 0;

  const { data: counts } = useSmartPoll<NavCounts>(
    () => fetch(`/api/counts${realOnly ? '?real=true' : ''}`).then(r => r.json()),
    { interval: 30_000, key: realOnly, enabled: !customerView },
  );

  const priorityItems = useMemo(
    () => customerView ? CUSTOMER_PRIORITY_ITEMS : NAV_GROUPS.flatMap(g => g.items).filter(i => i.priority),
    [customerView],
  );
  const nonPriorityItems = useMemo(
    () => customerView ? [] : NAV_GROUPS.flatMap(g => g.items).filter(i => !i.priority),
    [customerView],
  );
  const sheetGroups = useMemo(
    () => customerView ? [] : NAV_GROUPS
      .map(group => ({ ...group, items: group.items.filter(i => !i.priority) }))
      .filter(group => group.items.length > 0),
    [customerView],
  );
  const moreActive = nonPriorityItems.some(i => isActive(pathname, i.href));
  const moreBadge = counts ? (counts.content + counts.total_pending) : 0;
  const slotCount = customerView ? (priorityItems.length + (customerHasMore ? 1 : 0)) : priorityItems.length + 1;
  const quickActionHref = customerView ? '/usage-token#topup' : '/customers#new-customer';
  const quickActionLabel = customerView ? 'Top-up' : 'Kunde+';
  const quickActionIcon = customerView ? Wallet : Sparkles;
  const customerWalletCents = Math.max(0, Math.round(currentUser?.wallet_balance_cents ?? 0));
  const customerStatusLabel = currentUser?.payment_status === 'paid'
    ? 'Konto aktiv'
    : customerWalletCents > 0
      ? 'Wallet verfuegbar'
      : 'Setup offen';
  const adminStatusLabel = realOnly ? 'Live-Daten' : 'Alle Daten';
  const QuickActionIcon = quickActionIcon;

  useEffect(() => {
    if (!sheetOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setSheetOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [sheetOpen]);

  return (
    <>
      <nav className="mobile-nav md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg z-50 border-t border-border/70 safe-area-bottom">
        <div
          className="grid h-[72px] w-full gap-1.5 px-2 pb-[env(safe-area-inset-bottom)]"
          style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
        >
          {priorityItems.map((item) => {
            const active = isActive(pathname, item.href);
            const count = item.countKey && counts ? counts[item.countKey] : 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-item flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 transition-smooth relative ${
                  active ? 'mobile-nav-item-active text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon size={17} />
                <span className="max-w-full truncate text-[10px] leading-none">{item.label}</span>
                {count > 0 && (
                  <span className="absolute top-1 right-2 min-w-[14px] h-3.5 px-0.5 text-[8px] font-bold rounded-full count-badge flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            );
          })}

          {!customerView ? (
            <button
              onClick={() => setSheetOpen(true)}
              className={`mobile-nav-item flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 transition-smooth relative ${
                moreActive || sheetOpen ? 'mobile-nav-item-active text-primary' : 'text-muted-foreground'
              }`}
            >
              <MoreHorizontal size={17} />
              <span className="max-w-full truncate text-[10px] leading-none">Mehr</span>
              {moreBadge > 0 && (
                <span className="absolute top-1 right-2 min-w-[14px] h-3.5 px-0.5 text-[8px] font-bold rounded-full count-badge flex items-center justify-center">
                  {moreBadge > 99 ? '99+' : moreBadge}
                </span>
              )}
            </button>
          ) : customerHasMore ? (
            <button
              onClick={() => setSheetOpen(true)}
              className={`mobile-nav-item flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 transition-smooth relative ${
                sheetOpen ? 'mobile-nav-item-active text-primary' : 'text-muted-foreground'
              }`}
            >
              <MoreHorizontal size={17} />
              <span className="max-w-full truncate text-[10px] leading-none">Mehr</span>
            </button>
          ) : null}
        </div>
      </nav>

      <Link
        href={quickActionHref}
        className="mobile-nav-quick-action md:hidden fixed bottom-[92px] right-5 z-[55] flex h-14 min-w-14 items-center justify-center rounded-full border border-primary/25 bg-primary text-primary-foreground shadow-[0_18px_32px_rgba(18,104,251,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
        aria-label={quickActionLabel}
      >
        <QuickActionIcon size={20} />
      </Link>

      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" />
          <div
            ref={sheetRef}
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] max-h-[76vh] overflow-y-auto safe-area-bottom border-t border-border/70 animate-slide-in"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>

            <div className="px-4 pb-6">
              <div className="mb-4 rounded-[1.4rem] border border-border/60 bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {customerView ? 'Kundenbereich' : 'Admin Mission Control'}
                    </div>
                    <div className="mt-1 text-base font-semibold text-foreground">
                      {customerView ? 'Schnellzugriff und Verbindungen' : 'Navigation und Ops-Shortcuts'}
                    </div>
                  </div>
                  <span className={`status-pill ${customerView ? (customerWalletCents > 0 || currentUser?.payment_status === 'paid' ? 'status-ok' : 'status-warn') : 'status-info'}`}>
                    {customerView ? customerStatusLabel : adminStatusLabel}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  {customerView ? (
                    <>
                      <span>Wallet €{(customerWalletCents / 100).toFixed(2)}</span>
                      <Link href="/usage-token" onClick={() => setSheetOpen(false)} className="font-medium text-primary">
                        Guthaben oeffnen
                      </Link>
                    </>
                  ) : (
                    <>
                      <span>{counts ? `${counts.total_pending} offen · ${counts.signals_today} Signals heute` : 'Dashboard-Status wird geladen'}</span>
                      <Link href="/customers" onClick={() => setSheetOpen(false)} className="font-medium text-primary">
                        Kunden prüfen
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {customerView ? (
                <div>
                  <div className="px-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                    Mehr
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CUSTOMER_SHEET_ITEMS.map((item) => {
                      const active = isActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSheetOpen(false)}
                          className={`flex items-center gap-2.5 px-3 min-h-[56px] rounded-2xl transition-smooth relative ${
                            active
                              ? 'bg-primary/14 text-primary'
                              : 'text-foreground hover:bg-surface-2/80'
                          }`}
                        >
                          <Icon size={16} />
                          <span className="text-xs font-medium truncate flex-1">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                sheetGroups.map((group, idx) => (
                  <div key={group.label} className={idx > 0 ? 'mt-4 pt-3 border-t border-border/60' : ''}>
                    <div className="px-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                      {group.label}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map((item) => {
                          const active = isActive(pathname, item.href);
                          const count = item.countKey && counts ? counts[item.countKey] : 0;
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setSheetOpen(false)}
                              className={`flex items-center gap-2.5 px-3 min-h-[56px] rounded-2xl transition-smooth relative ${
                                active
                                  ? 'bg-primary/14 text-primary'
                                  : 'text-foreground hover:bg-surface-2/80'
                              }`}
                            >
                              <Icon size={16} />
                              <span className="text-xs font-medium truncate flex-1">{item.label}</span>
                              {count > 0 && (
                                <span className={`min-w-[16px] h-4 px-1 text-[8px] font-bold rounded-full flex items-center justify-center ${
                                  item.countKey === 'signals_today' ? 'count-badge-info' : 'count-badge'
                                }`}>
                                  {count > 99 ? '99+' : count}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
