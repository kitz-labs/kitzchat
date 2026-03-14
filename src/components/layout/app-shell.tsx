'use client';

import { useEffect } from 'react';
import { useDashboard } from '@/store';
import { LiveFeed } from '@/components/live-feed';

export function AppShell({ children, customerView = false }: { children: React.ReactNode; customerView?: boolean }) {
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
      <main className={`main-content surface-0 flex-1 nav-offset-margin-left header-offset-margin-top p-3 sm:p-5 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] sm:pb-5 overflow-auto transition-[margin] duration-300 ${
        !customerView && feedOpen ? 'lg:mr-80' : ''
      }`}>
        {children}
        {customerView ? (
          <footer className="mt-8 border-t border-border/50 pt-2 pb-1 text-center text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <a href="/nutzungshinweise" className="hover:text-foreground transition-colors">Nutzungshinweise</a>
              <a href="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</a>
              <a href="https://www.aikitz.at" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">www.aikitz.at</a>
            </div>
          </footer>
        ) : null}
      </main>
      {!customerView ? <LiveFeed open={feedOpen} onClose={toggleFeed} /> : null}
    </>
  );
}
