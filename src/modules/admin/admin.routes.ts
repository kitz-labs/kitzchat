import { Router } from 'express';
import { postTopupOfferHttp } from './admin.controller';

export function createAdminRouter(): Router {
  const router = Router();
  router.post('/admin/topup-offers', postTopupOfferHttp);
  return router;
}
