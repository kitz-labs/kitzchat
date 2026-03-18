import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/lib/auth';
import { createStripeClient } from '@/lib/stripe-client';

export const dynamic = 'force-dynamic';

function getStripe(): Stripe | null {
  return createStripeClient();
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

    const enriched = await Promise.all(customers.map(async (customer) => {
      const stripeCustomer = customer.stripe_customer_id
        ? await stripe.customers.retrieve(customer.stripe_customer_id).catch(() => null)
        : null;
      const stripeRecord = stripeCustomer && !('deleted' in stripeCustomer && stripeCustomer.deleted) ? stripeCustomer : null;

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
