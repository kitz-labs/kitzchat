'use client';

import { useEffect } from 'react';
import { useDashboard } from '@/store';
import { LiveFeed } from '@/components/live-feed';
import { AppFooter } from '@/components/layout/app-footer';

export function AppShell({ children, customerView = false, navCollapsed = false }: { children: React.ReactNode; customerView?: boolean; navCollapsed?: boolean }) {
  const { feedOpen, toggleFeed } = useDashboard();

  // Cmd+. to toggle feed
  useEffect(() => {
    if (customerView) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        toggleFeed();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [customerView, toggleFeed]);

  return (
    <>
      <main className={`main-content surface-0 flex-1 nav-offset-margin-left header-offset-margin-top p-3 sm:p-5 transition-[margin] duration-300 ${
        customerView
          ? 'customer-shell flex h-[calc(100vh-4rem)] min-h-[calc(100vh-4rem)] flex-col overflow-auto pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))]'
          : 'overflow-auto pb-[calc(8rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]'
      } ${!customerView && navCollapsed ? 'nav-offset-margin-left-collapsed' : ''} ${!customerView && feedOpen ? 'lg:mr-80' : ''}`}>
        <div className={customerView ? 'flex-1 min-h-0' : ''}>{children}</div>
      </main>
      <AppFooter variant={customerView ? 'default' : 'default'} />
      {!customerView ? <LiveFeed open={feedOpen} onClose={toggleFeed} /> : null}
    </>
  );
}
