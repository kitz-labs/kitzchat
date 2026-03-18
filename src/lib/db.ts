import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { seedChatMessages } from './seed-chat';
import { getAppStateDir } from './app-state';

const DB_PATH =
  process.env.KITZCHAT_DB_PATH || path.join(getAppStateDir(), 'kitzchat.db');

export function getDbPath(): string {
  return DB_PATH;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
    migrate(_db);
    seedChatMessages(_db);
  }
  return _db;
}

export function resetDbForTests(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      format TEXT NOT NULL,
      pillar INTEGER,
      text_preview TEXT,
      full_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_for DATETIME,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      impressions INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      reposts INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      title TEXT,
      company TEXT,
      company_size TEXT,
      industry_segment TEXT,
      source TEXT,
      email TEXT,
      linkedin_url TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      score INTEGER,
      tier TEXT,
      last_touch_at DATETIME,
      next_action_at DATETIME,
      sequence_name TEXT,
      reply_type TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      sequence_name TEXT,
      step INTEGER,
      subject TEXT,
      body TEXT,
      status TEXT,
      tier TEXT,
      scheduled_for DATETIME,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppression (
      email TEXT PRIMARY KEY,
      type TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS engagements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      action_type TEXT,
      target_url TEXT,
      target_username TEXT,
      our_text TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      type TEXT,
      username TEXT,
      tweet_url TEXT,
      summary TEXT,
      relevance TEXT,
      action_taken TEXT,
      likes INTEGER,
      impressions INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week INTEGER,
      hypothesis TEXT,
      action TEXT,
      metric TEXT,
      win_threshold TEXT,
      status TEXT,
      results TEXT,
      winner TEXT,
      margin TEXT,
      decision TEXT,
      learning TEXT,
      next_action TEXT,
      proposed_at DATETIME,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learning TEXT,
      validated_week INTEGER,
      confidence TEXT,
      applied_to TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      date TEXT PRIMARY KEY,
      x_posts INTEGER DEFAULT 0,
      x_threads INTEGER DEFAULT 0,
      linkedin_drafts INTEGER DEFAULT 0,
      x_replies INTEGER DEFAULT 0,
      x_quote_tweets INTEGER DEFAULT 0,
      x_follows INTEGER DEFAULT 0,
      linkedin_comments INTEGER DEFAULT 0,
      discoveries INTEGER DEFAULT 0,
      enrichments INTEGER DEFAULT 0,
      sends INTEGER DEFAULT 0,
      replies_triaged INTEGER DEFAULT 0,
      opt_outs INTEGER DEFAULT 0,
      bounces INTEGER DEFAULT 0,
      total_impressions INTEGER DEFAULT 0,
      total_engagement INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts DATETIME,
      action TEXT,
      detail TEXT,
      result TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_content_status ON content_posts(status);
    CREATE INDEX IF NOT EXISTS idx_content_platform ON content_posts(platform);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
    CREATE INDEX IF NOT EXISTS idx_sequences_status ON sequences(status);
    CREATE INDEX IF NOT EXISTS idx_sequences_lead ON sequences(lead_id);
    CREATE INDEX IF NOT EXISTS idx_engagements_platform ON engagements(platform);
    CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
    CREATE INDEX IF NOT EXISTS idx_signals_date ON signals(date);
    CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
    CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
    CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(ts);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT,
      message TEXT NOT NULL,
      data TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_support_messages_user_created ON support_messages(user_id, created_at);

    CREATE TABLE IF NOT EXISTS customer_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      enabled_agent_ids TEXT,
      usage_alert_enabled INTEGER NOT NULL DEFAULT 0,
      usage_alert_daily_tokens INTEGER NOT NULL DEFAULT 50000,
      memory_storage_mode TEXT NOT NULL DEFAULT 'state',
      memory_storage_path TEXT,
      docu_provider TEXT,
      docu_root_path TEXT,
      docu_account_email TEXT,
      docu_app_password TEXT,
      docu_api_key TEXT,
      docu_access_token TEXT,
      mail_provider TEXT,
      mail_display_name TEXT,
      mail_address TEXT,
      mail_password TEXT,
      mail_imap_host TEXT,
      mail_imap_port INTEGER NOT NULL DEFAULT 993,
      mail_smtp_host TEXT,
      mail_smtp_port INTEGER NOT NULL DEFAULT 465,
      mail_pop3_host TEXT,
      mail_pop3_port INTEGER NOT NULL DEFAULT 995,
      mail_use_ssl INTEGER NOT NULL DEFAULT 1,
      instagram_username TEXT,
      instagram_password TEXT,
      instagram_graph_api TEXT,
      instagram_user_access_token TEXT,
      instagram_user_id TEXT,
      facebook_page_id TEXT,
      integration_profiles TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_agent_profiles (
      user_id INTEGER NOT NULL REFERENCES users(id),
      agent_id TEXT NOT NULL,
      profile_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS chat_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_uploads_user_created ON chat_uploads(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS seed_registry (
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      PRIMARY KEY (table_name, record_id)
    );


    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      metadata TEXT,
      read_at INTEGER,
      owner_user_id INTEGER,
      owner_username TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_agents ON messages(from_agent, to_agent);

    CREATE TABLE IF NOT EXISTS chat_conversations (
      conversation_id TEXT PRIMARY KEY,
      owner_user_id INTEGER,
      owner_username TEXT,
      agent_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_owner_updated ON chat_conversations(owner_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      agent_id TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_chat_usage_user_created ON chat_usage_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_usage_agent_created ON chat_usage_events(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS session_sync (
      session_file TEXT PRIMARY KEY,
      last_offset INTEGER NOT NULL DEFAULT 0,
      last_synced_at INTEGER
    );

  `);

  // Column migrations (safe to re-run)
  try { db.exec("ALTER TABLE leads ADD COLUMN pause_outreach INTEGER DEFAULT 0"); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE messages ADD COLUMN owner_user_id INTEGER'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE messages ADD COLUMN owner_username TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE support_messages ADD COLUMN read_at DATETIME'); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE customer_preferences ADD COLUMN memory_storage_mode TEXT NOT NULL DEFAULT 'state'"); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN memory_storage_path TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_provider TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_root_path TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_account_email TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_app_password TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_api_key TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN docu_access_token TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_provider TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_display_name TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_address TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_password TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_imap_host TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_imap_port INTEGER NOT NULL DEFAULT 993'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_smtp_host TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_smtp_port INTEGER NOT NULL DEFAULT 465'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_pop3_host TEXT'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_pop3_port INTEGER NOT NULL DEFAULT 995'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN mail_use_ssl INTEGER NOT NULL DEFAULT 1'); } catch { /* column exists */ }
  try { db.exec('ALTER TABLE customer_preferences ADD COLUMN integration_profiles TEXT'); } catch { /* column exists */ }
}
