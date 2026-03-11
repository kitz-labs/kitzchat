import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getDb } from './db';

const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_COST = 16384;
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days

export interface User {
  id: number;
  username: string;
  role: string;
  created_at: string;
  email?: string | null;
  auth_provider?: string | null;
  account_type?: AccountType;
  payment_status?: PaymentStatus;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
  plan_amount_cents?: number | null;
  wallet_balance_cents?: number | null;
  onboarding_completed_at?: string | null;
  next_topup_discount_percent?: number | null;
  completed_payments_count?: number | null;
  accepted_terms_at?: string | null;
}

export interface UserRecord extends User {
  password_hash: string;
}

export type UserRole = 'admin' | 'editor' | 'viewer';
export type AuthProvider = 'local' | 'google';
export type LoginRequestStatus = 'pending' | 'approved' | 'denied';
export type AccountType = 'staff' | 'customer';
export type PaymentStatus = 'not_required' | 'pending' | 'paid';

const USER_SELECT_COLUMNS = 'id, username, role, created_at, email, auth_provider, account_type, payment_status, stripe_customer_id, stripe_checkout_session_id, plan_amount_cents, wallet_balance_cents, onboarding_completed_at, next_topup_discount_percent, completed_payments_count, accepted_terms_at';

export interface GoogleLoginRequest {
  id: number;
  email: string;
  google_sub?: string | null;
  status: LoginRequestStatus;
  requested_role: UserRole;
  attempts: number;
  last_error?: string | null;
  last_attempt_at: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string | null;
}

type UserRoleInput = UserRole | 'operator';

function normalizeRole(value: string): UserRole {
  if (value === 'operator') return 'editor';
  if (value === 'admin' || value === 'editor' || value === 'viewer') return value;
  return 'viewer';
}

function normalizeRoleInput(value: UserRoleInput): UserRole {
  return normalizeRole(value);
}

function normalizeRoleValue(value: unknown, fallback: UserRole = 'viewer'): UserRole {
  if (typeof value !== 'string') return fallback;
  return normalizeRole(value);
}

function normalizeAccountType(value: unknown, fallback: AccountType = 'staff'): AccountType {
  return value === 'customer' ? 'customer' : fallback;
}

function normalizePaymentStatus(value: unknown, fallback: PaymentStatus = 'pending'): PaymentStatus {
  if (value === 'paid' || value === 'pending' || value === 'not_required') return value;
  return fallback;
}

function minimumPasswordLength(): number {
  return process.env.NODE_ENV === 'production' ? 10 : 4;
}

function assertPasswordLength(password: string): void {
  const min = minimumPasswordLength();
  if (!password || password.length < min) {
    throw new Error(`Password must be at least ${min} characters`);
  }
}

function mapUser(row: UserRecord | User | undefined | null): User | null {
  if (!row) return null;
  const enriched = row as UserRecord & {
    email?: string | null;
    auth_provider?: string | null;
    account_type?: AccountType | null;
    payment_status?: PaymentStatus | null;
    stripe_customer_id?: string | null;
    stripe_checkout_session_id?: string | null;
    plan_amount_cents?: number | null;
    wallet_balance_cents?: number | null;
    onboarding_completed_at?: string | null;
    next_topup_discount_percent?: number | null;
    completed_payments_count?: number | null;
    accepted_terms_at?: string | null;
  };
  return {
    id: row.id,
    username: row.username,
    role: normalizeRole(row.role),
    created_at: row.created_at,
    email: enriched.email ?? null,
    auth_provider: enriched.auth_provider ?? 'local',
    account_type: normalizeAccountType(enriched.account_type, row.role === 'admin' || row.role === 'editor' ? 'staff' : 'customer'),
    payment_status: normalizePaymentStatus(enriched.payment_status, row.role === 'admin' || row.role === 'editor' ? 'not_required' : 'pending'),
    stripe_customer_id: enriched.stripe_customer_id ?? null,
    stripe_checkout_session_id: enriched.stripe_checkout_session_id ?? null,
    plan_amount_cents: enriched.plan_amount_cents ?? 0,
    wallet_balance_cents: enriched.wallet_balance_cents ?? 0,
    onboarding_completed_at: enriched.onboarding_completed_at ?? null,
    next_topup_discount_percent: enriched.next_topup_discount_percent ?? 0,
    completed_payments_count: enriched.completed_payments_count ?? 0,
    accepted_terms_at: enriched.accepted_terms_at ?? null,
  };
}

function requireEnv(name: 'AUTH_USER' | 'AUTH_PASS'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function getConfiguredApiKey(): string | null {
  const value = process.env.API_KEY?.trim();
  return value ? value : null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST }).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST });
  const storedBuf = Buffer.from(hash, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

export function ensureAuthTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE TABLE IF NOT EXISTS google_login_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      google_sub TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_role TEXT NOT NULL DEFAULT 'viewer',
      attempts INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_google_login_requests_status ON google_login_requests(status);
  `);

  // Safe column migrations for auth-provider support.
  try {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
  } catch { /* column exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'");
  } catch { /* column exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
  } catch { /* column exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'staff'");
  } catch { /* column exists */ }
  try {
    db.exec("ALTER TABLE users ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required'");
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN stripe_checkout_session_id TEXT');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN plan_amount_cents INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN wallet_balance_cents INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN next_topup_discount_percent INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN completed_payments_count INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE users ADD COLUMN accepted_terms_at DATETIME');
  } catch { /* column exists */ }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  db.exec("UPDATE users SET role = 'editor' WHERE role = 'operator'");
  db.exec("UPDATE google_login_requests SET requested_role = 'editor' WHERE requested_role = 'operator'");
  db.exec("UPDATE users SET account_type = 'staff' WHERE account_type IS NULL OR TRIM(account_type) = ''");
  db.exec("UPDATE users SET payment_status = CASE WHEN role IN ('admin', 'editor') THEN 'not_required' ELSE COALESCE(payment_status, 'pending') END");
  db.exec("UPDATE users SET wallet_balance_cents = CASE WHEN payment_status = 'paid' AND COALESCE(wallet_balance_cents, 0) <= 0 THEN COALESCE(NULLIF(plan_amount_cents, 0), 2000) ELSE COALESCE(wallet_balance_cents, 0) END WHERE account_type = 'customer'");
  db.exec("UPDATE users SET completed_payments_count = CASE WHEN account_type = 'customer' AND payment_status = 'paid' AND COALESCE(completed_payments_count, 0) <= 0 THEN 1 ELSE COALESCE(completed_payments_count, 0) END");
}

function seedStaffUser(username: string, password: string, role: UserRole = 'admin'): void {
  const db = getDb();
  ensureAuthTables();
  if (username.length < 3) {
    throw new Error('AUTH_USER must be at least 3 characters');
  }
  assertPasswordLength(password);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id?: number } | undefined;
  if (existing?.id) return;
  db.prepare('INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents) VALUES (?, ?, ?, ?, ?, ?)').run(
    username,
    hashPassword(password),
    role,
    'staff',
    'not_required',
    0,
  );
}

function seedLocalTestCustomer(): void {
  if (process.env.NODE_ENV === 'production') return;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('test') as { id?: number } | undefined;
  if (existing?.id) {
    db.prepare("UPDATE users SET account_type = 'customer', payment_status = 'paid', plan_amount_cents = 2000, wallet_balance_cents = CASE WHEN COALESCE(wallet_balance_cents, 0) <= 0 THEN 2000 ELSE wallet_balance_cents END, completed_payments_count = CASE WHEN COALESCE(completed_payments_count, 0) <= 0 THEN 1 ELSE completed_payments_count END, next_topup_discount_percent = CASE WHEN COALESCE(completed_payments_count, 0) <= 0 AND COALESCE(next_topup_discount_percent, 0) <= 0 THEN 30 ELSE next_topup_discount_percent END, accepted_terms_at = COALESCE(accepted_terms_at, CURRENT_TIMESTAMP) WHERE id = ?").run(existing.id);
    return;
  }
  db.prepare(
    "INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents, wallet_balance_cents, onboarding_completed_at, next_topup_discount_percent, completed_payments_count, accepted_terms_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)",
  ).run('test', hashPassword('test'), 'viewer', 'customer', 'paid', 2000, 2000, 30, 1);
}

export function seedAdmin(): void {
  const username = requireEnv('AUTH_USER').toLowerCase();
  const password = requireEnv('AUTH_PASS');
  seedStaffUser(username, password, 'admin');
  seedLocalTestCustomer();
}

export function authenticate(username: string, password: string): User | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase()) as UserRecord | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return mapUser(row);
}

export function createSession(userId: number): string {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Math.floor(Date.now() / 1000));
  return token;
}

export function validateSession(token: string): User | null {
  if (!token) return null;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at, u.email, u.auth_provider,
              u.account_type, u.payment_status, u.stripe_customer_id, u.stripe_checkout_session_id,
              u.plan_amount_cents, u.wallet_balance_cents, u.onboarding_completed_at,
              u.next_topup_discount_percent, u.completed_payments_count
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, now) as User | undefined;
  return mapUser(row);
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function listUsers(): User[] {
  ensureAuthTables();
  const db = getDb();
  const rows = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users ORDER BY id ASC`)
    .all() as User[];
  return rows.map((row) => mapUser(row)!).filter(Boolean);
}

export function createUser(username: string, password: string, role: UserRoleInput = 'editor'): User {
  ensureAuthTables();
  const db = getDb();
  const normalized = username.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  assertPasswordLength(password);
  if (!['admin', 'editor', 'viewer', 'operator'].includes(role)) {
    throw new Error('Invalid role');
  }
  const normalizedRole = normalizeRoleInput(role);
  db.prepare('INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents) VALUES (?, ?, ?, ?, ?, ?)').run(
    normalized,
    hashPassword(password),
    normalizedRole,
    'staff',
    normalizedRole === 'viewer' ? 'pending' : 'not_required',
    0,
  );
  const row = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE username = ?`)
    .get(normalized) as User;
  return mapUser(row)!;
}

export function createCustomerUser(username: string, password: string, acceptedTerms = false): User {
  ensureAuthTables();
  const db = getDb();
  const normalized = username.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  assertPasswordLength(password);
  db.prepare(
    acceptedTerms
      ? 'INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents, accepted_terms_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
      : 'INSERT INTO users (username, password_hash, role, account_type, payment_status, plan_amount_cents) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(normalized, hashPassword(password), 'viewer', 'customer', 'pending', 2000);
  const row = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE username = ?`)
    .get(normalized) as User;
  return mapUser(row)!;
}

function parseAllowedList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function ensureGoogleAllowed(email: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();
  const dbRule = db
    .prepare('SELECT status FROM google_login_requests WHERE email = ?')
    .get(normalizedEmail) as { status?: string } | undefined;
  if (dbRule?.status === 'approved') return;
  if (dbRule?.status === 'denied') {
    throw new Error('Google account access denied by admin');
  }
  if (dbRule?.status === 'pending') {
    throw new Error('Access request pending admin approval');
  }

  const allowedEmails = parseAllowedList(process.env.GOOGLE_AUTH_ALLOWED_EMAILS);
  const allowedDomains = parseAllowedList(process.env.GOOGLE_AUTH_ALLOWED_DOMAINS);

  if (allowedEmails.length === 0 && allowedDomains.length === 0) return;

  if (allowedEmails.includes(normalizedEmail)) return;

  const at = normalizedEmail.lastIndexOf('@');
  const domain = at >= 0 ? normalizedEmail.slice(at + 1) : '';
  if (domain && allowedDomains.includes(domain)) return;

  throw new Error('Google account is not allowed; request pending admin approval');
}

function getGoogleDefaultRole(): UserRole {
  const raw = (process.env.GOOGLE_AUTH_DEFAULT_ROLE || 'viewer').trim().toLowerCase();
  return normalizeRole(raw);
}

function getApprovedRequestedRole(email: string): UserRole | null {
  const db = getDb();
  const row = db
    .prepare('SELECT requested_role FROM google_login_requests WHERE email = ? AND status = ?')
    .get(email, 'approved') as { requested_role?: string } | undefined;
  if (!row) return null;
  return normalizeRoleValue(row.requested_role, getGoogleDefaultRole());
}

function makeUsernameFromEmail(email: string): string {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
  return base.length >= 3 ? base : `user${Math.floor(Math.random() * 9000 + 1000)}`;
}

function uniqueUsername(base: string): string {
  const db = getDb();
  const normalizedBase = base.trim().toLowerCase();
  let candidate = normalizedBase;
  let n = 1;
  while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(candidate)) {
    n += 1;
    candidate = `${normalizedBase}${n}`;
  }
  return candidate;
}

export function upsertGoogleUser(googleSub: string, email: string): User {
  ensureAuthTables();
  if (!googleSub?.trim()) throw new Error('Missing Google subject');
  if (!email?.trim()) throw new Error('Missing Google email');

  const normalizedEmail = email.trim().toLowerCase();
  ensureGoogleAllowed(normalizedEmail);
  const db = getDb();

  // Prefer existing link by Google subject.
  const bySub = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE google_sub = ?`)
    .get(googleSub) as User | undefined;
  if (bySub) return mapUser(bySub)!;

  // Link existing account by email if present.
  const byEmail = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE email = ?`)
    .get(normalizedEmail) as User | undefined;
  if (byEmail) {
    db.prepare("UPDATE users SET google_sub = ?, auth_provider = 'google' WHERE id = ?").run(googleSub, byEmail.id);
    const row = db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
      .get(byEmail.id) as User;
    return mapUser(row)!;
  }

  const role = getApprovedRequestedRole(normalizedEmail) ?? getGoogleDefaultRole();
  const username = uniqueUsername(makeUsernameFromEmail(normalizedEmail));
  // Keep password_hash populated even for OAuth users to satisfy schema constraints.
  const pseudoPassword = randomBytes(24).toString('hex');
  db.prepare(
    "INSERT INTO users (username, password_hash, role, email, auth_provider, google_sub) VALUES (?, ?, ?, ?, 'google', ?)",
  ).run(username, hashPassword(pseudoPassword), role, normalizedEmail, googleSub);

  const row = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE username = ?`)
    .get(username) as User;
  return mapUser(row)!;
}

export function recordGoogleLoginAttempt(email: string, googleSub: string | null, reason: string): void {
  ensureAuthTables();
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  db.prepare(
    `INSERT INTO google_login_requests
      (email, google_sub, status, requested_role, attempts, last_error, last_attempt_at, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO UPDATE SET
      google_sub = COALESCE(excluded.google_sub, google_login_requests.google_sub),
      attempts = google_login_requests.attempts + 1,
      last_error = excluded.last_error,
      last_attempt_at = CURRENT_TIMESTAMP,
      status = CASE
        WHEN google_login_requests.status = 'approved' THEN 'approved'
        WHEN google_login_requests.status = 'denied' THEN 'denied'
        ELSE 'pending'
      END,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(normalizedEmail, googleSub, getGoogleDefaultRole(), reason);
}

export function listGoogleLoginRequests(): GoogleLoginRequest[] {
  ensureAuthTables();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, email, google_sub, status, requested_role, attempts, last_error, last_attempt_at, created_at, updated_at, reviewed_at
       FROM google_login_requests
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'denied' THEN 1 ELSE 2 END,
         last_attempt_at DESC`,
    )
    .all() as GoogleLoginRequest[];
  return rows.map((row) => ({
    ...row,
    status: (row.status === 'approved' || row.status === 'denied' || row.status === 'pending') ? row.status : 'pending',
    requested_role: normalizeRoleValue(row.requested_role),
  }));
}

export function reviewGoogleLoginRequest(email: string, action: 'approve' | 'deny', role: UserRole = 'viewer'): void {
  ensureAuthTables();
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Email is required');

  if (action === 'approve') {
    const approvedRole = normalizeRoleValue(role, 'viewer');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO google_login_requests
          (email, status, requested_role, attempts, last_error, last_attempt_at, created_at, updated_at, reviewed_at)
         VALUES (?, 'approved', ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(email) DO UPDATE SET
          status = 'approved',
          requested_role = excluded.requested_role,
          attempts = 0,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP,
          reviewed_at = CURRENT_TIMESTAMP`,
      ).run(normalizedEmail, approvedRole);
      db.prepare('UPDATE users SET role = ? WHERE email = ?').run(approvedRole, normalizedEmail);
    })();
    return;
  }

  db.prepare(
    `INSERT INTO google_login_requests
      (email, status, requested_role, attempts, last_error, last_attempt_at, created_at, updated_at, reviewed_at)
     VALUES (?, 'denied', ?, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO UPDATE SET
      status = 'denied',
      attempts = 0,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP,
      reviewed_at = CURRENT_TIMESTAMP`,
  ).run(normalizedEmail, normalizeRoleValue(role, 'viewer'));
}

export function updateUserRole(userId: number, role: UserRoleInput): void {
  if (!['admin', 'editor', 'viewer', 'operator'].includes(role)) {
    throw new Error('Invalid role');
  }
  const normalizedRole = normalizeRoleInput(role);
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(normalizedRole, userId);
}

export function resetUserPassword(userId: number, password: string): void {
  assertPasswordLength(password);
  const db = getDb();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
}

export function updateStripeCustomer(userId: number, stripeCustomerId: string | null, checkoutSessionId: string | null): void {
  const db = getDb();
  db.prepare('UPDATE users SET stripe_customer_id = ?, stripe_checkout_session_id = ? WHERE id = ?').run(stripeCustomerId, checkoutSessionId, userId);
}

export function markUserPaid(userId: number, checkoutSessionId?: string | null): void {
  const db = getDb();
  db.prepare("UPDATE users SET payment_status = 'paid', stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id), plan_amount_cents = CASE WHEN plan_amount_cents <= 0 THEN 2000 ELSE plan_amount_cents END, wallet_balance_cents = wallet_balance_cents + CASE WHEN plan_amount_cents <= 0 THEN 2000 ELSE plan_amount_cents END WHERE id = ?").run(checkoutSessionId ?? null, userId);
}

export function addUserWalletBalance(userId: number, amountCents: number, checkoutSessionId?: string | null): void {
  const db = getDb();
  db.prepare("UPDATE users SET payment_status = CASE WHEN payment_status = 'not_required' THEN payment_status ELSE 'paid' END, stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id), wallet_balance_cents = wallet_balance_cents + ? WHERE id = ?").run(checkoutSessionId ?? null, amountCents, userId);
}

export function activateCustomerPaymentAccess(userId: number, checkoutSessionId?: string | null, stripeCustomerId?: string | null): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET payment_status = CASE WHEN payment_status = 'not_required' THEN payment_status ELSE 'paid' END, stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id), stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?",
  ).run(checkoutSessionId ?? null, stripeCustomerId ?? null, userId);
}

export function incrementCompletedPayments(userId: number): void {
  getDb().prepare('UPDATE users SET completed_payments_count = COALESCE(completed_payments_count, 0) + 1 WHERE id = ?').run(userId);
}

export function setNextTopupDiscountPercent(userId: number, percent: number): void {
  const normalized = Math.max(0, Math.min(100, Math.round(percent)));
  getDb().prepare('UPDATE users SET next_topup_discount_percent = ? WHERE id = ?').run(normalized, userId);
}

export function updateUserEmail(userId: number, email: string | null): void {
  const normalized = email && email.trim() ? email.trim().toLowerCase() : null;
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Bitte gib eine gueltige E-Mail-Adresse ein');
  }
  getDb().prepare('UPDATE users SET email = ? WHERE id = ?').run(normalized, userId);
}

export function changeUserPassword(userId: number, currentPassword: string, nextPassword: string): void {
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash?: string } | undefined;
  if (!row?.password_hash || !verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('Aktuelles Passwort ist nicht korrekt');
  }
  assertPasswordLength(nextPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(nextPassword), userId);
}

export function completeCustomerOnboarding(userId: number): void {
  const db = getDb();
  db.prepare('UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, CURRENT_TIMESTAMP) WHERE id = ?').run(userId);
}

export function acceptUserTerms(userId: number): void {
  getDb().prepare('UPDATE users SET accepted_terms_at = COALESCE(accepted_terms_at, CURRENT_TIMESTAMP) WHERE id = ?').run(userId);
}

export function getUserById(userId: number): User | null {
  ensureAuthTables();
  const row = getDb()
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
    .get(userId) as User | undefined;
  return mapUser(row);
}

export function userHasAgentAccess(user: Pick<User, 'role' | 'account_type' | 'payment_status'>): boolean {
  if (user.role === 'admin' || user.role === 'editor') return true;
  return user.account_type === 'customer' && user.payment_status === 'paid';
}

export function deleteUser(userId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
}

export function getUserFromRequest(request: Request): User | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)kitzchat-session=([^;]*)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  if (token) {
    const user = validateSession(token);
    if (user) return user;
  }

  const apiKey = request.headers.get('x-api-key');
  const configuredApiKey = getConfiguredApiKey();
  if (apiKey && configuredApiKey && apiKey === configuredApiKey) {
    return { id: 0, username: 'api', role: 'admin', created_at: '', account_type: 'staff', payment_status: 'not_required', plan_amount_cents: 0, wallet_balance_cents: 0, onboarding_completed_at: null, accepted_terms_at: null };
  }

  return null;
}

export function requireUser(request: Request): User {
  const user = getUserFromRequest(request);
  if (!user) {
    throw new Error('unauthorized');
  }
  return user;
}

export function requireAdmin(request: Request): User {
  const user = requireUser(request);
  if (user.role !== 'admin') {
    throw new Error('forbidden');
  }
  return user;
}
