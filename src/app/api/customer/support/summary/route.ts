import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const row = getDb()
      .prepare("SELECT COUNT(*) AS unread_count, MAX(created_at) AS latest_reply_at FROM support_messages WHERE user_id = ? AND sender = 'support' AND read_at IS NULL")
      .get(user.id) as { unread_count: number; latest_reply_at: string | null };

    return NextResponse.json({ unread_count: row?.unread_count ?? 0, latest_reply_at: row?.latest_reply_at ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load support summary';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load support summary' }, { status: 500 });
  }
}
