import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretEncryptionAvailable } from './secret-store';

const previousEncryptionKey = process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY;
const previousApiKey = process.env.API_KEY;

afterEach(() => {
  if (previousEncryptionKey === undefined) {
    delete process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY = previousEncryptionKey;
  }

  if (previousApiKey === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = previousApiKey;
  }
});

test('encryptSecret round-trips with explicit encryption key', () => {
  process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY = 'phase2-secret-key';
  process.env.API_KEY = 'api-fallback';

  const encrypted = encryptSecret('top-secret');
  assert.notEqual(encrypted, 'top-secret');
  assert.equal(isEncryptedSecret(encrypted), true);
  assert.equal(decryptSecret(encrypted), 'top-secret');
});

test('encryptSecret falls back to API_KEY when dedicated key is unset', () => {
  delete process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY;
  process.env.API_KEY = 'fallback-only';

  assert.equal(isSecretEncryptionAvailable(), true);
  const encrypted = encryptSecret('abc123');
  assert.equal(isEncryptedSecret(encrypted), true);
  assert.equal(decryptSecret(encrypted), 'abc123');
});

test('encryptSecret leaves plaintext unchanged when no secret is configured', () => {
  delete process.env.KITZCHAT_SETTINGS_ENCRYPTION_KEY;
  delete process.env.API_KEY;

  const stored = encryptSecret('legacy-value');
  assert.equal(stored, 'legacy-value');
  assert.equal(decryptSecret(stored), 'legacy-value');
});
