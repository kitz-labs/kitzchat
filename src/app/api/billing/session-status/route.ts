import { NextRequest, NextResponse } from 'next/server';
import { getSessionStatus } from '@/modules/billing/billing.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: NextRequest) {
  try {
    if (!hasPostgresConfig()) {
      return NextResponse.json({ status: 'pending', creditsAdded: 0, currentBalance: 0, chatEnabled: false, entitlements: null });
    }
    const sessionId = request.nextUrl.searchParams.get('session_id') || '';
    if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    return NextResponse.json(await getSessionStatus(sessionId));
  } catch {
    return NextResponse.json({ error: 'Failed to load session status' }, { status: 500 });
  }
}
