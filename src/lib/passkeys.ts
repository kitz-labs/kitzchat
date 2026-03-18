import { createHash, randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { ensureAuthTables } from '@/lib/auth';

export type PasskeyListItem = {
  id: number;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type StoredPasskey = {
  id: number;
  user_id: number;
  name: string | null;
  credential_id: string;
  public_key_b64: string;
  counter: number;
  transports_json: string | null;
};

export type PasskeyChallenge = {
  token_hash: string;
  user_id: number | null;
  kind: 'registration' | 'authentication';
  challenge: string;
  rp_id: string;
  origin: string;
  expires_at: number;
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function ensurePasskeyTables(): void {
  ensureAuthTables();
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS passkeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT,
      credential_id TEXT NOT NULL UNIQUE,
      public_key_b64 TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);

    CREATE TABLE IF NOT EXISTS passkey_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      kind TEXT NOT NULL,
      challenge TEXT NOT NULL,
      rp_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires ON passkey_challenges(expires_at);
  `);
}

export function listPasskeysForUser(userId: number): PasskeyListItem[] {
  ensurePasskeyTables();
  const db = getDb();
  const rows = db
    .prepare('SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(userId) as Array<PasskeyListItem>;
  return rows;
}

export function deletePasskeyForUser(userId: number, passkeyId: number): boolean {
  ensurePasskeyTables();
  const db = getDb();
  const info = db
    .prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?')
    .run(passkeyId, userId);
  return info.changes > 0;
}

export function getPasskeyByCredentialId(credentialId: string): StoredPasskey | null {
  ensurePasskeyTables();
  const db = getDb();
  const row = db
    .prepare('SELECT id, user_id, name, credential_id, public_key_b64, counter, transports_json FROM passkeys WHERE credential_id = ?')
    .get(credentialId) as StoredPasskey | undefined;
  return row || null;
}

export function insertPasskey(params: {
  userId: number;
  name: string | null;
  credentialId: string;
  publicKeyB64: string;
  counter: number;
  transportsJson: string | null;
}) {
  ensurePasskeyTables();
  const db = getDb();
  db.prepare(
    'INSERT INTO passkeys (user_id, name, credential_id, public_key_b64, counter, transports_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(params.userId, params.name, params.credentialId, params.publicKeyB64, params.counter, params.transportsJson);
}

export function updatePasskeyCounter(passkeyId: number, counter: number) {
  ensurePasskeyTables();
  getDb()
    .prepare('UPDATE passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(counter, passkeyId);
}

export function createPasskeyChallenge(params: {
  token: string;
  userId: number | null;
  kind: 'registration' | 'authentication';
  challenge: string;
  rpId: string;
  origin: string;
  expiresAt: number;
}) {
  ensurePasskeyTables();
  const tokenHash = sha256Hex(params.token);
  const db = getDb();
  db.prepare(
    'INSERT INTO passkey_challenges (token_hash, user_id, kind, challenge, rp_id, origin, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(tokenHash, params.userId, params.kind, params.challenge, params.rpId, params.origin, params.expiresAt);
}

export function consumePasskeyChallenge(token: string, kind: 'registration' | 'authentication'): PasskeyChallenge | null {
  ensurePasskeyTables();
  const tokenHash = sha256Hex(token);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT token_hash, user_id, kind, challenge, rp_id, origin, expires_at
       FROM passkey_challenges
       WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at >= ?`,
    )
    .get(tokenHash, kind, Math.floor(Date.now() / 1000)) as PasskeyChallenge | undefined;
  if (!row) return null;
  db.prepare('UPDATE passkey_challenges SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);
  return row;
}

export function mintChallengeToken(): string {
  return randomBytes(32).toString('hex');
}

