import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { runAgentChat } from '@/modules/agents/agents.service';
import { hasPostgresConfig } from '@/config/env';

export async function POST(request: Request) {
  try {
    const user = requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { prompt?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json({ error: 'prompt ist erforderlich' }, { status: 400 });
    }
    if (!hasPostgresConfig()) {
      return NextResponse.json({ error: 'DATABASE_URL fehlt. Billing ist nicht aktiv.' }, { status: 503 });
    }

    const result = await runAgentChat({
      userId: user.id,
      email: user.email ?? null,
      name: user.username,
      walletBalanceCents: user.wallet_balance_cents ?? 0,
      agentCode: 'maestro',
      prompt,
    });

    return NextResponse.json({ answer: result.answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'maestro_failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'MAESTRO failed' }, { status: 500 });
  }
}
