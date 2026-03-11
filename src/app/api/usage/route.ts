import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as unknown as Request);
  if (auth) return auth;
  const db = getDb();
  const actor = requireUser(req as Request);
  const daysParam = Number(req.nextUrl.searchParams.get('days') || 14);
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(90, Math.floor(daysParam))) : 14;
  const filter = actor.account_type === 'customer' && actor.role !== 'admin' ? 'WHERE user_id = ?' : '';
  const params = filter ? [actor.id] : [];

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN total_tokens ELSE 0 END), 0) AS tokens_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN total_tokens ELSE 0 END), 0) AS tokens_week,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN amount_cents ELSE 0 END), 0) AS cost_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN amount_cents ELSE 0 END), 0) AS cost_week,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-29 days') THEN total_tokens ELSE 0 END), 0) AS tokens_30d,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-29 days') THEN amount_cents ELSE 0 END), 0) AS cost_30d
    FROM chat_usage_events
    ${filter}
  `).get(...params);

  const byAgent = db.prepare(`
    SELECT
      COALESCE(agent_id, 'unknown') AS agent_id,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN total_tokens ELSE 0 END), 0) AS tokens_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN total_tokens ELSE 0 END), 0) AS tokens_week,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN amount_cents ELSE 0 END), 0) AS cost_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN amount_cents ELSE 0 END), 0) AS cost_week
    FROM chat_usage_events
    ${filter}
    GROUP BY agent_id
    ORDER BY tokens_week DESC, tokens_today DESC
  `).all(...params);

  const byModel: Array<{ model: string; total_tokens: number; total_cost: number }> = [];

  const daily = db.prepare(`
    SELECT
      date(created_at, 'unixepoch') AS day,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(amount_cents), 0) AS total_cost
    FROM chat_usage_events
    ${filter ? `${filter} AND` : 'WHERE'} date(created_at, 'unixepoch') >= date('now', '-' || (? - 1) || ' days')
    GROUP BY day
    ORDER BY day ASC
  `).all(...params, days);

  return NextResponse.json({
    days,
    totals,
    by_agent: byAgent,
    by_model: byModel,
    daily,
  });
}
