import { Router } from 'express';
import { createCheckoutSessionHttp, getSessionStatusHttp, getTopupOffersHttp, getUiMessagesHttp } from './billing.controller';

export function createBillingRouter(): Router {
  const router = Router();
  router.post('/billing/create-checkout-session', createCheckoutSessionHttp);
  router.get('/billing/session-status', getSessionStatusHttp);
  router.get('/topup-offers', getTopupOffersHttp);
  router.get('/ui/messages', getUiMessagesHttp);
  return router;
}
