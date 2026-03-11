import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getEntitlements } from '@/modules/entitlements/entitlements.service';
import { ensureBillingUser } from '@/modules/wallet/wallet.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (!hasPostgresConfig()) {
      return NextResponse.json({ webchat: false, agents: false, history: false, premiumMode: false });
    }
    await ensureBillingUser({ userId: user.id, email: user.email ?? null, name: user.username, stripeCustomerId: user.stripe_customer_id ?? null, chatEnabled: user.payment_status === 'paid' });
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json({
      webchat: entitlements.webchat,
      agents: entitlements.agents,
      history: entitlements.history,
      premiumMode: entitlements.premium_mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load entitlements';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load entitlements' }, { status: 500 });
  }
}
