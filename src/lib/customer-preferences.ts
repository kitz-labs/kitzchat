import { getAgents } from './agent-config';
import { getDb } from './db';

export type CustomerPreferences = {
  enabled_agent_ids: string[];
  usage_alert_enabled: boolean;
  usage_alert_daily_tokens: number;
  memory_storage_mode: 'state' | 'custom';
  memory_storage_path: string;
  docu_provider: string;
  docu_root_path: string;
  docu_account_email: string;
  docu_app_password: string;
  docu_api_key: string;
  docu_access_token: string;
  docu_connected: boolean;
  mail_provider: string;
  mail_display_name: string;
  mail_address: string;
  mail_password: string;
  mail_imap_host: string;
  mail_imap_port: number;
  mail_smtp_host: string;
  mail_smtp_port: number;
  mail_pop3_host: string;
  mail_pop3_port: number;
  mail_use_ssl: boolean;
  mail_connected: boolean;
  instagram_username: string;
  instagram_password: string;
  instagram_graph_api: string;
  instagram_user_access_token: string;
  instagram_user_id: string;
  facebook_page_id: string;
  instagram_connected: boolean;
};

type CustomerPreferencesRow = {
  user_id: number;
  enabled_agent_ids: string | null;
  usage_alert_enabled: number;
  usage_alert_daily_tokens: number;
  memory_storage_mode: string | null;
  memory_storage_path: string | null;
  docu_provider: string | null;
  docu_root_path: string | null;
  docu_account_email: string | null;
  docu_app_password: string | null;
  docu_api_key: string | null;
  docu_access_token: string | null;
  mail_provider: string | null;
  mail_display_name: string | null;
  mail_address: string | null;
  mail_password: string | null;
  mail_imap_host: string | null;
  mail_imap_port: number;
  mail_smtp_host: string | null;
  mail_smtp_port: number;
  mail_pop3_host: string | null;
  mail_pop3_port: number;
  mail_use_ssl: number;
  instagram_username: string | null;
  instagram_password: string | null;
  instagram_graph_api: string | null;
  instagram_user_access_token: string | null;
  instagram_user_id: string | null;
  facebook_page_id: string | null;
};

function visibleAgentIds(): string[] {
  return getAgents()
    .filter((agent) => agent.customerVisible !== false)
    .map((agent) => agent.id);
}

function normalizeEnabledAgentIds(value: string[] | null | undefined): string[] {
  const allowed = new Set(visibleAgentIds());
  const active = visibleAgentIds().filter((id) => allowed.has(id));
  return active.length > 0 ? active : Array.isArray(value) ? value : [];
}

function parseEnabledAgentIds(value: string | null): string[] {
  if (!value) return visibleAgentIds();
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeEnabledAgentIds(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return visibleAgentIds();
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStorageMode(value: unknown): 'state' | 'custom' {
  return value === 'custom' ? 'custom' : 'state';
}

function normalizePort(value: unknown, fallback: number): number {
  const numberValue = Math.round(Number(value));
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return numberValue;
}

export function isDocuAgentConnected(
  preferences: Pick<CustomerPreferences, 'docu_provider' | 'docu_root_path' | 'docu_account_email' | 'docu_app_password' | 'docu_api_key' | 'docu_access_token' | 'memory_storage_path'>,
): boolean {
  const provider = preferences.docu_provider.trim().toLowerCase();
  if (!provider) return false;
  if (provider === 'lokal') {
    return Boolean(preferences.docu_root_path || preferences.memory_storage_path);
  }
  if (provider === 'owncloud') {
    return Boolean(preferences.docu_root_path && preferences.docu_account_email && preferences.docu_app_password);
  }
  return Boolean(preferences.docu_access_token || preferences.docu_api_key);
}

export function isMailAgentConnected(
  preferences: Pick<CustomerPreferences, 'mail_provider' | 'mail_address' | 'mail_password' | 'mail_imap_host' | 'mail_smtp_host'>,
): boolean {
  const provider = preferences.mail_provider.trim().toLowerCase();
  if (!provider || !preferences.mail_address || !preferences.mail_password) return false;
  if (provider === 'smtp-imap' || provider === 'custom') {
    return Boolean(preferences.mail_imap_host && preferences.mail_smtp_host);
  }
  return true;
}

export function isInstagramConnected(preferences: Pick<CustomerPreferences, 'instagram_username' | 'instagram_password' | 'instagram_graph_api' | 'instagram_user_access_token' | 'instagram_user_id' | 'facebook_page_id'>): boolean {
  return Boolean(
    preferences.instagram_username &&
      preferences.instagram_password &&
      preferences.instagram_graph_api &&
      preferences.instagram_user_access_token &&
      preferences.instagram_user_id &&
      preferences.facebook_page_id,
  );
}

function mapRow(row: CustomerPreferencesRow): CustomerPreferences {
  const preferences: CustomerPreferences = {
    enabled_agent_ids: parseEnabledAgentIds(row.enabled_agent_ids),
    usage_alert_enabled: row.usage_alert_enabled === 1,
    usage_alert_daily_tokens: Math.max(1000, row.usage_alert_daily_tokens || 50000),
    memory_storage_mode: normalizeStorageMode(row.memory_storage_mode),
    memory_storage_path: row.memory_storage_path ?? '',
    docu_provider: row.docu_provider ?? '',
    docu_root_path: row.docu_root_path ?? '',
    docu_account_email: row.docu_account_email ?? '',
    docu_app_password: row.docu_app_password ?? '',
    docu_api_key: row.docu_api_key ?? '',
    docu_access_token: row.docu_access_token ?? '',
    docu_connected: false,
    mail_provider: row.mail_provider ?? '',
    mail_display_name: row.mail_display_name ?? '',
    mail_address: row.mail_address ?? '',
    mail_password: row.mail_password ?? '',
    mail_imap_host: row.mail_imap_host ?? '',
    mail_imap_port: normalizePort(row.mail_imap_port, 993),
    mail_smtp_host: row.mail_smtp_host ?? '',
    mail_smtp_port: normalizePort(row.mail_smtp_port, 465),
    mail_pop3_host: row.mail_pop3_host ?? '',
    mail_pop3_port: normalizePort(row.mail_pop3_port, 995),
    mail_use_ssl: row.mail_use_ssl === 1,
    mail_connected: false,
    instagram_username: row.instagram_username ?? '',
    instagram_password: row.instagram_password ?? '',
    instagram_graph_api: row.instagram_graph_api ?? '',
    instagram_user_access_token: row.instagram_user_access_token ?? '',
    instagram_user_id: row.instagram_user_id ?? '',
    facebook_page_id: row.facebook_page_id ?? '',
    instagram_connected: false,
  };
  preferences.docu_connected = isDocuAgentConnected(preferences);
  preferences.mail_connected = isMailAgentConnected(preferences);
  preferences.instagram_connected = isInstagramConnected(preferences);
  return preferences;
}

export function ensureCustomerPreferences(userId: number): CustomerPreferences {
  const db = getDb();
  const defaultEnabled = JSON.stringify(visibleAgentIds());
  db.prepare(
    `INSERT INTO customer_preferences (user_id, enabled_agent_ids)
     VALUES (?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  ).run(userId, defaultEnabled);

  const row = db
    .prepare(
      `SELECT user_id, enabled_agent_ids, usage_alert_enabled, usage_alert_daily_tokens,
              memory_storage_mode, memory_storage_path,
              docu_provider, docu_root_path, docu_account_email, docu_app_password, docu_api_key, docu_access_token,
              mail_provider, mail_display_name, mail_address, mail_password,
              mail_imap_host, mail_imap_port, mail_smtp_host, mail_smtp_port, mail_pop3_host, mail_pop3_port, mail_use_ssl,
              instagram_username, instagram_password, instagram_graph_api,
              instagram_user_access_token, instagram_user_id, facebook_page_id
       FROM customer_preferences
       WHERE user_id = ?`,
    )
    .get(userId) as CustomerPreferencesRow | undefined;

  if (!row) {
    return mapRow({
      user_id: userId,
      enabled_agent_ids: defaultEnabled,
      usage_alert_enabled: 0,
      usage_alert_daily_tokens: 50000,
      memory_storage_mode: 'state',
      memory_storage_path: null,
      docu_provider: null,
      docu_root_path: null,
      docu_account_email: null,
      docu_app_password: null,
      docu_api_key: null,
      docu_access_token: null,
      mail_provider: null,
      mail_display_name: null,
      mail_address: null,
      mail_password: null,
      mail_imap_host: null,
      mail_imap_port: 993,
      mail_smtp_host: null,
      mail_smtp_port: 465,
      mail_pop3_host: null,
      mail_pop3_port: 995,
      mail_use_ssl: 1,
      instagram_username: null,
      instagram_password: null,
      instagram_graph_api: null,
      instagram_user_access_token: null,
      instagram_user_id: null,
      facebook_page_id: null,
    });
  }

  const mapped = mapRow(row);
  const normalizedEnabled = normalizeEnabledAgentIds(mapped.enabled_agent_ids);
  if (JSON.stringify(normalizedEnabled) !== JSON.stringify(mapped.enabled_agent_ids)) {
    db.prepare('UPDATE customer_preferences SET enabled_agent_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(JSON.stringify(normalizedEnabled), userId);
    mapped.enabled_agent_ids = normalizedEnabled;
  }
  return mapped;
}

export function updateCustomerPreferences(userId: number, updates: Partial<CustomerPreferences>): CustomerPreferences {
  const current = ensureCustomerPreferences(userId);
  const next: CustomerPreferences = {
    enabled_agent_ids: normalizeEnabledAgentIds(updates.enabled_agent_ids ?? current.enabled_agent_ids),
    usage_alert_enabled: typeof updates.usage_alert_enabled === 'boolean' ? updates.usage_alert_enabled : current.usage_alert_enabled,
    usage_alert_daily_tokens: Math.max(1000, Math.round(Number(updates.usage_alert_daily_tokens ?? current.usage_alert_daily_tokens ?? 50000))),
    memory_storage_mode: normalizeStorageMode(updates.memory_storage_mode ?? current.memory_storage_mode),
    memory_storage_path: normalizeText(updates.memory_storage_path ?? current.memory_storage_path),
    docu_provider: normalizeText(updates.docu_provider ?? current.docu_provider),
    docu_root_path: normalizeText(updates.docu_root_path ?? current.docu_root_path),
    docu_account_email: normalizeText(updates.docu_account_email ?? current.docu_account_email),
    docu_app_password: normalizeText(updates.docu_app_password ?? current.docu_app_password),
    docu_api_key: normalizeText(updates.docu_api_key ?? current.docu_api_key),
    docu_access_token: normalizeText(updates.docu_access_token ?? current.docu_access_token),
    docu_connected: false,
    mail_provider: normalizeText(updates.mail_provider ?? current.mail_provider),
    mail_display_name: normalizeText(updates.mail_display_name ?? current.mail_display_name),
    mail_address: normalizeText(updates.mail_address ?? current.mail_address),
    mail_password: normalizeText(updates.mail_password ?? current.mail_password),
    mail_imap_host: normalizeText(updates.mail_imap_host ?? current.mail_imap_host),
    mail_imap_port: normalizePort(updates.mail_imap_port ?? current.mail_imap_port, 993),
    mail_smtp_host: normalizeText(updates.mail_smtp_host ?? current.mail_smtp_host),
    mail_smtp_port: normalizePort(updates.mail_smtp_port ?? current.mail_smtp_port, 465),
    mail_pop3_host: normalizeText(updates.mail_pop3_host ?? current.mail_pop3_host),
    mail_pop3_port: normalizePort(updates.mail_pop3_port ?? current.mail_pop3_port, 995),
    mail_use_ssl: typeof updates.mail_use_ssl === 'boolean' ? updates.mail_use_ssl : current.mail_use_ssl,
    mail_connected: false,
    instagram_username: normalizeText(updates.instagram_username ?? current.instagram_username),
    instagram_password: normalizeText(updates.instagram_password ?? current.instagram_password),
    instagram_graph_api: normalizeText(updates.instagram_graph_api ?? current.instagram_graph_api),
    instagram_user_access_token: normalizeText(updates.instagram_user_access_token ?? current.instagram_user_access_token),
    instagram_user_id: normalizeText(updates.instagram_user_id ?? current.instagram_user_id),
    facebook_page_id: normalizeText(updates.facebook_page_id ?? current.facebook_page_id),
    instagram_connected: false,
  };
  next.docu_connected = isDocuAgentConnected(next);
  next.mail_connected = isMailAgentConnected(next);
  next.instagram_connected = isInstagramConnected(next);

  getDb()
    .prepare(
      `UPDATE customer_preferences
       SET enabled_agent_ids = ?,
           usage_alert_enabled = ?,
           usage_alert_daily_tokens = ?,
           memory_storage_mode = ?,
           memory_storage_path = ?,
           docu_provider = ?,
           docu_root_path = ?,
           docu_account_email = ?,
           docu_app_password = ?,
           docu_api_key = ?,
           docu_access_token = ?,
           mail_provider = ?,
           mail_display_name = ?,
           mail_address = ?,
           mail_password = ?,
           mail_imap_host = ?,
           mail_imap_port = ?,
           mail_smtp_host = ?,
           mail_smtp_port = ?,
           mail_pop3_host = ?,
           mail_pop3_port = ?,
           mail_use_ssl = ?,
           instagram_username = ?,
           instagram_password = ?,
           instagram_graph_api = ?,
           instagram_user_access_token = ?,
           instagram_user_id = ?,
           facebook_page_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(
      JSON.stringify(next.enabled_agent_ids),
      next.usage_alert_enabled ? 1 : 0,
      next.usage_alert_daily_tokens,
      next.memory_storage_mode,
      next.memory_storage_path || null,
      next.docu_provider || null,
      next.docu_root_path || null,
      next.docu_account_email || null,
      next.docu_app_password || null,
      next.docu_api_key || null,
      next.docu_access_token || null,
      next.mail_provider || null,
      next.mail_display_name || null,
      next.mail_address || null,
      next.mail_password || null,
      next.mail_imap_host || null,
      next.mail_imap_port,
      next.mail_smtp_host || null,
      next.mail_smtp_port,
      next.mail_pop3_host || null,
      next.mail_pop3_port,
      next.mail_use_ssl ? 1 : 0,
      next.instagram_username || null,
      next.instagram_password || null,
      next.instagram_graph_api || null,
      next.instagram_user_access_token || null,
      next.instagram_user_id || null,
      next.facebook_page_id || null,
      userId,
    );

  return next;
}