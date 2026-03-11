import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAgent, getAgents } from '@/lib/agent-config';
import { getUserById, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type UsageRow = {
  agent_id: string | null;
  runs: number;
  total_tokens: number;
  total_cents: number;
  last_used_at: number | null;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
    }

    const customer = getUserById(userId);
    if (!customer || customer.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const db = getDb();
    const usageSummary = db
      .prepare(
        `SELECT
           COUNT(DISTINCT conversation_id) AS conversations,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COALESCE(SUM(amount_cents), 0) AS total_cents,
           MAX(created_at) AS last_used_at
         FROM chat_usage_events
         WHERE user_id = ?`,
      )
      .get(userId) as {
      conversations: number;
      total_tokens: number;
      total_cents: number;
      last_used_at: number | null;
    };

    const usageByAgent = db
      .prepare(
        `SELECT
           agent_id,
           COUNT(*) AS runs,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COALESCE(SUM(amount_cents), 0) AS total_cents,
           MAX(created_at) AS last_used_at
         FROM chat_usage_events
         WHERE user_id = ?
         GROUP BY agent_id
         ORDER BY total_tokens DESC, runs DESC`,
      )
      .all(userId) as UsageRow[];

    const catalog = getAgents();
    const agents = usageByAgent.map((row) => {
      const fallback = row.agent_id ? getAgent(undefined, row.agent_id) : undefined;
      const catalogAgent = row.agent_id ? catalog.find((agent) => agent.id === row.agent_id) : undefined;
      const agent = fallback ?? catalogAgent;

      return {
        agent_id: row.agent_id,
        name: agent?.name ?? row.agent_id ?? 'Unknown agent',
        emoji: agent?.emoji ?? '🤖',
        runs: row.runs,
        total_tokens: row.total_tokens,
        total_cents: row.total_cents,
        last_used_at: row.last_used_at,
      };
    });

    return NextResponse.json({
      customer,
      summary: usageSummary,
      agents,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to load customer detail' }, { status: 500 });
  }
}