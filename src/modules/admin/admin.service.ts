import { queryPg } from '@/config/db';

export async function createTopupOffer(params: {
  offerCode: string;
  name: string;
  amountEur: number;
  credits: number;
  bonusCredits: number;
  active: boolean;
  sortOrder: number;
  marketingLabel?: string | null;
}) {
  await queryPg(
    `INSERT INTO topup_offers (offer_code, name, amount_eur, credits, bonus_credits, active, sort_order, marketing_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON DUPLICATE KEY UPDATE name = VALUES(name), amount_eur = VALUES(amount_eur), credits = VALUES(credits), bonus_credits = VALUES(bonus_credits), active = VALUES(active), sort_order = VALUES(sort_order), marketing_label = VALUES(marketing_label)`,
    [params.offerCode, params.name, params.amountEur, params.credits, params.bonusCredits, params.active, params.sortOrder, params.marketingLabel ?? null],
  );
  const lookup = await queryPg<{
    id: number;
    offer_code: string;
  }>('SELECT id, offer_code FROM topup_offers WHERE offer_code = $1 LIMIT 1', [params.offerCode]);
  return lookup.rows[0];
}
