'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavRail } from './nav-rail';
import { HeaderBar } from './header-bar';
import { MobileNav } from './mobile-nav';
import { AppShell } from './app-shell';
import { CommandPalette } from '../command-palette';
import { PwaInstallPrompt } from '../pwa/pwa-install-prompt';
import type { AppAudience } from '@/lib/app-audience';
import { useDashboard } from '@/store';

const AUTH_PATHS = ['/login', '/register'];
const CUSTOMER_ALLOWED_PATHS = ['/', '/agents', '/usage-token', '/settings', '/hilfe', '/downloads', '/support-chat', '/nutzungshinweise', '/datenschutz'];
const LIVE_FEED_AUTOSTART_KEY = 'nexora.live_feed.autostart.v1';

type ShellUser = {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  account_type?: 'staff' | 'customer';
  payment_status?: 'not_required' | 'pending' | 'paid';
  has_agent_access?: boolean;
  wallet_balance_cents?: number;
};

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const feedOpen = useDashboard(s => s.feedOpen);
  const setFeedOpen = useDashboard(s => s.setFeedOpen);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<ShellUser | null>(null);
  const [appAudience, setAppAudience] = useState<AppAudience>('admin');

  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p));

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      return;
    }
    const payload = await res.json().catch(() => ({}));
    const nextUser = (payload as any)?.user || null;
    const nextAudience = ((payload as any)?.app_audience || 'admin') as AppAudience;
    setCurrentUser(nextUser);
    setAppAudience(nextAudience);
    if (nextAudience === 'customer' && !CUSTOMER_ALLOWED_PATHS.includes(pathname)) {
      router.replace('/');
      return;
    }
    setAuthChecked(true);
  }, [pathname, router]);

  useEffect(() => {
    if (isAuthPath) return;
    let cancelled = false;
    refreshMe()
      .catch(() => {
        if (!cancelled) router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthPath, pathname, router, refreshMe]);

  useEffect(() => {
    if (isAuthPath) return;
    function handleStorage(event: StorageEvent) {
      if (event.key !== 'kitzchat-payment-complete') return;
      refreshMe().catch(() => {});
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isAuthPath, refreshMe]);

  useEffect(() => {
    if (isAuthPath) return;
    const handler = () => refreshMe().catch(() => {});
    window.addEventListener('kitzchat-payment-complete', handler as any);
    return () => window.removeEventListener('kitzchat-payment-complete', handler as any);
  }, [isAuthPath, refreshMe]);

  useEffect(() => {
    if (isAuthPath) return;
    if (appAudience === 'customer') return;
    if (currentUser?.role !== 'admin') return;
    if (feedOpen) return;
    try {
      const prior = window.sessionStorage.getItem(LIVE_FEED_AUTOSTART_KEY);
      if (prior) return;
      setFeedOpen(true);
      window.sessionStorage.setItem(LIVE_FEED_AUTOSTART_KEY, '1');
    } catch {
      setFeedOpen(true);
    }
  }, [appAudience, currentUser?.role, feedOpen, isAuthPath, setFeedOpen]);

  if (isAuthPath) {
    return <>{children}</>;
  }

  if (!authChecked) {
    return <div className="min-h-screen" />;
  }

  const customerView = appAudience === 'customer';

  return (
    <>
      <HeaderBar currentUser={currentUser} appAudience={appAudience} />
      <div className="flex header-offset-min-height">
        <NavRail currentUser={currentUser} appAudience={appAudience} />
        <AppShell customerView={customerView}>{children}</AppShell>
      </div>
      <PwaInstallPrompt />
      <MobileNav currentUser={currentUser} appAudience={appAudience} />
      {!customerView ? <CommandPalette /> : null}
    </>
  );
}
