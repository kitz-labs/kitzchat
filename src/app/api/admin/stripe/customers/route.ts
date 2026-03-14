import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const stripe = getStripe();
    const customers = listUsers().filter((user) => user.account_type === 'customer');

    if (!stripe) {
      return NextResponse.json({ customers: customers.map((customer) => ({
        id: customer.id,
        username: customer.username,
        email: customer.email ?? null,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        payment_status: customer.payment_status ?? 'pending',
        wallet_balance_cents: customer.wallet_balance_cents ?? 0,
        next_topup_discount_percent: customer.next_topup_discount_percent ?? 0,
        stripe_synced: false,
      })) });
    }

    const db = getDb();
    const enriched = await Promise.all(customers.map(async (customer) => {
      const stripeCustomer = customer.stripe_customer_id
        ? await stripe.customers.retrieve(customer.stripe_customer_id).catch(() => null)
        : null;
      const stripeRecord = stripeCustomer && !('deleted' in stripeCustomer && stripeCustomer.deleted) ? stripeCustomer : null;

      // fetch latest session token for this user from sqlite sessions table
      let sessionToken: string | null = null;
      try {
        const row = db.prepare('SELECT token FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1').get(customer.id) as { token?: string } | undefined;
        sessionToken = row?.token ?? null;
      } catch {
        sessionToken = null;
      }

      return {
        id: customer.id,
        username: customer.username,
        email: customer.email ?? stripeRecord?.email ?? null,
        stripe_customer_id: customer.stripe_customer_id ?? null,
        payment_status: customer.payment_status ?? 'pending',
        wallet_balance_cents: customer.wallet_balance_cents ?? 0,
        next_topup_discount_percent: customer.next_topup_discount_percent ?? 0,
        stripe_synced: Boolean(stripeRecord),
        stripe_name: stripeRecord?.name ?? null,
        stripe_balance_cents: stripeRecord?.balance ?? 0,
        stripe_created_at: stripeRecord?.created ? new Date(stripeRecord.created * 1000).toISOString() : null,
        session_token: sessionToken,
      };
    }));

    return NextResponse.json({ customers: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Stripe customers';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load Stripe customers' }, { status: 500 });
  }
}
