import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getAuthLinkBaseUrl, getCanonicalBaseUrl, getOriginFromRequest } from './public-url';

const tempDir = mkdtempSync(path.join(tmpdir(), 'kitzchat-public-url-'));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env.KITZCHAT_STATE_DIR = tempDir;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  rmSync(tempDir, { recursive: true, force: true });
});

test('getCanonicalBaseUrl defaults to dashboard in production when no env is set', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.APP_URL;
  assert.equal(getCanonicalBaseUrl(), 'https://dashboard.aikitz.at');
});

test('getCanonicalBaseUrl ignores loopback env in production', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  assert.equal(getCanonicalBaseUrl(), 'https://dashboard.aikitz.at');
});

test('getCanonicalBaseUrl respects configured prod base url', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  process.env.PUBLIC_BASE_URL = 'https://dashboard.aikitz.at';
  assert.equal(getCanonicalBaseUrl(), 'https://dashboard.aikitz.at');
});

test('getAuthLinkBaseUrl uses request origin in dev when base is loopback', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  const request = new Request('http://localhost:3005/api/test', {
    headers: { host: 'localhost:3005' },
  });
  assert.equal(getAuthLinkBaseUrl(request), 'http://localhost:3005');
});

test('getOriginFromRequest falls back to canonical base in production for loopback host', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  const request = new Request('http://127.0.0.1/api/test', {
    headers: { host: '127.0.0.1' },
  });
  assert.equal(getOriginFromRequest(request), 'https://dashboard.aikitz.at');
});
