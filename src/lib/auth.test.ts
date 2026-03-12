import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'kitzchat-auth-test-'));
const dbPath = path.join(tempDir, 'kitzchat-test.db');

process.env.KITZCHAT_DB_PATH = dbPath;
process.env.AUTH_USER = 'admin_test';
process.env.AUTH_PASS = 'super-secure-pass';
process.env.API_KEY = 'test-api-key';

import { getDb, resetDbForTests } from './db';
import {
  authenticate,
  createSession,
  destroySession,
  ensureAuthTables,
  getUserFromRequest,
  listGoogleLoginRequests,
  recordGoogleLoginAttempt,
  requireUser,
  reviewGoogleLoginRequest,
  seedAdmin,
  validateSession,
} from './auth';

function insertUser(username: string, passwordHash = 'salt:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', role = 'admin') {
  const db = getDb();
  db.prepare("INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents) VALUES (?, ?, ?, 'staff', 'not_required', 0)").run(
    username,
    passwordHash,
    role,
  );
}

function resetAuthState() {
  ensureAuthTables();
  const db = getDb();
  db.exec(`
    DELETE FROM billing_events;
    DELETE FROM support_messages;
    DELETE FROM customer_preferences;
    DELETE FROM chat_uploads;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM google_login_requests;
  `);
}

beforeEach(() => {
  resetAuthState();
});

after(() => {
  resetDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test('seedAdmin requires AUTH_USER and AUTH_PASS when users table is empty', () => {
  const previousUser = process.env.AUTH_USER;
  const previousPass = process.env.AUTH_PASS;
  delete process.env.AUTH_USER;
  delete process.env.AUTH_PASS;

  assert.throws(() => seedAdmin(), /AUTH_USER must be set/);

  process.env.AUTH_USER = previousUser;
  process.env.AUTH_PASS = previousPass;
});

test('seedAdmin creates initial admin and authenticate succeeds', () => {
  seedAdmin();
  const user = authenticate('admin_test', 'super-secure-pass');
  assert.ok(user);
  assert.equal(user.username, 'admin_test');
  assert.equal(user.role, 'admin');
});

test('seedAdmin does not fail when configured admin already exists but AUTH_PASS is short', () => {
  insertUser('admin_test');
  const previousPass = process.env.AUTH_PASS;
  process.env.AUTH_PASS = 'short';

  assert.doesNotThrow(() => seedAdmin());

  process.env.AUTH_PASS = previousPass;
});

test('seedAdmin does not require AUTH_USER and AUTH_PASS when users already exist', () => {
  insertUser('existing-admin');
  const previousUser = process.env.AUTH_USER;
  const previousPass = process.env.AUTH_PASS;
  delete process.env.AUTH_USER;
  delete process.env.AUTH_PASS;

  assert.doesNotThrow(() => seedAdmin());

  process.env.AUTH_USER = previousUser;
  process.env.AUTH_PASS = previousPass;
});

test('session lifecycle validates and invalidates correctly', () => {
  seedAdmin();
  const user = authenticate('admin_test', 'super-secure-pass');
  assert.ok(user);

  const token = createSession(user.id);
  const validated = validateSession(token);
  assert.ok(validated);
  assert.equal(validated.username, user.username);

  destroySession(token);
  assert.equal(validateSession(token), null);
});

test('requireUser throws on invalid session cookie', () => {
  const request = new Request('http://localhost/api/test', {
    headers: { cookie: 'kitzchat-session=invalid-token' },
  });

  assert.equal(getUserFromRequest(request), null);
  assert.throws(() => requireUser(request), /unauthorized/);
});

test('x-api-key auth only works when API_KEY is configured and matches', () => {
  const request = new Request('http://localhost/api/test', {
    headers: { 'x-api-key': 'test-api-key' },
  });
  const user = getUserFromRequest(request);
  assert.ok(user);
  assert.equal(user.username, 'api');

  const previous = process.env.API_KEY;
  delete process.env.API_KEY;
  assert.equal(getUserFromRequest(request), null);
  process.env.API_KEY = previous;
});

test('reviewing login requests clears stale pending error metadata', () => {
  recordGoogleLoginAttempt('user@example.com', 'sub-123', 'Google account is not allowed; request pending admin approval');

  let rows = listGoogleLoginRequests();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].attempts, 1);
  assert.match(rows[0].last_error ?? '', /pending admin approval/);

  reviewGoogleLoginRequest('user@example.com', 'approve', 'admin');
  rows = listGoogleLoginRequests();

  assert.equal(rows[0].status, 'approved');
  assert.equal(rows[0].requested_role, 'admin');
  assert.equal(rows[0].attempts, 0);
  assert.equal(rows[0].last_error, null);

  reviewGoogleLoginRequest('user@example.com', 'deny', 'viewer');
  rows = listGoogleLoginRequests();

  assert.equal(rows[0].status, 'denied');
  assert.equal(rows[0].attempts, 0);
  assert.equal(rows[0].last_error, null);
});
