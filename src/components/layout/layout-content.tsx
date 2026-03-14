'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavRail } from './nav-rail';
import { HeaderBar } from './header-bar';
import { MobileNav } from './mobile-nav';
import { AppShell } from './app-shell';
import { CommandPalette } from '../command-palette';
import { PwaInstallPrompt } from '../pwa/pwa-install-prompt';
import type { AppAudience } from '@/lib/app-audience';

const AUTH_PATHS = ['/login', '/register'];
const CUSTOMER_ALLOWED_PATHS = ['/', '/agents', '/usage-token', '/settings', '/hilfe', '/nutzungshinweise', '/datenschutz'];

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
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<ShellUser | null>(null);
  const [appAudience, setAppAudience] = useState<AppAudience>('admin');

  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isAuthPath) return;
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          router.replace(`/login?from=${encodeURIComponent(pathname)}`);
          return;
        }
        const payload = await res.json();
        const nextUser = (payload?.user || null) as ShellUser | null;
        const nextAudience = (payload?.app_audience || 'admin') as AppAudience;
        setCurrentUser(nextUser);
        setAppAudience(nextAudience);
        if (nextAudience === 'customer' && !CUSTOMER_ALLOWED_PATHS.includes(pathname)) {
          router.replace('/');
          return;
        }
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthPath, pathname, router]);

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
