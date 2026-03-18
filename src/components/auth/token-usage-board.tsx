'use client';

import { useEffect, useMemo, useState } from 'react';

function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  return v.toString().padStart(8, '0');
}

const STORAGE_KEY = 'nexora.token_ticker.v1';

function readTickerState(): { count: number; rate: number; updatedAtMs: number } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { count?: unknown; rate?: unknown; updatedAtMs?: unknown };
    const count = Number(parsed.count);
    const rate = Number(parsed.rate);
    const updatedAtMs = Number(parsed.updatedAtMs);
    if (!Number.isFinite(count) || !Number.isFinite(rate) || !Number.isFinite(updatedAtMs)) return null;
    if (updatedAtMs <= 0) return null;
    // Ignore very old state (avoid weird jumps after long time).
    if (Date.now() - updatedAtMs > 24 * 60 * 60 * 1000) return null;
    return { count, rate, updatedAtMs };
  } catch {
    return null;
  }
}

function writeTickerState(state: { count: number; rate: number; updatedAtMs: number }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function TokenUsageTicker({
  className,
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'compact';
}) {
  const seed = useMemo(() => Date.now() % 100000, []);
  const [count, setCount] = useState(() => {
    if (typeof window === 'undefined') return 210_700 + (seed % 30_000);
    const stored = readTickerState();
    if (!stored) return 210_700 + (seed % 30_000);
    const elapsedSec = Math.max(0, Math.floor((Date.now() - stored.updatedAtMs) / 1000));
    return stored.count + stored.rate * elapsedSec;
  });
  const [rate, setRate] = useState(() => {
    if (typeof window === 'undefined') return 29;
    return readTickerState()?.rate ?? 29;
  }); // tokens/sec (simuliert)

  useEffect(() => {
    const t = window.setInterval(() => {
      setCount((c) => c + rate);
    }, 1000);
    return () => window.clearInterval(t);
  }, [rate]);

  useEffect(() => {
    const t = window.setInterval(() => {
      // sichtbares + / - wie im Screenshot (simuliert)
      setRate(() => {
        const magnitude = 18 + Math.floor(Math.random() * 22); // 18..39
        const sign = Math.random() < 0.68 ? 1 : -1;
        return magnitude * sign;
      });
    }, 7000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    // Persist continuously, so route changes do not reset the ticker.
    const persist = () => writeTickerState({ count, rate, updatedAtMs: Date.now() });
    const t = window.setInterval(persist, 2500);
    window.addEventListener('beforeunload', persist);
    return () => {
      window.removeEventListener('beforeunload', persist);
      window.clearInterval(t);
      persist();
    };
  }, [count, rate]);

  const digits = formatCount(count);
  const rateLabel = `${rate >= 0 ? '+' : ''}${rate}/s`;

  const headerTextClass = variant === 'compact'
    ? 'text-[9px]'
    : 'text-[10px]';
  const digitTextClass = variant === 'compact'
    ? 'text-xl sm:text-3xl'
    : 'text-2xl sm:text-4xl';
  const rateTextClass = variant === 'compact'
    ? 'text-base'
    : 'text-lg';
  const gridGapClass = variant === 'compact'
    ? 'gap-4'
    : 'gap-6';

  return (
    <div className={className}>
      <div className={`flex items-center justify-between ${headerTextClass} text-white/55 uppercase tracking-widest`}>
        <span>COUNT</span>
        <span>RATE</span>
      </div>

      <div className={`mt-2 grid grid-cols-[1fr_auto] items-end ${gridGapClass}`}>
        <div
          className={`font-mono ${digitTextClass} leading-none tracking-[0.10em] text-amber-200`}
          style={{
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 18px rgba(255,200,80,0.18)',
          }}
        >
          {digits.slice(0, 2)}:{digits.slice(2, 5)}:{digits.slice(5)}
        </div>

        <div className="text-right">
          <div
            className={`font-mono ${rateTextClass} text-amber-200`}
            style={{ fontVariantNumeric: 'tabular-nums', textShadow: '0 0 18px rgba(255,200,80,0.18)' }}
          >
            {rateLabel}
          </div>
          <div className="text-[11px] text-white/55">tokens pro Sekunde</div>
        </div>
      </div>
    </div>
  );
}

// Backwards compatible export (older pages import the old name)
export const TokenUsageBoard = TokenUsageTicker;
