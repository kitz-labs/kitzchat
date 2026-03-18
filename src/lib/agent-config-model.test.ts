import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAgentCatalog, updateAgentCatalogEntry } from './agent-config';

test('Agent catalog model selection persists via workspace config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitzchat-agent-model-'));
  const prevRoot = process.env.KITZCHAT_WORKSPACE_ROOT;
  const prevDefault = process.env.KITZCHAT_DEFAULT_INSTANCE;

  try {
    process.env.KITZCHAT_WORKSPACE_ROOT = tmp;
    process.env.KITZCHAT_DEFAULT_INSTANCE = 'test';

    const before = loadAgentCatalog();
    const main = before.find((agent) => agent.id === 'main');
    assert.ok(main, 'expected agent "main" to exist in catalog');

    const updated = updateAgentCatalogEntry(undefined, 'main', { model: 'gpt-4.1' });
    assert.ok(updated, 'update should return agent');
    assert.equal(updated?.model, 'gpt-4.1');

    const after = loadAgentCatalog();
    const reloaded = after.find((agent) => agent.id === 'main');
    assert.ok(reloaded);
    assert.equal(reloaded?.model, 'gpt-4.1');
  } finally {
    process.env.KITZCHAT_WORKSPACE_ROOT = prevRoot;
    process.env.KITZCHAT_DEFAULT_INSTANCE = prevDefault;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

