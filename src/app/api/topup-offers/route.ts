import { NextResponse } from 'next/server';
import { getTopupOffers } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET() {
  try {
    if (!hasPostgresConfig()) {
      return NextResponse.json({ offers: [] });
    }
    return NextResponse.json({ offers: await getTopupOffers() });
  } catch {
    return NextResponse.json({ error: 'Failed to load topup offers' }, { status: 500 });
  }
}
