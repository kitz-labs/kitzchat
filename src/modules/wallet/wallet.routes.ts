import { Router } from 'express';
import { getWalletHttp, getWalletLedgerHttp } from './wallet.controller';

export function createWalletRouter(): Router {
  const router = Router();
  router.get('/wallet', getWalletHttp);
  router.get('/wallet/ledger', getWalletLedgerHttp);
  return router;
}
