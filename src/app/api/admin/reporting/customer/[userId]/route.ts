import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCustomerReporting } from '@/modules/reporting/reporting.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    requireAdmin(request);
    if (!hasPostgresConfig()) return NextResponse.json({ error: 'DATABASE_URL fehlt' }, { status: 503 });
    const { userId } = await context.params;
    return NextResponse.json(await getCustomerReporting(Number(userId)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reporting';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load reporting' }, { status: 500 });
  }
}
