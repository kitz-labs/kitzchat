import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getCustomerAgentProfile, upsertCustomerAgentProfile } from '@/lib/customer-agent-profiles';

export const dynamic = 'force-dynamic';

function normalizeAgentId(raw: string | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.length > 64) return '';
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(value)) return '';
  return value;
}

export async function GET(request: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const { agentId: rawAgentId } = await ctx.params;
    const agentId = normalizeAgentId(rawAgentId);
    if (!agentId) return NextResponse.json({ error: 'agentId invalid' }, { status: 400 });

    const record = getCustomerAgentProfile(user.id, agentId);
    return NextResponse.json({ profile: record.profile, updated_at: record.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load agent profile';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load agent profile' }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const { agentId: rawAgentId } = await ctx.params;
    const agentId = normalizeAgentId(rawAgentId);
    if (!agentId) return NextResponse.json({ error: 'agentId invalid' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const record = upsertCustomerAgentProfile(user.id, agentId, (body as any)?.profile ?? body);
    return NextResponse.json({ profile: record.profile, updated_at: record.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent profile';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to update agent profile' }, { status: 500 });
  }
}

