import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireUser(request);
    const db = getDb();
    db.prepare('SELECT 1').get();

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()) ? 'configured' : 'not-configured',
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ status: 'error', checked_at: new Date().toISOString() }, { status: 500 });
  }
}