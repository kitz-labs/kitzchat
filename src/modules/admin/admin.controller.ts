import type { Request, Response } from 'express';
import { createTopupOffer } from './admin.service';

export async function postTopupOfferHttp(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const created = await createTopupOffer({
    offerCode: String(body.offerCode || body.offer_code || ''),
    name: String(body.name || ''),
    amountEur: Number(body.amountEur ?? body.amount_eur ?? 0),
    credits: Number(body.credits ?? 0),
    bonusCredits: Number(body.bonusCredits ?? body.bonus_credits ?? 0),
    active: body.active !== false,
    sortOrder: Number(body.sortOrder ?? body.sort_order ?? 1),
    marketingLabel: typeof body.marketingLabel === 'string' ? body.marketingLabel : typeof body.marketing_label === 'string' ? body.marketing_label : null,
  });
  res.status(201).json(created);
}
