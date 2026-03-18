'use client';

import type { CheckoutType } from '@/lib/billing';
import { CHECKOUT_PRESET_OPTIONS, MIN_CUSTOM_TOPUP_CENTS } from '@/lib/checkout-options';

type CheckoutPresetOption = {
  amountCents: number;
  credits?: number;
  marketingLabel?: string | null;
};

type CheckoutAmountPickerProps = {
  checkoutType: CheckoutType;
  customAmount: string;
  onCustomAmountChange: (value: string) => void;
  onCheckout: (amountCents: number, key: number | 'custom') => void;
  loadingKey: number | 'custom' | null;
  discountPercent?: number;
  error?: string | null;
  presetOptions?: CheckoutPresetOption[];
};

function parseAmountInput(value: string): number {
  const normalized = Number(value.replace(',', '.'));
  if (!Number.isFinite(normalized)) return MIN_CUSTOM_TOPUP_CENTS;
  return Math.max(MIN_CUSTOM_TOPUP_CENTS, Math.round(normalized * 100));
}

function formatEuro(amountCents: number): string {
  return `€${(amountCents / 100).toFixed(2)}`;
}

export function CheckoutAmountPicker({
  checkoutType,
  customAmount,
  onCustomAmountChange,
  onCheckout,
  loadingKey,
  discountPercent = 0,
  error,
  presetOptions,
}: CheckoutAmountPickerProps) {
  const customAmountCents = parseAmountInput(customAmount);
  const discountedCustomAmountCents = Math.max(MIN_CUSTOM_TOPUP_CENTS, Math.round(customAmountCents * (100 - discountPercent) / 100));
  const fallbackPresetOptions: CheckoutPresetOption[] = CHECKOUT_PRESET_OPTIONS.map((amountCents) => ({ amountCents }));
  const resolvedPresetOptions = (presetOptions?.length ? presetOptions : fallbackPresetOptions).slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {resolvedPresetOptions.map((option) => {
          const amountCents = option.amountCents;
          const discountedAmountCents = Math.max(MIN_CUSTOM_TOPUP_CENTS, Math.round(amountCents * (100 - discountPercent) / 100));
          const isMostUsed = amountCents === 2000;
          return (
            <button
              key={amountCents}
              type="button"
              onClick={() => onCheckout(amountCents, amountCents)}
              disabled={loadingKey !== null}
              className="rounded-2xl border border-border/60 bg-muted/10 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-semibold">€{(amountCents / 100).toFixed(0)}</div>
                {isMostUsed ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">meist genutzt</span> : null}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {checkoutType === 'activation'
                  ? `Startguthaben ${formatEuro(amountCents)} plus direkter Zugang zu allen Agenten.`
                  : discountPercent > 0
                    ? `Heute zahlst du nur ${formatEuro(discountedAmountCents)} und laedst ${formatEuro(amountCents)} Guthaben auf.`
                    : `${formatEuro(amountCents)} werden direkt in dein Guthaben eingebucht.`}
              </div>
              {option.marketingLabel ? <div className="mt-1 text-[11px] text-muted-foreground">{option.marketingLabel}</div> : null}
              <div className="mt-3 text-xs font-medium text-primary">{loadingKey === amountCents ? 'Wird gestartet...' : 'Mit Stripe weiter'}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3">
        <div className="text-sm font-medium">Eigener Betrag</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Wunschbetrag in Euro</div>
            <input
              value={customAmount}
              onChange={(event) => onCustomAmountChange(event.target.value)}
              inputMode="decimal"
              className="w-40 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => onCheckout(customAmountCents, 'custom')}
            disabled={loadingKey !== null}
            className="btn btn-primary text-sm"
          >
            {loadingKey === 'custom' ? 'Wird gestartet...' : 'Betrag einzahlen'}
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          {checkoutType === 'activation'
            ? `Deine erste Einzahlung schaltet den Zugang frei und laedt ${formatEuro(customAmountCents)} als Startguthaben.`
            : `Gutgeschrieben werden ${formatEuro(customAmountCents)}.`}
        </div>
        <div className="text-xs text-muted-foreground">Im Stripe Checkout kannst du zusaetzlich einen Coupon-Code oder Promotion Code eingeben.</div>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </div>
  );
}
