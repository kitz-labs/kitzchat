import type { Request, Response } from 'express';
import { processStripeEvent, verifyStripeWebhook } from './stripe.service';

export async function stripeWebhookHttp(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing stripe signature' });
    return;
  }
  const event = verifyStripeWebhook(String(req.body || ''), signature);
  const result = await processStripeEvent(event);
  res.json(result);
}
