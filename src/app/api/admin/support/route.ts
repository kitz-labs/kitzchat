import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { listSupportThreads } from '@/lib/support';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json(listSupportThreads());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load support inbox';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load support inbox' }, { status: 500 });
  }
}