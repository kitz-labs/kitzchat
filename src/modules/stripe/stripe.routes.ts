import { Router, text } from 'express';
import { stripeWebhookHttp } from './stripe.webhook.controller';

export function createStripeRouter(): Router {
  const router = Router();
  router.post('/stripe/webhook', text({ type: '*/*' }), stripeWebhookHttp);
  return router;
}
