'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppAudience } from '@/lib/app-audience';

type Options = {
  redirectCustomerTo?: string;
  redirectAdminTo?: string;
  redirectOnErrorTo?: string;
};

type MePayload = {
  app_audience?: AppAudience;
};

export function useAudienceGuard(options: Options = {}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [appAudience, setAppAudience] = useState<AppAudience | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const payload = (await fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.json())) as MePayload;
        if (!alive) return;

        const nextAudience = payload.app_audience === 'customer' ? 'customer' : 'admin';
        setAppAudience(nextAudience);

        if (nextAudience === 'customer' && options.redirectCustomerTo) {
          router.replace(options.redirectCustomerTo);
          return;
        }

        if (nextAudience === 'admin' && options.redirectAdminTo) {
          router.replace(options.redirectAdminTo);
          return;
        }

        setReady(true);
      } catch {
        if (!alive) return;
        if (options.redirectOnErrorTo) {
          router.replace(options.redirectOnErrorTo);
          return;
        }
        setAppAudience(null);
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [options.redirectAdminTo, options.redirectCustomerTo, options.redirectOnErrorTo, router]);

  return { ready, appAudience };
}