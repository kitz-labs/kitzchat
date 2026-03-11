import { getDb } from '@/lib/db';
import { sendOperationsAlert } from '@/lib/alerts';

export type EnforcementSeverity = 'warning' | 'error';
export type EnforcementCategory = 'policy-violation' | 'danger';

export type EnforcementMatch = {
  blocked: boolean;
  category: EnforcementCategory | null;
  severity: EnforcementSeverity;
  reason: string;
  matchedTerms: string[];
  userMessage?: string;
};

const DANGER_TERMS = [
  'jemanden toeten',
  'menschen toeten',
  'tier quaelen',
  'gift mischen',
  'bombe bauen',
  'anschlag planen',
  'mord planen',
  'vergiften',
  'waffe bauen',
  'explosivstoff',
  'brandstiftung',
  'suizid anleitung',
  'selbstmord anleitung',
  'lebensgefahr',
  'gefahr in verzug',
];

const CRIMINAL_TERMS = [
  'kreditkarte hacken',
  'phishing seite',
  'betrug planen',
  'malware schreiben',
  'trojaner bauen',
  'ransomware',
  'drogen verkaufen',
  'geld waschen',
  'einbruch planen',
  'waffenhandel',
  'illegale anleitung',
  'passwort stehlen',
  'konto hacken',
  'scam text',
];

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatches(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term));
}

export function inspectPolicyContent(input: string): EnforcementMatch {
  const normalized = normalizeText(input);
  if (!normalized) {
    return {
      blocked: false,
      category: null,
      severity: 'warning',
      reason: 'ok',
      matchedTerms: [],
    };
  }

  const dangerMatches = findMatches(normalized, DANGER_TERMS);
  if (dangerMatches.length > 0) {
    return {
      blocked: true,
      category: 'danger',
      severity: 'error',
      reason: 'Akute Gefahr fuer Mensch, Tier oder Leben erkannt',
      matchedTerms: dangerMatches,
      userMessage: 'Diese Anfrage wurde blockiert. Bei Gefahr fuer Mensch, Tier oder Leben wird der Fall intern eskaliert und geprueft.',
    };
  }

  const criminalMatches = findMatches(normalized, CRIMINAL_TERMS);
  if (criminalMatches.length > 0) {
    return {
      blocked: true,
      category: 'policy-violation',
      severity: 'error',
      reason: 'Kriminelle oder missbraeuchliche Nutzung erkannt',
      matchedTerms: criminalMatches,
      userMessage: 'Kriminelle oder missbraeuchliche Anfragen werden nicht beantwortet. Bei wiederholter Nutzung kann der Account gesperrt werden.',
    };
  }

  return {
    blocked: false,
    category: null,
    severity: 'warning',
    reason: 'ok',
    matchedTerms: [],
  };
}

type AlertActor = {
  id: number;
  username: string;
  email?: string | null;
};

export async function reportPolicyIncident(actor: AlertActor, payload: {
  source: 'chat' | 'support';
  content: string;
  conversationId?: string;
  match: EnforcementMatch;
}) {
  if (!payload.match.blocked || !payload.match.category) return;

  const db = getDb();
  const title = payload.match.category === 'danger' ? 'Akute Sicherheitseskalation' : 'Richtlinienverstoss erkannt';
  const message = `${actor.username} hat eine blockierte ${payload.source}-Anfrage ausgeloest.`;
  const data = {
    user_id: actor.id,
    username: actor.username,
    email: actor.email ?? null,
    source: payload.source,
    conversation_id: payload.conversationId ?? null,
    matched_terms: payload.match.matchedTerms,
    category: payload.match.category,
  };

  db.prepare('INSERT INTO notifications (type, severity, title, message, data) VALUES (?, ?, ?, ?, ?)').run(
    payload.match.category,
    payload.match.severity,
    title,
    message,
    JSON.stringify(data),
  );

  const subject = payload.match.category === 'danger'
    ? 'KitzChat Alarm: Gefahrfall erkannt'
    : 'KitzChat Alarm: Richtlinienverstoss erkannt';

  await sendOperationsAlert(subject, message, [
    `Benutzer: ${actor.username}`,
    `E-Mail: ${actor.email || 'nicht hinterlegt'}`,
    `Quelle: ${payload.source}`,
    `Geschaeftsregel: ${payload.match.reason}`,
    `Treffer: ${payload.match.matchedTerms.join(', ') || 'keine'}`,
    `Konversation: ${payload.conversationId || 'n/a'}`,
    `Text: ${payload.content.slice(0, 1000)}`,
  ]);
}