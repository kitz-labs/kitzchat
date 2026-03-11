import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getWalletHistoryPayload } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (!hasPostgresConfig()) return NextResponse.json({ entries: [] });
    return NextResponse.json({ entries: await getWalletHistoryPayload(user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load wallet ledger';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load wallet ledger' }, { status: 500 });
  }
}
