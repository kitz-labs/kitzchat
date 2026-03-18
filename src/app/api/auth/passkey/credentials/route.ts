import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listPasskeysForUser } from '@/lib/passkeys';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    const passkeys = listPasskeysForUser(user.id);
    return NextResponse.json({ passkeys });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load passkeys';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load passkeys' }, { status: 500 });
  }
}

