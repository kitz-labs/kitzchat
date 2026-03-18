import fs from 'fs';
import path from 'path';
import { getAppStateDir } from '@/lib/app-state';

function getSettingsFilePath(): string {
  return path.join(getAppStateDir(), 'app-settings.json');
}

let didAttemptLegacyMigration = false;

function readJsonFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, { encoding: 'utf8' });
  return JSON.parse(raw || '{}');
}

function maybeMigrateLegacySettingsFile() {
  if (didAttemptLegacyMigration) return;
  didAttemptLegacyMigration = true;

  const canonicalPath = getSettingsFilePath();
  const legacyPath = path.join(process.cwd(), 'state', 'app-settings.json');

  try {
    if (path.resolve(canonicalPath) === path.resolve(legacyPath)) return;
    if (!fs.existsSync(legacyPath)) return;

    const legacy = (() => {
      try {
        return readJsonFile(legacyPath) || {};
      } catch {
        return {};
      }
    })();
    const legacyHasData = legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0;
    if (!legacyHasData) return;

    const canonicalDir = path.dirname(canonicalPath);
    if (!fs.existsSync(canonicalDir)) fs.mkdirSync(canonicalDir, { recursive: true });
    const current = fs.existsSync(canonicalPath)
      ? (() => {
          try {
            return readJsonFile(canonicalPath) || {};
          } catch {
            return {};
          }
        })()
      : {};

    const merged: any = { ...legacy, ...current };
    const legacyEmail = legacy?.email && typeof legacy.email === 'object' ? legacy.email : {};
    const currentEmail = current?.email && typeof current.email === 'object' ? current.email : {};
    if (Object.keys(legacyEmail).length || Object.keys(currentEmail).length) {
      merged.email = { ...legacyEmail, ...currentEmail };
    }

    fs.writeFileSync(canonicalPath, JSON.stringify(merged, null, 2), { encoding: 'utf8' });
  } catch {
    // ignore
  }
}

export type AppSettings = {
  allow_user_deletion?: boolean;
  allow_policy_write?: boolean;
  allow_cron_write?: boolean;
  allow_workspace_write?: boolean;
  allow_user_registration?: boolean;
  allow_stripe_write?: boolean;
  public_base_url?: string;
  branding?: {
    logo_updated_at?: string;
    favicon_updated_at?: string;
    icon_updated_at?: string;
  };
  email?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    from?: string;
    signature_html?: string;
    signature_text?: string;
  };
  telegram?: {
    enabled?: boolean;
    bot_token?: string;
    chat_id?: string;
  };
  openai?: {
    usd_to_eur?: number;
    credit_balance_override_usd?: number;
    prepaid_topups?: Array<{
      id: string;
      purchased_at: string; // ISO
      amount_usd: number;
      note?: string;
      reference?: string;
      created_at?: string; // ISO
    }>;
  };
  website?: {
    ftp?: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      root_dir?: string;
    };
  };
};

function ensureSettingsFile() {
  try {
    const filePath = getSettingsFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}), { encoding: 'utf8' });
  } catch (err) {
    // ignore
  }
}

export function readSettings(): AppSettings {
  try {
    maybeMigrateLegacySettingsFile();
    ensureSettingsFile();
    return (readJsonFile(getSettingsFilePath()) || {}) as AppSettings;
  } catch (err) {
    return {};
  }
}

export function writeSettings(settings: AppSettings) {
  try {
    ensureSettingsFile();
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(settings || {}, null, 2), { encoding: 'utf8' });
    return true;
  } catch (err) {
    return false;
  }
}

export function getAllowUserDeletion(): boolean {
  const s = readSettings();
  return !!s.allow_user_deletion;
}

export function setAllowUserDeletion(value: boolean) {
  const s = readSettings();
  s.allow_user_deletion = !!value;
  return writeSettings(s);
}

export function getAllowPolicyWrite(): boolean {
  const s = readSettings();
  return !!s.allow_policy_write;
}

export function setAllowPolicyWrite(value: boolean) {
  const s = readSettings();
  s.allow_policy_write = !!value;
  return writeSettings(s);
}

export function getAllowCronWrite(): boolean {
  const s = readSettings();
  return !!s.allow_cron_write;
}

export function setAllowCronWrite(value: boolean) {
  const s = readSettings();
  s.allow_cron_write = !!value;
  return writeSettings(s);
}

export function getAllowWorkspaceWrite(): boolean {
  const s = readSettings();
  return !!s.allow_workspace_write;
}

export function setAllowWorkspaceWrite(value: boolean) {
  const s = readSettings();
  s.allow_workspace_write = !!value;
  return writeSettings(s);
}

export function getAllowUserRegistration(): boolean {
  const s = readSettings();
  return !!s.allow_user_registration;
}

export function setAllowUserRegistration(value: boolean) {
  const s = readSettings();
  s.allow_user_registration = !!value;
  return writeSettings(s);
}

export function getAllowStripeWrite(): boolean {
  const s = readSettings();
  return !!s.allow_stripe_write;
}

export function setAllowStripeWrite(value: boolean) {
  const s = readSettings();
  s.allow_stripe_write = !!value;
  return writeSettings(s);
}
