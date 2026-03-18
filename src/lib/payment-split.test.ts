import test from 'node:test';
import assert from 'node:assert/strict';
import { splitGrossAmountCents } from './payment-split';

test('splitGrossAmountCents keeps exact sum equality', () => {
  const out = splitGrossAmountCents(2000, 0.3);
  assert.equal(out.grossAmountCents, 2000);
  assert.equal(out.adminShareCents + out.usageBudgetCents, 2000);
  assert.equal(out.adminShareCents, 600);
  assert.equal(out.usageBudgetCents, 1400);
});

test('splitGrossAmountCents handles rounding without drifting', () => {
  const out = splitGrossAmountCents(1, 0.3);
  assert.equal(out.adminShareCents + out.usageBudgetCents, 1);
  assert.equal(out.adminShareCents, 0);
  assert.equal(out.usageBudgetCents, 1);
});

test('splitGrossAmountCents clamps invalid ratios', () => {
  assert.deepEqual(splitGrossAmountCents(100, -1), { grossAmountCents: 100, usageBudgetCents: 100, adminShareCents: 0 });
  assert.deepEqual(splitGrossAmountCents(100, 2), { grossAmountCents: 100, usageBudgetCents: 0, adminShareCents: 100 });
});

