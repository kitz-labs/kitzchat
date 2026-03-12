import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeWalletPayload } from './wallet-payload';

test('normalizeWalletPayload returns null for error payloads', () => {
  assert.equal(normalizeWalletPayload({ error: 'Failed to load wallet' }), null);
});

test('normalizeWalletPayload fills safe defaults for partial payloads', () => {
  assert.deepEqual(normalizeWalletPayload({ premiumModeMessage: 'Aktiv' }), {
    premiumModeMessage: 'Aktiv',
    balance: 0,
    currencyDisplay: 'Credits',
    status: 'inactive',
    lowBalanceWarning: false,
  });
});

test('normalizeWalletPayload preserves valid wallet fields', () => {
  assert.deepEqual(
    normalizeWalletPayload({
      balance: 2500,
      currencyDisplay: 'Credits',
      status: 'active',
      lowBalanceWarning: true,
      premiumModeMessage: 'Auto-Optimierung aktiv',
    }),
    {
      balance: 2500,
      currencyDisplay: 'Credits',
      status: 'active',
      lowBalanceWarning: true,
      premiumModeMessage: 'Auto-Optimierung aktiv',
    },
  );
});