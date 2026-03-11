import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'kitzchat-cron-templates-test-'));
const dbPath = path.join(tempDir, 'kitzchat-test.db');
process.env.KITZCHAT_DB_PATH = dbPath;

import { resetDbForTests } from './db';
import { createCronTemplate, deleteCronTemplate, listCronTemplates, updateCronTemplate } from './cron-templates';

beforeEach(() => {
  resetDbForTests();
});

after(() => {
  resetDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test('cron templates create/list/update/delete', () => {
  const created = createCronTemplate({
    name: 'Morning research',
    description: 'Template for research crons',
    job: { id: 'x', agentId: 'marketing', schedule: { expr: '0 9 * * 1-5' }, payload: { kind: 'agentTurn', message: 'hi' } },
  });
  assert.ok(created.id);
  assert.equal(created.name, 'Morning research');

  const list1 = listCronTemplates(10);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].name, 'Morning research');

  const updated = updateCronTemplate({
    id: created.id,
    name: 'Morning research v2',
    job: { id: 'y', agentId: 'marketing', payload: { kind: 'agentTurn', message: 'hello' } },
  });
  assert.equal(updated.name, 'Morning research v2');
  assert.match(updated.job_json, /"message": "hello"/);

  deleteCronTemplate(created.id);
  const list2 = listCronTemplates(10);
  assert.equal(list2.length, 0);
});

