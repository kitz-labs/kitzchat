import { getDb } from '@/lib/db';
import { buildAgentProfilePromptSnippet, sanitizeAgentProfileInput } from '@/lib/customer-agent-profile-schema';

export type CustomerAgentProfileRecord = {
  user_id: number;
  agent_id: string;
  profile: Record<string, unknown>;
  updated_at: string | null;
};

export function ensureCustomerAgentProfileTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_agent_profiles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_agent_profiles_user ON customer_agent_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_customer_agent_profiles_agent ON customer_agent_profiles(agent_id);
  `);
}

export function getCustomerAgentProfile(userId: number, agentId: string): CustomerAgentProfileRecord {
  ensureCustomerAgentProfileTables();
  const db = getDb();
  const row = db.prepare(
    'SELECT user_id, agent_id, profile_json, updated_at FROM customer_agent_profiles WHERE user_id = ? AND agent_id = ?',
  ).get(userId, agentId) as { user_id: number; agent_id: string; profile_json: string; updated_at?: string | null } | undefined;

  if (!row) {
    return { user_id: userId, agent_id: agentId, profile: {}, updated_at: null };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = row.profile_json ? (JSON.parse(row.profile_json) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  return { user_id: userId, agent_id: agentId, profile: parsed ?? {}, updated_at: row.updated_at ?? null };
}

export function upsertCustomerAgentProfile(userId: number, agentId: string, input: unknown): CustomerAgentProfileRecord {
  ensureCustomerAgentProfileTables();
  const db = getDb();
  const sanitized = sanitizeAgentProfileInput(agentId, input);
  const payload = JSON.stringify(sanitized ?? {});
  db.prepare(
    `INSERT INTO customer_agent_profiles (user_id, agent_id, profile_json, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, agent_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = CURRENT_TIMESTAMP`,
  ).run(userId, agentId, payload);

  return getCustomerAgentProfile(userId, agentId);
}

export function buildCustomerAgentProfileSnippet(userId: number, agentId: string): string {
  const record = getCustomerAgentProfile(userId, agentId);
  return buildAgentProfilePromptSnippet(agentId, record.profile);
}

