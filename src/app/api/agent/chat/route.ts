import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { runAgentChat } from '@/modules/agents/agents.service';
import { hasPostgresConfig } from '@/config/env';

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { agentCode?: string; prompt?: string };
    if (!body.agentCode || !body.prompt) {
      return NextResponse.json({ error: 'agentCode und prompt sind erforderlich' }, { status: 400 });
    }
    if (!hasPostgresConfig()) {
      return NextResponse.json({ error: 'DATABASE_URL fehlt. Agent-Billing ist noch nicht aktiv.' }, { status: 503 });
    }
    const result = await runAgentChat({
      userId: user.id,
      email: user.email ?? null,
      name: user.username,
      agentCode: body.agentCode,
      prompt: body.prompt,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent chat failed';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'chat_not_enabled') return NextResponse.json({ error: 'Webchat und Agenten sind fuer dieses Konto noch nicht freigeschaltet' }, { status: 402 });
    if (message === 'insufficient_credits') return NextResponse.json({ error: 'Nicht genug Credits verfuegbar' }, { status: 402 });
    return NextResponse.json({ error: 'Agent chat failed' }, { status: 500 });
  }
}
