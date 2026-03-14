'use client';

import { Download, Share2, Smartphone, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  interface Navigator {
    standalone?: boolean;
  }
}

const DISMISS_KEY = 'kitzchat-pwa-dismissed';

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    const handleInstalled = () => {
      setStandalone(true);
      setDeferredPrompt(null);
      setIosHelpOpen(false);
      window.localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }, []);

  const canShow = !standalone && !dismissed && (Boolean(deferredPrompt) || isIos);

  async function installApp() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => undefined);
      setDeferredPrompt(null);
      return;
    }
    setIosHelpOpen((value) => !value);
  }

  function closePrompt() {
    setDismissed(true);
    setIosHelpOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
  }

  if (!canShow) return null;

  return (
    <div className="md:hidden fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-[55] animate-in">
      <div className="glass-strong rounded-3xl px-4 py-3 shadow-xl shadow-black/10">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Smartphone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">KitzChat als App speichern</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {deferredPrompt
                    ? 'Zum Homescreen hinzufuegen und direkt im App-Modus starten.'
                    : 'Auf dem iPhone ueber Safari teilen und zum Home-Bildschirm hinzufuegen.'}
                </p>
              </div>
              <button type="button" onClick={closePrompt} className="rounded-full p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={installApp} className="btn btn-primary flex-1">
                {deferredPrompt ? <Download size={15} /> : <Share2 size={15} />}
                {deferredPrompt ? 'App installieren' : 'Homescreen oeffnen'}
              </button>
            </div>

            {iosHelpOpen ? (
              <div className="mt-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3 text-xs text-muted-foreground">
                <ol className="ios-install-list space-y-1.5">
                  <li>KitzChat in Safari geoeffnet lassen.</li>
                  <li>Unten auf Teilen tippen.</li>
                  <li>Dann "Zum Home-Bildschirm" waehlen.</li>
                </ol>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}