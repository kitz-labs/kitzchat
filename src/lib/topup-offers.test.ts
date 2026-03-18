import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeTopupOfferRow } from '../modules/billing/billing.service';

test('normalizeTopupOfferRow maps snake_case to camelCase safely', () => {
  const row = {
    id: 7,
    offer_code: 'starter',
    name: 'Starter',
    amount_eur: 20,
    credits: 20000,
    bonus_credits: 1000,
    active: 1,
    sort_order: 2,
    marketing_label: 'Top Seller',
  };

  const normalized = normalizeTopupOfferRow(row);
  assert.equal(normalized.offerCode, 'starter');
  assert.equal(normalized.offer_code, 'starter');
  assert.equal(normalized.amountEur, 20);
  assert.equal(normalized.amount_eur, 20);
  assert.equal(normalized.bonusCredits, 1000);
  assert.equal(normalized.bonus_credits, 1000);
  assert.equal(normalized.sortOrder, 2);
  assert.equal(normalized.sort_order, 2);
  assert.equal(normalized.active, true);
});
