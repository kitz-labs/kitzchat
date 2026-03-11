import type { Request, Response } from 'express';
import { getWalletLedger, getWalletView } from './wallet.service';

export async function getWalletHttp(req: Request, res: Response) {
  const userId = Number(req.params.userId || req.query.userId);
  const wallet = await getWalletView(userId);
  res.json(wallet);
}

export async function getWalletLedgerHttp(req: Request, res: Response) {
  const userId = Number(req.params.userId || req.query.userId);
  const ledger = await getWalletLedger(userId);
  res.json({ entries: ledger });
}
