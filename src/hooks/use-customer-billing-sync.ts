'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type SyncOptions = {
  enabled?: boolean;
  onConfirmed?: () => Promise<void> | void;
};

export function useCustomerBillingSync({ enabled = true, onConfirmed }: SyncOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectTarget = (() => {
    const raw = searchParams.get('return_path');
    return raw && raw.startsWith('/') ? raw : pathname;
  })();

  const clearParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    params.delete('session_id');
    params.delete('mode');
    params.delete('checkout_type');
    params.delete('amount_cents');
    params.delete('credit_amount_cents');
    params.delete('discount_percent');
    params.delete('credits');
    params.delete('return_path');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!enabled) return;

    const payment = searchParams.get('payment');
    const sessionId = searchParams.get('session_id');
    const mode = searchParams.get('mode');
    const checkoutType = searchParams.get('checkout_type');
    const amountCents = Number(searchParams.get('amount_cents') || 0);
    const creditAmountCents = Number(searchParams.get('credit_amount_cents') || 0);
    const discountPercent = Number(searchParams.get('discount_percent') || 0);

    if (payment !== 'success') return;

    let cancelled = false;

    (async () => {
      try {
        await fetch('/api/billing/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            mode,
            checkout_type: checkoutType,
            amount_cents: amountCents,
            credit_amount_cents: creditAmountCents,
            discount_percent: discountPercent,
          }),
        });

        if (!cancelled) {
          await onConfirmed?.();
          const paymentPayload = JSON.stringify({ at: Date.now(), redirectTo: redirectTarget });
          try {
            localStorage.setItem('kitzchat-payment-complete', paymentPayload);
          } catch {}
          try {
            window.dispatchEvent(new CustomEvent('kitzchat-payment-complete', { detail: { redirectTo: redirectTarget } }));
          } catch {}

          if (window.opener && window.opener !== window) {
            try {
              window.opener.postMessage({ type: 'kitzchat-payment-complete', redirectTo: redirectTarget }, window.location.origin);
            } catch {}
            window.close();
            return;
          }

          if (redirectTarget !== pathname) {
            router.replace(redirectTarget);
            return;
          }
        }
      } finally {
        if (!cancelled) {
          clearParams();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearParams, enabled, onConfirmed, pathname, redirectTarget, router, searchParams]);
}
