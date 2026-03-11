import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getWalletPayload, getUiMessages } from '@/modules/billing/billing.service';
import { ensureBillingUser } from '@/modules/wallet/wallet.service';
import { hasPostgresConfig } from '@/config/env';

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (!hasPostgresConfig()) {
      return NextResponse.json({
        balance: 0,
        currencyDisplay: 'Credits',
        status: 'inactive',
        lowBalanceWarning: true,
        premiumModeMessage: 'PostgreSQL-Billing ist noch nicht aktiviert',
      });
    }
    await ensureBillingUser({ userId: user.id, email: user.email ?? null, name: user.username, stripeCustomerId: user.stripe_customer_id ?? null, chatEnabled: user.payment_status === 'paid' });
    const wallet = await getWalletPayload(user.id);
    const messages = await getUiMessages('wallet');
    return NextResponse.json({ ...wallet, uiMessages: messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load wallet';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 });
  }
}
