import { NextRequest, NextResponse } from 'next/server';
import { getOverviewStats, getAlerts, getActivityLog, getDailyMetrics } from '@/lib/queries';
import { getDb } from '@/lib/db';
import { getAgents, ACTION_TO_AGENT } from '@/lib/agent-config';
import { requireApiUser } from '@/lib/api-auth';
import { listUsers } from '@/lib/auth';
import { fetchOpenAiCreditBalance } from '@/config/openai';
import { createStripeClient } from '@/lib/stripe-client';

interface AgentBrief {
  id: string;
  name: string;
  emoji: string;
  status: string;
  model: string;
  last_action?: string;
  last_action_at?: string;
  actions_today: number;
  next_job?: string;
  next_job_time?: string;
}

interface ActionItem {
  id: string;
  type: 'content' | 'sequence';
  title: string;
  subtitle: string;
  tier?: string;
  created_at: string;
}

interface AdminSummaryCustomer {
  total: number;
  new_last_7d: number;
  active_last_30d: number;
  paid: number;
  pending: number;
  top_customers: Array<{
    id: number;
    username: string;
    payment_status: string | null | undefined;
    wallet_balance_cents: number;
    tokens_7d: number;
    messages_7d: number;
    last_active_at: string | null;
  }>;
}

interface AdminSummaryStripe {
  configured: boolean;
  linked_customers: number;
  total_wallet_balance_cents: number;
  total_stripe_customer_balance_cents: number;
  account_available_cents: number | null;
  account_pending_cents: number | null;
}

interface AdminSummaryUsage {
  tokens_today: number;
  tokens_week: number;
  tokens_30d: number;
  cost_today: number;
  cost_week: number;
  cost_30d: number;
  active_customers_7d: number;
  top_agents: Array<{ agent_id: string; tokens_week: number; cost_week: number }>;
  daily: Array<{ day: string; total_tokens: number; total_cost: number }>;
}

interface AdminSummaryCompliance {
  unread_count: number;
  danger_count: number;
  violation_count: number;
  latest: Array<{ id: number; type: string; message: string; created_at: string; read: boolean }>;
}

interface AdminSummaryOpenAi {
  configured: boolean;
  tracked_tokens_today: number;
  tracked_tokens_week: number;
  tracked_tokens_30d: number;
  tracked_cost_today: number;
  tracked_cost_week: number;
  tracked_cost_30d: number;
  credits_remaining: number | null;
  credits_used: number | null;
  credits_granted: number | null;
  note: string;
}

interface AdminSummary {
  customers: AdminSummaryCustomer;
  stripe: AdminSummaryStripe;
  usage: AdminSummaryUsage;
  compliance: AdminSummaryCompliance;
  openai: AdminSummaryOpenAi;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function getAdminSummary(): Promise<AdminSummary> {
  const db = getDb();
  const customers = listUsers().filter((user) => user.account_type === 'customer');
  const customerIds = customers.map((customer) => customer.id);
  const sevenDaysAgo = isoDaysAgo(7);
  const thirtyDaysAgoUnix = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const sevenDaysAgoUnix = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const usageRows = db.prepare(
    `SELECT user_id,
            MAX(created_at) AS last_active_at,
            SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END) AS tokens_7d,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS messages_7d
     FROM chat_usage_events
     GROUP BY user_id`,
  ).all(sevenDaysAgoUnix, sevenDaysAgoUnix) as Array<{ user_id: number; last_active_at: number | null; tokens_7d: number; messages_7d: number }>;
  const usageByCustomer = new Map(usageRows.map((row) => [row.user_id, row]));

  const topCustomers = customers
    .map((customer) => {
      const usage = usageByCustomer.get(customer.id);
      return {
        id: customer.id,
        username: customer.username,
        payment_status: customer.payment_status,
        wallet_balance_cents: customer.wallet_balance_cents ?? 0,
        tokens_7d: usage?.tokens_7d ?? 0,
        messages_7d: usage?.messages_7d ?? 0,
        last_active_at: usage?.last_active_at ? new Date(usage.last_active_at * 1000).toISOString() : null,
      };
    })
    .sort((left, right) => (right.tokens_7d - left.tokens_7d) || (right.wallet_balance_cents - left.wallet_balance_cents))
    .slice(0, 5);

  const usageTotals = db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN total_tokens ELSE 0 END), 0) AS tokens_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN total_tokens ELSE 0 END), 0) AS tokens_week,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-29 days') THEN total_tokens ELSE 0 END), 0) AS tokens_30d,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') = date('now') THEN amount_cents ELSE 0 END), 0) AS cost_today,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-6 days') THEN amount_cents ELSE 0 END), 0) AS cost_week,
      COALESCE(SUM(CASE WHEN date(created_at, 'unixepoch') >= date('now', '-29 days') THEN amount_cents ELSE 0 END), 0) AS cost_30d,
      COUNT(DISTINCT CASE WHEN created_at >= ? THEN user_id END) AS active_customers_7d
     FROM chat_usage_events`,
  ).get(sevenDaysAgoUnix) as {
    tokens_today: number;
    tokens_week: number;
    tokens_30d: number;
    cost_today: number;
    cost_week: number;
    cost_30d: number;
    active_customers_7d: number;
  };

  const topAgents = db.prepare(
    `SELECT COALESCE(agent_id, 'unknown') AS agent_id,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END), 0) AS tokens_week,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN amount_cents ELSE 0 END), 0) AS cost_week
     FROM chat_usage_events
     GROUP BY agent_id
     ORDER BY tokens_week DESC
     LIMIT 5`,
  ).all(sevenDaysAgoUnix, sevenDaysAgoUnix) as Array<{ agent_id: string; tokens_week: number; cost_week: number }>;

  const dailyUsage = db.prepare(
    `SELECT date(created_at, 'unixepoch') AS day,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(amount_cents), 0) AS total_cost
     FROM chat_usage_events
     WHERE date(created_at, 'unixepoch') >= date('now', '-13 days')
     GROUP BY day
     ORDER BY day ASC`,
  ).all() as Array<{ day: string; total_tokens: number; total_cost: number }>;

  const complianceSummary = db.prepare(
    `SELECT
        SUM(CASE WHEN type = 'danger' THEN 1 ELSE 0 END) AS danger_count,
        SUM(CASE WHEN type = 'policy-violation' THEN 1 ELSE 0 END) AS violation_count,
        SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM notifications
      WHERE type IN ('policy-violation', 'danger')`,
  ).get() as { danger_count: number | null; violation_count: number | null; unread_count: number | null };

  const latestIncidents = db.prepare(
    `SELECT id, type, message, created_at, read
     FROM notifications
     WHERE type IN ('policy-violation', 'danger')
     ORDER BY created_at DESC, id DESC
     LIMIT 5`,
  ).all() as Array<{ id: number; type: string; message: string; created_at: string; read: number }>;

  const stripe = createStripeClient();
  let accountAvailableCents: number | null = null;
  let accountPendingCents: number | null = null;
  if (stripe) {
    try {
      const balance = await stripe.balance.retrieve();
      accountAvailableCents = balance.available.reduce((sum, item) => sum + item.amount, 0);
      accountPendingCents = balance.pending.reduce((sum, item) => sum + item.amount, 0);
    } catch {
      accountAvailableCents = null;
      accountPendingCents = null;
    }
  }

  const openAiBalance = await fetchOpenAiCreditBalance();

  return {
    customers: {
      total: customers.length,
      new_last_7d: customers.filter((customer) => customer.created_at >= sevenDaysAgo).length,
      active_last_30d: usageRows.filter((row) => (row.last_active_at ?? 0) >= thirtyDaysAgoUnix).length,
      paid: customers.filter((customer) => customer.payment_status === 'paid').length,
      pending: customers.filter((customer) => customer.payment_status !== 'paid').length,
      top_customers: topCustomers,
    },
    stripe: {
      configured: Boolean(stripe),
      linked_customers: customers.filter((customer) => customer.stripe_customer_id).length,
      total_wallet_balance_cents: customers.reduce((sum, customer) => sum + (customer.wallet_balance_cents ?? 0), 0),
      total_stripe_customer_balance_cents: customers.reduce((sum, customer) => sum + (customer.plan_amount_cents ?? 0), 0),
      account_available_cents: accountAvailableCents,
      account_pending_cents: accountPendingCents,
    },
    usage: {
      tokens_today: usageTotals.tokens_today ?? 0,
      tokens_week: usageTotals.tokens_week ?? 0,
      tokens_30d: usageTotals.tokens_30d ?? 0,
      cost_today: usageTotals.cost_today ?? 0,
      cost_week: usageTotals.cost_week ?? 0,
      cost_30d: usageTotals.cost_30d ?? 0,
      active_customers_7d: usageTotals.active_customers_7d ?? 0,
      top_agents: topAgents,
      daily: dailyUsage,
    },
    compliance: {
      unread_count: complianceSummary.unread_count ?? 0,
      danger_count: complianceSummary.danger_count ?? 0,
      violation_count: complianceSummary.violation_count ?? 0,
      latest: latestIncidents.map((incident) => ({ ...incident, read: incident.read === 1 })),
    },
    openai: {
      configured: openAiBalance.configured,
      tracked_tokens_today: usageTotals.tokens_today ?? 0,
      tracked_tokens_week: usageTotals.tokens_week ?? 0,
      tracked_tokens_30d: usageTotals.tokens_30d ?? 0,
      tracked_cost_today: usageTotals.cost_today ?? 0,
      tracked_cost_week: usageTotals.cost_week ?? 0,
      tracked_cost_30d: usageTotals.cost_30d ?? 0,
      credits_remaining: openAiBalance.creditsRemainingUsd,
      credits_used: openAiBalance.creditsUsedUsd,
      credits_granted: openAiBalance.creditsGrantedUsd,
      note: openAiBalance.note,
    },
  };
}

function getAgentBriefs(excludeSeed: boolean): AgentBrief[] {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  return getAgents().map((agent) => {
    // Find actions mapped to this agent
    const agentActions = Object.entries(ACTION_TO_AGENT)
      .filter(([, v]) => v.agent === agent.id)
      .map(([k]) => k);

    const placeholders = agentActions.map(() => '?').join(',');

    let actionsToday = 0;
    let lastAction: string | undefined;
    let lastActionAt: string | undefined;

    if (agentActions.length > 0) {
      const sf = excludeSeed
        ? ` AND NOT EXISTS (SELECT 1 FROM seed_registry sr WHERE sr.table_name = 'activity_log' AND sr.record_id = CAST(activity_log.id AS TEXT))`
        : '';
      const countRow = db.prepare(
        `SELECT COUNT(*) as c FROM activity_log WHERE action IN (${placeholders}) AND date(ts) = ?${sf}`
      ).get(...agentActions, today) as { c: number };
      actionsToday = countRow?.c ?? 0;

      const lastRow = db.prepare(
        `SELECT action, detail, ts FROM activity_log WHERE action IN (${placeholders})${sf} ORDER BY ts DESC LIMIT 1`
      ).get(...agentActions) as { action: string; detail: string; ts: string } | undefined;
      if (lastRow) {
        lastAction = lastRow.detail || lastRow.action;
        lastActionAt = lastRow.ts;
      }
    }

    // Determine status based on recent activity
    let status = 'planned';
    if (lastActionAt) {
      const hoursSince = (Date.now() - new Date(lastActionAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 1) status = 'active';
      else if (hoursSince < 24) status = 'idle';
    }

    // Find next scheduled job
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    let nextJob: string | undefined;
    let nextJobTime: string | undefined;

    for (const job of agent.cronJobs) {
      // Parse schedule like "8:00 AM", "2:00 PM"
      const match = job.schedule.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) continue;
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const jobTimeMinutes = hours * 60 + minutes;

      if (jobTimeMinutes > currentTimeMinutes) {
        nextJob = job.label;
        nextJobTime = job.schedule;
        break;
      }
    }

    return {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      status,
      model: agent.model,
      last_action: lastAction,
      last_action_at: lastActionAt,
      actions_today: actionsToday,
      next_job: nextJob,
      next_job_time: nextJobTime,
    };
  });
}

function getActionItems(excludeSeed: boolean): ActionItem[] {
  const db = getDb();
  const items: ActionItem[] = [];

  const sfContent = excludeSeed
    ? `AND NOT EXISTS (SELECT 1 FROM seed_registry sr WHERE sr.table_name = 'content_posts' AND sr.record_id = CAST(id AS TEXT))`
    : '';
  const sfSeq = excludeSeed
    ? `AND NOT EXISTS (SELECT 1 FROM seed_registry sr WHERE sr.table_name = 'sequences' AND sr.record_id = CAST(id AS TEXT))`
    : '';

  // Pending content approvals
  const contentPending = db.prepare(
    `SELECT id, platform, text_preview, pillar, created_at FROM content_posts
     WHERE status = 'pending_approval' ${sfContent}
     ORDER BY created_at ASC`
  ).all() as { id: string; platform: string; text_preview: string | null; pillar: number | null; created_at: string }[];

  for (const c of contentPending) {
    items.push({
      id: c.id,
      type: 'content',
      title: c.text_preview?.slice(0, 60) || 'Untitled content',
      subtitle: `${c.platform} draft`,
      created_at: c.created_at,
    });
  }

  // Pending sequence approvals
  const seqPending = db.prepare(
    `SELECT s.id, s.subject, s.step, s.sequence_name, s.tier, s.created_at,
            l.first_name, l.last_name, l.company
     FROM sequences s
     LEFT JOIN leads l ON s.lead_id = l.id
     WHERE s.status = 'pending_approval' ${sfSeq}
     ORDER BY s.created_at ASC`
  ).all() as {
    id: string; subject: string | null; step: number; sequence_name: string | null;
    tier: string | null; created_at: string; first_name: string | null;
    last_name: string | null; company: string | null;
  }[];

  for (const s of seqPending) {
    items.push({
      id: s.id,
      type: 'sequence',
      title: s.subject || `Step ${s.step}`,
      subtitle: [s.first_name, s.last_name].filter(Boolean).join(' ') + (s.company ? ` at ${s.company}` : ''),
      tier: s.tier || undefined,
      created_at: s.created_at,
    });
  }

  // Sort by created_at (oldest first — most urgent)
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return items;
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as Request);
  if (auth) return auth;
  const real = req.nextUrl.searchParams.get('real') === 'true';
  const stats = getOverviewStats({ excludeSeed: real });
  const alerts = getAlerts({ excludeSeed: real });
  const recentActivity = getActivityLog({ limit: 20, excludeSeed: real });
  const metrics = getDailyMetrics(84, { excludeSeed: real }); // 12 weeks
  const agents = getAgentBriefs(real);
  const action_items = getActionItems(real);
  const admin_summary = await getAdminSummary();

  return NextResponse.json({ stats, alerts, recentActivity, metrics, agents, action_items, admin_summary });
}
