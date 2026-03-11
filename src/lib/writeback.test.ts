import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'kitzchat-writeback-test-'));
process.env.KITZCHAT_STATE_DIR = tempDir;

import { writebackLeadCreate, writebackLeadDelete, writebackLeadUpdate } from './writeback';

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

test('writebackLeadCreate creates leads.json when missing and upserts by id', () => {
  writebackLeadCreate({ id: 'lead_x', first_name: 'A', status: 'new' });
  const data1 = JSON.parse(readFileSync(path.join(tempDir, 'leads.json'), 'utf-8'));
  assert.equal(Array.isArray(data1), true);
  assert.equal(data1.length, 1);
  assert.equal(data1[0].id, 'lead_x');

  writebackLeadCreate({ id: 'lead_x', first_name: 'B', status: 'approved' });
  const data2 = JSON.parse(readFileSync(path.join(tempDir, 'leads.json'), 'utf-8'));
  assert.equal(data2.length, 1);
  assert.equal(data2[0].first_name, 'B');
  assert.equal(data2[0].status, 'approved');
});

test('writebackLeadUpdate updates an existing lead', () => {
  writeFileSync(path.join(tempDir, 'leads.json'), JSON.stringify([{ id: 'lead_y', status: 'new' }], null, 2));
  writebackLeadUpdate('lead_y', { status: 'contacted', notes: 'hi' });
  const data = JSON.parse(readFileSync(path.join(tempDir, 'leads.json'), 'utf-8'));
  assert.equal(data[0].status, 'contacted');
  assert.equal(data[0].notes, 'hi');
});

test('writebackLeadDelete removes an existing lead', () => {
  writeFileSync(path.join(tempDir, 'leads.json'), JSON.stringify([{ id: 'lead_z' }, { id: 'lead_a' }], null, 2));
  writebackLeadDelete('lead_z');
  const data = JSON.parse(readFileSync(path.join(tempDir, 'leads.json'), 'utf-8'));
  assert.equal(data.length, 1);
  assert.equal(data[0].id, 'lead_a');
});

