import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readSettings, writeSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeUsd(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0) return null;
  return rounded;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v ? v : undefined;
}

function readTopups() {
  const s = readSettings();
  const arr = Array.isArray(s.openai?.prepaid_topups) ? s.openai!.prepaid_topups! : [];
  return arr
    .filter((t) => t && typeof t.id === 'string')
    .sort((a, b) => String(b.purchased_at).localeCompare(String(a.purchased_at)));
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ ok: true, topups: readTopups() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load OpenAI topups';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load OpenAI topups' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      purchased_at?: string;
      amount_usd?: number;
      note?: string;
      reference?: string;
    };

    const purchasedAt = normalizeIsoDate(body.purchased_at);
    const amountUsd = normalizeUsd(body.amount_usd);
    if (!purchasedAt || !amountUsd) {
      return NextResponse.json({ error: 'Invalid purchased_at or amount_usd' }, { status: 400 });
    }

    const settings = readSettings();
    settings.openai = settings.openai || {};
    const topups = Array.isArray(settings.openai.prepaid_topups) ? settings.openai.prepaid_topups : [];

    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `topup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    topups.push({
      id,
      purchased_at: purchasedAt,
      amount_usd: amountUsd,
      note: normalizeText(body.note),
      reference: normalizeText(body.reference),
      created_at: new Date().toISOString(),
    });

    settings.openai.prepaid_topups = topups;
    writeSettings(settings);

    return NextResponse.json({ ok: true, topups: readTopups() }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create OpenAI topup';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to create OpenAI topup' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const settings = readSettings();
    settings.openai = settings.openai || {};
    const topups = Array.isArray(settings.openai.prepaid_topups) ? settings.openai.prepaid_topups : [];
    const next = topups.filter((t) => t?.id !== id);
    settings.openai.prepaid_topups = next;
    writeSettings(settings);

    return NextResponse.json({ ok: true, topups: readTopups() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete OpenAI topup';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to delete OpenAI topup' }, { status: 500 });
  }
}

