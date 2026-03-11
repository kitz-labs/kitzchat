import type { Request, Response } from 'express';
import { createCheckoutSession, getSessionStatus, getTopupOffers, getUiMessages } from './billing.service';

export async function createCheckoutSessionHttp(req: Request, res: Response) {
  const { userId, email, name, stripeCustomerId, preset, amountEur, returnUrlBase } = req.body as Record<string, unknown>;
  const result = await createCheckoutSession({
    userId: Number(userId),
    email: typeof email === 'string' ? email : null,
    name: String(name || 'Customer'),
    stripeCustomerId: typeof stripeCustomerId === 'string' ? stripeCustomerId : null,
    preset: typeof preset === 'string' ? preset : undefined,
    amountEur: Number(amountEur ?? 0),
    returnUrlBase: typeof returnUrlBase === 'string' ? returnUrlBase : undefined,
  });
  res.json(result);
}

export async function getSessionStatusHttp(req: Request, res: Response) {
  const sessionId = String(req.query.session_id || '');
  res.json(await getSessionStatus(sessionId));
}

export async function getTopupOffersHttp(_req: Request, res: Response) {
  res.json({ offers: await getTopupOffers() });
}

export async function getUiMessagesHttp(req: Request, res: Response) {
  const contextArea = typeof req.query.context === 'string' ? req.query.context : undefined;
  res.json({ messages: await getUiMessages(contextArea) });
}
