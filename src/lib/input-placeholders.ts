type PlaceholderArgs = {
  label?: string;
  fieldKey?: string;
  provider?: string;
  type?: string;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const LABEL_MAP: Array<{ match: RegExp; placeholder: string }> = [
  { match: /\bopenai\b.*\bkey\b|\bopenai\b.*\bapi\b|\bapi[- ]?key\b.*\bopenai\b/i, placeholder: 'sk-proj-...' },
  { match: /\bstripe\b.*\bsecret\b|\bstripe\b.*\bkey\b/i, placeholder: 'sk_live_... oder sk_test_...' },
  { match: /\bwebhook\b.*\bsecret\b/i, placeholder: 'whsec_...' },
  { match: /\bgithub\b.*(token|oauth|client)/i, placeholder: 'gho_... oder OAuth Connect' },
  { match: /\bgitlab\b.*(token|oauth|client)/i, placeholder: 'glpat-... oder OAuth Connect' },
  { match: /\baccess[- ]?token\b/i, placeholder: 'Bearer eyJ... oder token_...' },
  { match: /\brefresh[- ]?token\b/i, placeholder: 'refresh_...' },
  { match: /\bapi[- ]?key\b/i, placeholder: 'api_...' },
  { match: /\bpassword\b|\bpasswort\b|\bsecret\b/i, placeholder: '••••••••' },
  { match: /\bbenutzername\b|\busername\b/i, placeholder: 'z.B. markus' },
  { match: /\bemail\b|\be-mail\b/i, placeholder: 'name@firma.at' },
  { match: /\bbasis-?url\b|\bbase[- ]?url\b|\burl\b/i, placeholder: 'https://example.com' },
  { match: /\bimap\b.*\bhost\b|\bimap[- ]?host\b/i, placeholder: 'imap.example.com' },
  { match: /\bimap\b.*\bport\b|\bimap[- ]?port\b/i, placeholder: '993' },
  { match: /\bsmtp\b.*\bhost\b|\bsmtp[- ]?host\b/i, placeholder: 'smtp.example.com' },
  { match: /\bsmtp\b.*\bport\b|\bsmtp[- ]?port\b/i, placeholder: '465 oder 587' },
  { match: /\bpop3\b.*\bhost\b|\bpop3[- ]?host\b/i, placeholder: 'pop3.example.com' },
  { match: /\bpop3\b.*\bport\b|\bpop3[- ]?port\b/i, placeholder: '995' },
  { match: /\bwebdav\b|\bcloud login\b|\bcloud[- ]?login\b/i, placeholder: 'https://cloudlogin02.world4you.com/remote.php/dav/files/<user>/' },
  { match: /\blink\b.*\bordner\b|\bfolder\b|\bcloud[- ]?ordner\b/i, placeholder: 'https://.../index.php/f/<id>' },
  { match: /\bpfad\b|\bpath\b|\bwurzelpfad\b/i, placeholder: '/opt/kitzchat/state/... oder /mnt/storage/...' },
  { match: /\bnotion\b/i, placeholder: 'https://www.notion.so/<workspace>' },
  { match: /\bslack\b/i, placeholder: 'xoxb-... oder OAuth Connect' },
  { match: /\btelegram\b.*\btoken\b/i, placeholder: '123456:ABC-DEF...' },
  { match: /\bphone\b|\btelefon\b/i, placeholder: '+43 660 1234567' },
];

function placeholderFromLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  for (const rule of LABEL_MAP) {
    if (rule.match.test(trimmed)) return rule.placeholder;
  }
  return null;
}

export function getExamplePlaceholder(args: PlaceholderArgs): string | undefined {
  const label = typeof args.label === 'string' ? args.label : '';
  const fieldKey = norm(args.fieldKey);
  const provider = norm(args.provider);
  const type = norm(args.type);

  if (type === 'password' && !label) return '••••••••';

  if (fieldKey.includes('openai')) return 'sk-proj-...';
  if (fieldKey.includes('stripe') && fieldKey.includes('secret')) return 'sk_live_... oder sk_test_...';
  if (fieldKey.includes('smtp_host')) return 'smtp.example.com';
  if (fieldKey.includes('imap_host')) return 'imap.example.com';
  if (fieldKey.includes('pop3_host')) return 'pop3.example.com';
  if (fieldKey.includes('smtp_port')) return '465 oder 587';
  if (fieldKey.includes('imap_port')) return '993';
  if (fieldKey.includes('pop3_port')) return '995';
  if (fieldKey.includes('webdav') || fieldKey.includes('cloud_login')) return 'https://cloudlogin02.world4you.com/remote.php/dav/files/<user>/';
  if (fieldKey.includes('folder') || fieldKey.includes('cloud_folder')) return 'https://.../index.php/f/<id>';

  if (provider.includes('github')) return 'OAuth Connect oder gho_...';
  if (provider.includes('gitlab')) return 'OAuth Connect oder glpat-...';

  return placeholderFromLabel(label) ?? undefined;
}

