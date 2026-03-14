'use client';

import {
  Activity, Search, Sun, Moon, Radio, PenLine, Mail, Users, LogOut,
  Bell, Eye, EyeOff, Check, CheckCheck, ShieldAlert,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/store';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { timeAgo } from '@/lib/utils';
import type { Notification } from '@/types';
import type { AppAudience } from '@/lib/app-audience';
import { BrandLogo } from './brand-logo';

interface HeaderStats {
  posts_today: number;
  emails_sent: number;
  pipeline_count: number;
}

interface HeaderUser {
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  wallet_balance_cents?: number;
}

export function HeaderBar({ currentUser, appAudience }: { currentUser: HeaderUser | null; appAudience: AppAudience }) {
  const { feedOpen, toggleFeed, realOnly, toggleRealOnly } = useDashboard();
  const customerView = appAudience === 'customer';

  // Lightweight poll for header stats
  const { data: stats } = useSmartPoll<HeaderStats>(
    () => fetch(`/api/overview${realOnly ? '?real=true' : ''}`).then(r => r.json()).then(d => d.stats),
    { interval: 60_000, key: realOnly, enabled: !customerView },
  );

  if (customerView) {
    return (
      <header className="fixed top-0 left-0 right-0 header-height bg-card/90 backdrop-blur-sm border-b border-border/70 flex items-center justify-between px-3 sm:px-4 z-50">
        <div className="md:hidden">
          <BrandLogo compact />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <CustomerHeaderMeta walletBalanceCents={currentUser?.wallet_balance_cents ?? 0} />
          <CustomerSupportInboxButton />
          <ThemeToggle />
          <LogoutButton label="Abmelden" compact={false} />
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 header-height bg-card/90 backdrop-blur-sm border-b border-border/70 flex items-center justify-between px-3 sm:px-4 z-50">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="md:hidden">
          <BrandLogo compact />
        </div>

        {/* Quick stats — hidden on small screens */}
        {stats && (
          <div className="hidden lg:flex items-center gap-2.5 md:ml-0 lg:pl-0 lg:border-l-0">
            <QuickStat icon={PenLine} value={stats.posts_today} label="posts" />
            <QuickStat icon={Mail} value={stats.emails_sent} label="sent" />
            <QuickStat icon={Users} value={stats.pipeline_count} label="pipeline" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <SeedToggle active={realOnly} onToggle={toggleRealOnly} />
        </div>
        <SearchTrigger />
        <ComplianceBell />
        <NotificationBell />
        <ThemeToggle />
        <div className="hidden sm:block">
          <FeedToggle open={feedOpen} onToggle={toggleFeed} />
        </div>
        <SyncStatus />
        <LogoutButton />
      </div>
    </header>
  );
}

function ComplianceBell() {
  const { data } = useSmartPoll<{ summary?: { unread_count?: number; danger_count?: number; violation_count?: number } }>(
    () => fetch('/api/admin/incidents?limit=1', { cache: 'no-store' }).then((response) => response.json()),
    { interval: 20_000 },
  );

  const unread = data?.summary?.unread_count ?? 0;
  const danger = data?.summary?.danger_count ?? 0;

  return (
    <a
      href="/compliance"
      className={`relative flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors ${unread > 0 ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
      title="Verstossprotokoll"
    >
      <ShieldAlert size={15} />
      <span className="hidden sm:inline">Verstoesse</span>
      <span className="font-mono">{unread}</span>
      {danger > 0 ? <span className="hidden lg:inline rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">Gefahr {danger}</span> : null}
    </a>
  );
}

function CustomerHeaderMeta({ walletBalanceCents }: { walletBalanceCents: number }) {
  const [time, setTime] = useState('');

  const { data: health } = useSmartPoll<{ status?: string }>(
    () => fetch('/api/health', { cache: 'no-store' }).then((response) => response.json()),
    { interval: 30_000 },
  );

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="rounded-full border border-border/60 px-2.5 py-1">Uhrzeit {time}</span>
      <span className="rounded-full border border-border/60 px-2.5 py-1">Guthaben €{(walletBalanceCents / 100).toFixed(2)}</span>
      <span className="rounded-full border border-border/60 px-2.5 py-1">Systemstatus {health?.status === 'ok' ? 'OK' : 'Pruefung'}</span>
    </div>
  );
}

function CustomerSupportInboxButton() {
  const { data } = useSmartPoll<{ unread_count?: number }>(
    () => fetch('/api/customer/support/summary', { cache: 'no-store' }).then((response) => response.json()),
    { interval: 20_000 },
  );

  const unreadCount = data?.unread_count ?? 0;

  return (
    <a
      href="/settings#support"
      className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      title="Support-Antworten"
    >
      <Mail size={15} />
      {unreadCount > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full count-badge flex items-center justify-center px-1 text-[9px] font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </a>
  );
}

function QuickStat({ icon: Icon, value, label }: { icon: typeof PenLine; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon size={11} />
      <span className="font-mono font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function SeedToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      className={`h-7 flex items-center gap-1.5 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
        active
          ? 'bg-success/15 text-success border border-success/30'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-border/30'
      }`}
      onClick={onToggle}
      title={active ? 'Showing real data only' : 'Showing all data (including seeded)'}
    >
      {active ? <Eye size={13} /> : <EyeOff size={13} />}
      <span className="hidden sm:inline">{active ? 'Real' : 'All'}</span>
    </button>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const realOnly = useDashboard(s => s.realOnly);

  const { data: notifications, refetch } = useSmartPoll<Notification[]>(
    () => fetch(`/api/notifications?limit=20${realOnly ? '&real=true' : ''}`).then(r => r.json()),
    { interval: 30_000, key: realOnly },
  );

  const unreadCount = notifications?.filter(n => !n.read).length ?? 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function markRead(id: number) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    refetch();
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    });
    refetch();
  }

  const SEVERITY_COLORS = {
    info: 'text-primary',
    warning: 'text-warning',
    error: 'text-destructive',
  };

  return (
    <div className="relative" ref={ref}>
      <button
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors relative ${
        open ? 'bg-primary/15 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      }`}
        onClick={() => setOpen(!open)}
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold rounded-full count-badge flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 card border shadow-lg max-h-96 overflow-hidden flex flex-col animate-slide-in z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {(!notifications || notifications.length === 0) ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border/20 hover:bg-muted/30 transition-colors ${
                    !n.read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 ${SEVERITY_COLORS[n.severity] || 'text-muted-foreground'}`}>
                      <Bell size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {n.title && (
                        <div className="text-xs font-medium truncate">{n.title}</div>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        {!n.read && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                          >
                            <Check size={10} /> Read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchTrigger() {
  return (
    <button
      className="hidden md:flex items-center gap-2 h-7 px-3 rounded-md bg-muted/55 hover:bg-muted border border-border/30 text-xs text-muted-foreground transition-colors"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
    >
      <Search size={13} />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline text-[10px] bg-muted px-1 py-0.5 rounded ml-1">⌘K</kbd>
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const currentTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <button
      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(currentTheme === 'dark' ? 'light' : 'dark')}
      title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {currentTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function FeedToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        open
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      }`}
      onClick={onToggle}
      title="Toggle live feed"
    >
      <Radio size={16} />
    </button>
  );
}

function SyncStatus() {
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <div className="w-2 h-2 rounded-full bg-success pulse-dot" />
      <Activity size={12} />
      <span className="font-mono">{lastSync}</span>
    </div>
  );
}

function LogoutButton({ label, compact = true }: { label?: string; compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      className={`${compact ? 'w-7 h-7' : 'h-9 px-3'} flex items-center justify-center gap-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50`}
      onClick={handleLogout}
      disabled={loading}
      title="Sign out"
    >
      <LogOut size={15} />
      {!compact && label ? <span className="text-sm">{label}</span> : null}
    </button>
  );
}
