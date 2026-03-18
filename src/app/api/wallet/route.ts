import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getWalletPayload, getUiMessages } from '@/modules/billing/billing.service';
import { ensureBillingUser, syncBillingWalletFromAppBalance } from '@/modules/wallet/wallet.service';
import { centsToCredits, hasPostgresConfig } from '@/config/env';

function getFallbackWallet(message: string) {
  return {
    balance: 0,
    currencyDisplay: 'Credits',
    status: 'inactive',
    lowBalanceWarning: true,
    premiumModeMessage: message,
    uiMessages: [],
  };
}

export async function GET(request: Request) {
  let user: ReturnType<typeof requireUser> | null = null;
  try {
    user = requireUser(request);
    if (!hasPostgresConfig()) {
      return NextResponse.json(getFallbackWallet('PostgreSQL-Billing ist noch nicht aktiviert'));
    }
    await ensureBillingUser({ userId: user.id, email: user.email ?? null, name: user.username, stripeCustomerId: user.stripe_customer_id ?? null, chatEnabled: user.payment_status === 'paid' });
    const walletBalanceCents = Math.max(0, Math.round(user.wallet_balance_cents ?? 0));
    let wallet = await getWalletPayload(user.id);
    if ((wallet?.balance ?? 0) <= 0 && walletBalanceCents > 0) {
      await syncBillingWalletFromAppBalance({ userId: user.id, walletBalanceCents, reason: 'Auto-Sync beim Wallet-Load (Billing-Wallet fehlte trotz Guthaben).' });
      wallet = await getWalletPayload(user.id);
    }
    const messages = await getUiMessages('wallet');
    return NextResponse.json({ ...wallet, uiMessages: messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load wallet';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const walletBalanceCents = Math.max(0, Math.round(user?.wallet_balance_cents ?? 0));
    const balance = centsToCredits(walletBalanceCents);
    // If Billing DB is temporarily unavailable, keep UI consistent by showing the mirrored SQLite balance.
    // Billing DB remains the source of truth; this is display-only fallback.
    return NextResponse.json({
      ...getFallbackWallet('Wallet derzeit nicht verfuegbar'),
      balance,
      lowBalanceWarning: balance <= 0,
      status: balance > 0 ? 'active' : 'inactive',
    });
  }
}
