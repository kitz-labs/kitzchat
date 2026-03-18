import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readSettings, writeSettings } from '@/lib/settings';
import { fetchOpenAiCreditBalance } from '@/config/openai';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

function normalizeNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    const overrideUsd = normalizeNumber(settings.openai?.credit_balance_override_usd ?? null);
    const api = await fetchOpenAiCreditBalance().catch(() => null);

    return NextResponse.json({
      ok: true,
      fx: { usd_to_eur: env.OPENAI_USD_TO_EUR || 0.92, fixed: true },
      override_usd: overrideUsd,
      override_eur: overrideUsd === null ? null : overrideUsd * (env.OPENAI_USD_TO_EUR || 0.92),
      api,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load credit balance';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load credit balance' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { override_usd?: number | string | null };
    const overrideUsd = normalizeNumber(body.override_usd ?? null);
    if (overrideUsd === null || overrideUsd < 0 || overrideUsd > 1_000_000) {
      return NextResponse.json({ error: 'Ungültiger USD Betrag' }, { status: 400 });
    }

    const settings = readSettings();
    settings.openai = settings.openai || {};
    settings.openai.credit_balance_override_usd = overrideUsd;
    writeSettings(settings);

    return NextResponse.json({ ok: true, override_usd: overrideUsd });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update credit balance';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update credit balance' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    if (settings.openai) delete settings.openai.credit_balance_override_usd;
    writeSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear credit balance';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to clear credit balance' }, { status: 500 });
  }
}

