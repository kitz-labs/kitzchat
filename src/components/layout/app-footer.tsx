'use client';

export function AppFooter({ variant = 'default' }: { variant?: 'default' | 'auth' }) {
  const baseClass = variant === 'auth'
    ? 'border-white/10 text-white/70'
    : 'border-border/50 text-muted-foreground';
  const linkClass = variant === 'auth'
    ? 'hover:text-white transition-colors'
    : 'hover:text-foreground transition-colors';

  return (
    <footer className={`mt-auto border-t py-2 text-xs ${baseClass} ${variant === 'auth' ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]' : ''} sticky bottom-0 z-40 bg-card/95 backdrop-blur-lg`}>
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-left truncate">
            <a href="https://www.aikitz.at" target="_blank" rel="noreferrer" className={linkClass}>
              www.aikitz.at
            </a>
          </div>

          <div className="text-center truncate">
            developed with ❤️ AI Kitz Art &amp; Labs
          </div>

          <div className="flex justify-end gap-x-4 gap-y-1 text-right">
            <a href="/nutzungshinweise" className={linkClass}>Nutzungshinweise</a>
            <a href="/datenschutz" className={linkClass}>Datenschutz</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
