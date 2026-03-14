import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { insertSupportReply } from '@/lib/support';

export const dynamic = 'force-dynamic';

function parseUserId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    requireAdmin(request);
    const { userId } = await context.params;
    const parsed = parseUserId(userId);
    if (!parsed) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { message?: string };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    return NextResponse.json(insertSupportReply(parsed, message));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send support reply';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (message === 'customer_not_found') return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json({ error: 'Failed to send support reply' }, { status: 500 });
  }
}