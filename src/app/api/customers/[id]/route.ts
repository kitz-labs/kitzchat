import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAgent, getAgents } from '@/lib/agent-config';
import {
  addUserWalletBalance,
  getCustomerFreeMessageUsage,
  getUserById,
  grantUserWalletBalance,
  requireAdmin,
  updateCustomerPaymentStatus,
  updateUserEmail,
  updateUsername,
  setNextTopupDiscountPercent,
} from '@/lib/auth';
import { ensureStripeCustomerForUser } from '@/modules/stripe/stripe.service';

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
      free_messages: getCustomerFreeMessageUsage(customer.id, customer.username),
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      email?: string | null;
      payment_status?: 'pending' | 'paid';
      next_topup_discount_percent?: number;
      add_credits_cents?: number;
      mark_paid_with_credits_cents?: number;
      ensure_stripe_customer?: boolean;
    };

    if (typeof body.username === 'string' && body.username.trim()) {
      updateUsername(userId, body.username);
    }

    if (body.email !== undefined) {
      updateUserEmail(userId, body.email ?? null);
    }

    if (body.payment_status === 'pending' || body.payment_status === 'paid') {
      updateCustomerPaymentStatus(userId, body.payment_status);
    }

    if (typeof body.next_topup_discount_percent === 'number') {
      setNextTopupDiscountPercent(userId, body.next_topup_discount_percent);
    }

    if (typeof body.add_credits_cents === 'number' && Number.isFinite(body.add_credits_cents)) {
      grantUserWalletBalance(userId, body.add_credits_cents);
    }

    if (typeof body.mark_paid_with_credits_cents === 'number' && Number.isFinite(body.mark_paid_with_credits_cents) && body.mark_paid_with_credits_cents > 0) {
      addUserWalletBalance(userId, Math.round(body.mark_paid_with_credits_cents));
    }

    let stripeCustomerId = customer.stripe_customer_id ?? null;
    if (body.ensure_stripe_customer === true) {
      const refreshed = getUserById(userId);
      stripeCustomerId = await ensureStripeCustomerForUser({
        userId,
        username: refreshed?.username ?? customer.username,
        email: refreshed?.email ?? customer.email ?? null,
        stripeCustomerId: refreshed?.stripe_customer_id ?? customer.stripe_customer_id ?? null,
      });
    }

    return NextResponse.json({ customer: { ...getUserById(userId), stripe_customer_id: stripeCustomerId ?? getUserById(userId)?.stripe_customer_id ?? null } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update customer';
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('Username') || msg.includes('gueltige E-Mail-Adresse')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}