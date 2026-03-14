import { queryPg } from '@/config/db';
import { env, getBillingDbKind } from '@/config/env';
import { getEntitlements } from '@/modules/entitlements/entitlements.service';
import { appendWalletLedger, type WalletLedgerEntry } from './wallet.ledger.service';

function getEnsureBillingUserSql() {
  return getBillingDbKind() === 'mysql'
   ? `INSERT INTO users (id, email, name, stripe_customer_id, chat_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), stripe_customer_id = COALESCE(VALUES(stripe_customer_id), stripe_customer_id), chat_enabled = VALUES(chat_enabled), updated_at = CURRENT_TIMESTAMP`
   : `INSERT INTO users (id, email, name, stripe_customer_id, chat_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
        name = EXCLUDED.name,
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
        chat_enabled = EXCLUDED.chat_enabled,
        updated_at = CURRENT_TIMESTAMP`;
}

function getEnsureWalletSql() {
  return getBillingDbKind() === 'mysql'
   ? `INSERT INTO wallets (user_id, balance_credits, currency_display, status)
     VALUES ($1, 0, 'Credits', 'active')
     ON DUPLICATE KEY UPDATE user_id = user_id`
   : `INSERT INTO wallets (user_id, balance_credits, currency_display, status)
     VALUES ($1, 0, 'Credits', 'active')
     ON CONFLICT (user_id) DO NOTHING`;
}

export type WalletView = {
  balance: number;
  currencyDisplay: string;
  status: string;
  lowBalanceWarning: boolean;
  premiumModeMessage: string;
  balanceRatio: number;
};

export async function ensureBillingUser(params: {
  userId: number;
  email?: string | null;
  name: string;
  stripeCustomerId?: string | null;
  chatEnabled?: boolean;
}): Promise<void> {
  await queryPg(getEnsureBillingUserSql(), [params.userId, params.email ?? null, params.name, params.stripeCustomerId ?? null, params.chatEnabled ?? false]);

  await queryPg(getEnsureWalletSql(), [params.userId]);
}

export async function getWalletRecord(userId: number): Promise<{ id: number; balance_credits: number; currency_display: string; status: string }> {
  const result = await queryPg<{ id: number; balance_credits: number; currency_display: string; status: string }>(
    'SELECT id, balance_credits, currency_display, status FROM wallets WHERE user_id = $1',
    [userId],
  );
  const wallet = result.rows[0];
  if (!wallet) throw new Error('wallet_not_found');
  return wallet;
}

export async function getLifetimeCredits(userId: number): Promise<number> {
  const result = await queryPg<{ total: string }>(
    `SELECT COALESCE(SUM(CASE WHEN credits_delta > 0 THEN credits_delta ELSE 0 END), 0) AS total
     FROM wallet_ledger WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getWalletView(userId: number): Promise<WalletView> {
  const wallet = await getWalletRecord(userId);
  const lifetimeCredits = await getLifetimeCredits(userId);
  const balanceRatio = lifetimeCredits > 0 ? Math.max(0, Math.min(1, wallet.balance_credits / lifetimeCredits)) : wallet.balance_credits > 0 ? 1 : 0;
  const lowBalanceWarning = balanceRatio <= env.LOW_BALANCE_THRESHOLD_RATIO || wallet.balance_credits <= env.CREDIT_MULTIPLIER * 5;
  const entitlements = await getEntitlements(userId);
  const premiumModeMessage = lowBalanceWarning
    ? 'Auto-Optimierung schuetzt dein Restguthaben'
    : entitlements.premium_mode
      ? 'Intelligente Modellsteuerung aktiv'
      : 'Auto-optimierter Qualitaetsmodus';

  return {
    balance: wallet.balance_credits,
    currencyDisplay: wallet.currency_display,
    status: wallet.status,
    lowBalanceWarning,
    premiumModeMessage,
    balanceRatio,
  };
}

export async function applyWalletDelta(userId: number, entry: WalletLedgerEntry): Promise<{ balanceAfter: number; walletId: number }> {
  const wallet = await getWalletRecord(userId);
  const balanceAfter = wallet.balance_credits + entry.credits_delta;
  if (balanceAfter < 0) {
    throw new Error('insufficient_credits');
  }

  await queryPg('UPDATE wallets SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [balanceAfter, wallet.id]);
  await appendWalletLedger(userId, wallet.id, balanceAfter, entry);
  return { balanceAfter, walletId: wallet.id };
}

export async function getWalletLedger(userId: number): Promise<Array<{
  id: number;
  entry_type: string;
  credits_delta: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  note: string | null;
  created_at: string;
}>> {
  const rows = await queryPg<{
    id: number;
    entry_type: string;
    credits_delta: number;
    balance_after: number;
    reference_type: string;
    reference_id: string;
    note: string | null;
    created_at: string;
  }>(
    `SELECT id, entry_type, credits_delta, balance_after, reference_type, reference_id, note, created_at
     FROM wallet_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.rows;
}
