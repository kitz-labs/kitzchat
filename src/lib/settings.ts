import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'state', 'app-settings.json');

export type AppSettings = {
  allow_user_deletion?: boolean;
};

function ensureSettingsFile() {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}), { encoding: 'utf8' });
  } catch (err) {
    // ignore
  }
}

export function readSettings(): AppSettings {
  try {
    ensureSettingsFile();
    const raw = fs.readFileSync(SETTINGS_FILE, { encoding: 'utf8' });
    return JSON.parse(raw || '{}') as AppSettings;
  } catch (err) {
    return {};
  }
}

export function writeSettings(settings: AppSettings) {
  try {
    ensureSettingsFile();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings || {}, null, 2), { encoding: 'utf8' });
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
