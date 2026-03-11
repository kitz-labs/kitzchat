import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createTopupOffer } from '@/modules/admin/admin.service';
import { hasPostgresConfig } from '@/config/env';

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    if (!hasPostgresConfig()) return NextResponse.json({ error: 'DATABASE_URL fehlt' }, { status: 503 });
    const body = (await request.json().catch(() => ({}))) as {
      offer_code?: string;
      offerCode?: string;
      name?: string;
      amount_eur?: number;
      amountEur?: number;
      credits?: number;
      bonus_credits?: number;
      bonusCredits?: number;
      active?: boolean;
      sort_order?: number;
      sortOrder?: number;
      marketing_label?: string;
      marketingLabel?: string;
    };
    return NextResponse.json(await createTopupOffer({
      offerCode: body.offerCode || body.offer_code || '',
      name: body.name || '',
      amountEur: Number(body.amountEur ?? body.amount_eur ?? 0),
      credits: Number(body.credits ?? 0),
      bonusCredits: Number(body.bonusCredits ?? body.bonus_credits ?? 0),
      active: body.active !== false,
      sortOrder: Number(body.sortOrder ?? body.sort_order ?? 1),
      marketingLabel: body.marketingLabel || body.marketing_label || null,
    }), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save topup offer';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to save topup offer' }, { status: 500 });
  }
}
