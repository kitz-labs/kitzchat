import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getSupportConversation } from '@/lib/support';

export const dynamic = 'force-dynamic';

function parseUserId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    requireAdmin(request);
    const { userId } = await context.params;
    const parsed = parseUserId(userId);
    if (!parsed) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    return NextResponse.json(getSupportConversation(parsed, { markCustomerRead: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load support conversation';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (message === 'customer_not_found') return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    return NextResponse.json({ error: 'Failed to load support conversation' }, { status: 500 });
  }
}