'use client';

import { useState } from 'react';

type PaymentCTAProps = {
  label?: string;
  checkoutType?: 'activation' | 'topup';
  amountCents?: number;
  returnPath?: string;
  className?: string;
};

export function PaymentCTA({
  label = 'Alle Agenten freischalten',
  checkoutType = 'activation',
  amountCents,
  returnPath = '/settings',
  className = '',
}: PaymentCTAProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    const pendingWindow = window.open('', '_blank');
    if (pendingWindow) {
      pendingWindow.document.write('<title>Stripe Checkout</title><p style="font-family: sans-serif; padding: 24px;">Stripe Checkout wird geladen...</p>');
    }
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutType, amountCents, returnPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Checkout konnte nicht gestartet werden'));
      }
      if (typeof data?.redirect_url === 'string' && data.redirect_url) {
        if (pendingWindow) {
          pendingWindow.location.href = data.redirect_url;
        } else {
          window.location.href = data.redirect_url;
        }
        return;
      }
      pendingWindow?.close();
      window.location.reload();
    } catch (checkoutError) {
      pendingWindow?.close();
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout konnte nicht gestartet werden');
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className={`btn btn-primary text-sm disabled:opacity-50 ${className}`.trim()}
      >
        {loading ? 'Checkout wird gestartet...' : label}
      </button>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}