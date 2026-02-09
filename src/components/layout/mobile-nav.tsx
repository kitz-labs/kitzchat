'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gauge, PenLine, MessageCircle, Mail,
  FlaskConical, Search, BarChart3, List,
  MoreHorizontal, Bot, Contact, Zap, Settings,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';

interface NavCounts {
  content: number;
  outreach: number;
  signals_today: number;
  new_leads: number;
  total_pending: number;
}

const PRIMARY_ITEMS = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/outreach', label: 'Outreach', icon: Mail, countKey: 'outreach' as const },
  { href: '/crm', label: 'CRM', icon: Contact, countKey: 'new_leads' as const },
];

const MORE_ITEMS = [
  { href: '/content', label: 'Content', icon: PenLine, countKey: 'content' as const },
  { href: '/engagement', label: 'Engagement', icon: MessageCircle },
  { href: '/automations', label: 'Automations', icon: Zap, countKey: 'total_pending' as const },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/kpis', label: 'KPIs', icon: BarChart3 },
  { href: '/activity', label: 'Activity', icon: List },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: counts } = useSmartPoll<NavCounts>(
    () => fetch('/api/counts').then(r => r.json()),
    { interval: 30_000 },
  );

  // Close menu on outside tap
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // Close menu on navigation
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const moreActive = MORE_ITEMS.some(item => isActive(item.href));

  // Count of pending items in "More" menu items
  const moreBadge = counts
    ? (counts.content + counts.total_pending)
    : 0;

  return (
    <nav className="mobile-nav fixed bottom-0 left-0 right-0 glass-strong z-50 border-t border-border">
      <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY_ITEMS.map(({ href, label, icon: Icon, countKey }) => {
          const active = isActive(href);
          const count = countKey && counts ? counts[countKey] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors relative ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon size={20} />
              <span>{label}</span>
              {count > 0 && (
                <span className="absolute top-0 right-1 min-w-[14px] h-3.5 px-0.5 text-[8px] font-bold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}

        {/* More button */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center gap-0.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors relative ${
              moreOpen || moreActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
            {moreBadge > 0 && (
              <span className="absolute top-0 right-1 min-w-[14px] h-3.5 px-0.5 text-[8px] font-bold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                {moreBadge > 99 ? '99+' : moreBadge}
              </span>
            )}
          </button>

          {/* More menu — expands upward */}
          {moreOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 py-1 rounded-xl glass-strong border border-border shadow-lg animate-in">
              {MORE_ITEMS.map(({ href, label, icon: Icon, countKey }) => {
                const active = isActive(href);
                const count = countKey && counts ? counts[countKey] : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      active
                        ? 'text-primary bg-primary/10'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{label}</span>
                    {count > 0 && (
                      <span className="min-w-[18px] h-4 px-1 text-[9px] font-bold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
