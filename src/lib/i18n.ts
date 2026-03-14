import de from '../i18n/de.json';

const LOCALES: Record<string, Record<string, string>> = {
  de,
};

const DEFAULT_LOCALE = 'de';

export function t(key: string, vars?: Record<string, string | number>): string {
  const bundle = LOCALES[DEFAULT_LOCALE] || {};
  let text = bundle[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
    }
  }
  return text;
}

export default t;
