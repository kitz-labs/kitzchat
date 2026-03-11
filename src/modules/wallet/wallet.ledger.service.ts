import { queryPg } from '@/config/db';

export type WalletLedgerEntry = {
  entry_type: 'topup' | 'usage' | 'refund' | 'bonus' | 'adjustment';
  credits_delta: number;
  reference_type: string;
  reference_id: string;
  note: string;
};

export async function appendWalletLedger(
  userId: number,
  walletId: number,
  balanceAfter: number,
  entry: WalletLedgerEntry,
): Promise<void> {
  await queryPg(
    `INSERT INTO wallet_ledger
      (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, walletId, entry.entry_type, entry.credits_delta, balanceAfter, entry.reference_type, entry.reference_id, entry.note],
  );
}
