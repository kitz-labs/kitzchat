import { NextResponse } from 'next/server';
import { acceptUserTerms, requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }
    acceptUserTerms(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept terms';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to accept terms' }, { status: 500 });
  }
}