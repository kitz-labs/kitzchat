import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centsToCredits, creditsToCents, creditsToEur, eurToCredits } from './credits';

test('credits conversions are consistent with default multiplier', () => {
  // 20.00 EUR -> 20_000 credits -> 2_000 cents
  assert.equal(eurToCredits(20), 20000);
  assert.equal(centsToCredits(2000), 20000);
  assert.equal(creditsToCents(20000), 2000);
  assert.equal(creditsToEur(20000), 20);
});

test('creditsToCents rounds consistently', () => {
  // With multiplier=1000, 1 credit == 0.001 EUR == 0.1 cents -> rounds to 0 cents.
  assert.equal(creditsToCents(1), 0);
  assert.equal(creditsToCents(5), 1);
  assert.equal(creditsToCents(15), 2);
});

