import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { requireAdmin } from '@/lib/auth';
import { createStripeClient } from '@/lib/stripe-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const stripe = createStripeClient();
    if (!stripe) return NextResponse.json({ configured: false });

    const [account, balance, webhookEndpoints] = await Promise.all([
      stripe.accounts.retrieve().catch(() => null),
      stripe.balance.retrieve().catch(() => null),
      stripe.webhookEndpoints.list({ limit: 100 }).catch(() => ({ data: [] as Stripe.WebhookEndpoint[] })),
    ]);

    return NextResponse.json({
      configured: true,
      account: account
        ? {
            id: account.id,
            country: account.country ?? null,
            email: (account as any).email ?? null,
            business_name: (account.business_profile as any)?.name ?? null,
            charges_enabled: (account as any).charges_enabled ?? null,
            payouts_enabled: (account as any).payouts_enabled ?? null,
          }
        : null,
      balance: balance
        ? {
            available: balance.available ?? [],
            pending: balance.pending ?? [],
          }
        : null,
      webhook_endpoints: {
        count: webhookEndpoints?.data?.length ?? 0,
      },
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Stripe overview';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load Stripe overview' }, { status: 500 });
  }
}
