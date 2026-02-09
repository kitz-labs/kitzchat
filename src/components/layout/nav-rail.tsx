'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gauge, PenLine, MessageCircle, Mail,
  FlaskConical, Search, BarChart3, List,
  Bot, Contact, Zap, Settings,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';

interface NavCounts {
  content: number;
  outreach: number;
  signals_today: number;
  new_leads: number;
  total_pending: number;
}

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/content', label: 'Content', icon: PenLine, countKey: 'content' as const },
  { href: '/engagement', label: 'Engage', icon: MessageCircle },
  { href: '/outreach', label: 'Outreach', icon: Mail, countKey: 'outreach' as const },
  { href: '/crm', label: 'CRM', icon: Contact, countKey: 'new_leads' as const },
  { href: '/automations', label: 'Automate', icon: Zap, countKey: 'total_pending' as const },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical },
  { href: '/research', label: 'Research', icon: Search, countKey: 'signals_today' as const },
  { href: '/kpis', label: 'KPIs', icon: BarChart3 },
  { href: '/activity', label: 'Activity', icon: List },
];

export function NavRail() {
  const pathname = usePathname();

  const { data: counts } = useSmartPoll<NavCounts>(
    () => fetch('/api/counts').then(r => r.json()),
    { interval: 30_000 },
  );

  return (
    <nav className="nav-rail fixed left-0 top-[var(--header-height)] bottom-0 w-[var(--nav-width)] glass-strong flex flex-col items-center py-4 gap-1 z-40">
      {NAV_ITEMS.map(({ href, label, icon: Icon, countKey }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        const count = countKey && counts ? counts[countKey] : 0;
        return (
          <Link
            key={href}
            href={href}
            className={`nav-item w-14 ${active ? 'active' : ''} relative`}
          >
            <Icon size={20} />
            <span>{label}</span>
            {count > 0 && (
              <span className={`absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 text-[9px] font-bold rounded-full flex items-center justify-center ${
                countKey === 'signals_today'
                  ? 'bg-info/20 text-info'
                  : 'bg-destructive text-destructive-foreground'
              }`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}

      {/* Settings at bottom */}
      <div className="mt-auto">
        <Link
          href="/settings"
          className={`nav-item w-14 ${pathname === '/settings' ? 'active' : ''}`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </Link>
      </div>
    </nav>
  );
}
