import { queryPg, withPgClient } from '@/config/db';
import { centsToCredits, env, getBillingDbKind } from '@/config/env';
import { enableCorePremiumEntitlements, getEntitlements } from '@/modules/entitlements/entitlements.service';
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

  if (params.chatEnabled) {
    await enableCorePremiumEntitlements(params.userId, 'payment_access');
  }
}

export async function syncBillingWalletFromAppBalance(params: {
  userId: number;
  walletBalanceCents: number;
  reason?: string;
}): Promise<{ synced: boolean; desiredCredits: number; priorCredits: number; deltaCredits: number }> {
  const desiredCredits = centsToCredits(params.walletBalanceCents);
  const wallet = await getWalletRecord(params.userId);
  const priorCredits = Math.max(0, Number(wallet.balance_credits ?? 0));

  // Safe sync: only ever add missing balance (never auto-deduct here).
  if (desiredCredits <= priorCredits) {
    return { synced: false, desiredCredits, priorCredits, deltaCredits: 0 };
  }

  const deltaCredits = desiredCredits - priorCredits;
  await queryPg('UPDATE wallets SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [desiredCredits, wallet.id]);

  await appendWalletLedger(params.userId, wallet.id, desiredCredits, {
    entry_type: 'sync',
    credits_delta: deltaCredits,
    reference_type: 'app_db',
    reference_id: String(params.userId),
    note: params.reason || 'Wallet Sync aus App-DB Guthaben',
  });

  return { synced: true, desiredCredits, priorCredits, deltaCredits };
}

export async function getWalletRecord(userId: number): Promise<{ id: number; balance_credits: number; currency_display: string; status: string }> {
  // NOTE: PostgreSQL BIGINT columns often arrive as strings (node-postgres int8).
  const result = await queryPg<{ id: any; balance_credits: any; currency_display: any; status: any }>(
    'SELECT id, balance_credits, currency_display, status FROM wallets WHERE user_id = $1',
    [userId],
  );
  const wallet = result.rows[0];
  if (!wallet) throw new Error('wallet_not_found');
  return {
    id: Number(wallet.id),
    balance_credits: Number(wallet.balance_credits ?? 0),
    currency_display: String(wallet.currency_display ?? ''),
    status: String(wallet.status ?? ''),
  };
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
  const creditsDelta = Number(entry.credits_delta ?? 0);
  if (!Number.isFinite(creditsDelta)) {
    throw new Error('invalid_credits_delta');
  }
  return withPgClient(async (client) => {
    await client.beginTransaction?.();
    try {
      const kind = getBillingDbKind();
      if (kind === 'postgres') {
        const updated = await client.query<{ id: any; balance_credits: any }>(
          `UPDATE wallets
           SET balance_credits = balance_credits + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2
             AND balance_credits + $1 >= 0
           RETURNING id, balance_credits`,
          [creditsDelta, userId],
        );

        if (updated.rowCount === 0) {
          const existing = await client.query<{ id: any }>('SELECT id FROM wallets WHERE user_id = $1 LIMIT 1', [userId]);
          throw new Error(existing.rowCount === 0 ? 'wallet_not_found' : 'insufficient_credits');
        }

        const walletId = Number(updated.rows[0].id);
        const balanceAfter = Number(updated.rows[0].balance_credits ?? 0);
        await client.query(
          `INSERT INTO wallet_ledger
            (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, walletId, entry.entry_type, creditsDelta, balanceAfter, entry.reference_type, entry.reference_id, entry.note],
        );
        await client.commit?.();
        return { balanceAfter, walletId };
      }

      const walletRow = await client.query<{ id: any; balance_credits: any }>(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      if (walletRow.rowCount === 0) throw new Error('wallet_not_found');
      const walletId = Number(walletRow.rows[0].id);
      const prior = Number(walletRow.rows[0].balance_credits ?? 0);
      const balanceAfter = prior + creditsDelta;
      if (balanceAfter < 0) throw new Error('insufficient_credits');

      await client.query('UPDATE wallets SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [balanceAfter, walletId]);
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, walletId, entry.entry_type, creditsDelta, balanceAfter, entry.reference_type, entry.reference_id, entry.note],
      );
      await client.commit?.();
      return { balanceAfter, walletId };
    } catch (error) {
      await client.rollback?.();
      throw error;
    }
  });
}

export async function transferWalletCredits(params: {
  fromUserId: number;
  toUserId: number;
  referenceId?: string;
  note?: string;
}): Promise<{ transferredCredits: number; fromBalanceAfter: number; toBalanceAfter: number }> {
  if (params.fromUserId === params.toUserId) {
    return { transferredCredits: 0, fromBalanceAfter: 0, toBalanceAfter: 0 };
  }

  return withPgClient(async (client) => {
    await client.beginTransaction?.();
    try {
      const ids = [params.fromUserId, params.toUserId].sort((a, b) => a - b);
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
      const rows = await client.query<{ id: any; user_id: any; balance_credits: any }>(
        `SELECT id, user_id, balance_credits FROM wallets WHERE user_id IN (${placeholders}) FOR UPDATE`,
        ids,
      );
      const byUser = new Map<number, { id: number; balance: number }>();
      rows.rows.forEach((row) => {
        byUser.set(Number(row.user_id), { id: Number(row.id), balance: Number(row.balance_credits ?? 0) });
      });

      const fromWallet = byUser.get(params.fromUserId);
      const toWallet = byUser.get(params.toUserId);
      if (!fromWallet || !toWallet) {
        throw new Error('wallet_not_found');
      }

      const transferable = Math.max(0, Math.round(fromWallet.balance));
      if (transferable <= 0) {
        await client.commit?.();
        return { transferredCredits: 0, fromBalanceAfter: fromWallet.balance, toBalanceAfter: toWallet.balance };
      }

      const fromBalanceAfter = Math.max(0, fromWallet.balance - transferable);
      const toBalanceAfter = toWallet.balance + transferable;

      await client.query('UPDATE wallets SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        fromBalanceAfter,
        fromWallet.id,
      ]);
      await client.query('UPDATE wallets SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        toBalanceAfter,
        toWallet.id,
      ]);

      const referenceId = params.referenceId ?? String(params.fromUserId);
      const note = params.note ?? 'Transfer bei Kontoloeschung';
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [params.fromUserId, fromWallet.id, 'adjustment', -transferable, fromBalanceAfter, 'account_delete', referenceId, note],
      );
      await client.query(
        `INSERT INTO wallet_ledger
          (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [params.toUserId, toWallet.id, 'adjustment', transferable, toBalanceAfter, 'account_delete', referenceId, note],
      );

      await client.commit?.();
      return { transferredCredits: transferable, fromBalanceAfter, toBalanceAfter };
    } catch (error) {
      await client.rollback?.();
      throw error;
    }
  });
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
    id: any;
    entry_type: any;
    credits_delta: any;
    balance_after: any;
    reference_type: any;
    reference_id: any;
    note: any;
    created_at: any;
  }>(
    `SELECT id, entry_type, credits_delta, balance_after, reference_type, reference_id, note, created_at
     FROM wallet_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.rows.map((row) => ({
    id: Number(row.id),
    entry_type: String(row.entry_type ?? ''),
    credits_delta: Number(row.credits_delta ?? 0),
    balance_after: Number(row.balance_after ?? 0),
    reference_type: String(row.reference_type ?? ''),
    reference_id: String(row.reference_id ?? ''),
    note: row.note == null ? null : String(row.note),
    created_at: String(row.created_at ?? ''),
  }));
}
