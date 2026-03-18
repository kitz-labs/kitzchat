export type AgentProfileFieldType = 'text' | 'textarea' | 'tags' | 'select';

export type AgentProfileField = {
  key: string;
  label: string;
  type: AgentProfileFieldType;
  placeholder?: string;
  help?: string;
  options?: string[];
  required?: boolean;
  maxLen?: number;
};

export type AgentProfileDefinition = {
  agentId: string;
  title: string;
  description: string;
  fields: AgentProfileField[];
};

const GENERIC_PROFILE: AgentProfileDefinition = {
  agentId: 'generic',
  title: 'Dein Kontext',
  description: 'Diese Angaben werden dem Agenten als fixer Kunden-Kontext vorangestellt.',
  fields: [
    { key: 'company', label: 'Firma', type: 'text', placeholder: 'z.B. AI Kitz Art & Labs', help: 'Optional. Name deiner Firma/Marke. Wenn leer, fragt der Agent nach.' },
    { key: 'industry', label: 'Branche', type: 'text', placeholder: 'z.B. Beratung, Software, Handel', help: 'Optional. In welcher Branche du bist (damit Beispiele passen).' },
    { key: 'offer', label: 'Angebot', type: 'textarea', placeholder: 'Was verkaufst du? Für wen? Welches Ergebnis?', help: 'Kurz: Was bietest du an und welches Ergebnis bekommt der Kunde?' },
    { key: 'goals_primary', label: 'Hauptziel', type: 'textarea', placeholder: 'Was soll der Agent für dich erreichen?', help: '1 Satz reicht. Beispiel: “Mehr Leads über LinkedIn” oder “Support-Antworten schneller schreiben”.' },
    { key: 'tone', label: 'Tonalität', type: 'text', placeholder: 'z.B. sachlich, direkt, premium, freundlich', help: 'Wie der Agent schreiben soll (Stil & Ton).' },
    { key: 'no_go', label: 'No-Go Claims', type: 'textarea', placeholder: 'Was darf der Agent nicht schreiben/behaupten?', help: 'Tabus/Verbote. Beispiel: “keine Heilversprechen”, “keine falschen Zahlen”.' },
    { key: 'assets', label: 'Assets', type: 'tags', placeholder: 'z.B. Website, PDF, Case Studies (kommagetrennt)', help: 'Was du bereits hast. Kommagetrennt: “Website, Case Study, PDF, Pitch Deck”.' },
  ],
};

const MARKETING_PROFILE: AgentProfileDefinition = {
  agentId: 'marketing',
  title: 'Marketing-Kontext',
  description: 'Dieser Agent nutzt deine Angaben für Positionierung, Kampagnen und Texte.',
  fields: [
    { key: 'brand_name', label: 'Markenname', type: 'text', placeholder: 'z.B. Nexora', help: 'Name deiner Marke/Produktlinie. Optional, aber hilfreich.' },
    { key: 'industry', label: 'Branche', type: 'text', placeholder: 'z.B. KI-Beratung', help: 'Wofür du stehst (Branche/Nische).' },
    { key: 'target_audience', label: 'Zielgruppe', type: 'textarea', placeholder: 'Wer ist dein idealer Kunde? (Rolle, Größe, Probleme)', help: 'Beispiel: “KMU (10–200 MA), Geschäftsführer/Operations, will Prozesse automatisieren”.' },
    { key: 'offer', label: 'Angebot', type: 'textarea', placeholder: 'Was verkaufst du konkret?', help: 'Kurz und konkret: Paket/Service + Ergebnis + Dauer, wenn bekannt.' },
    { key: 'price', label: 'Preis', type: 'text', placeholder: 'z.B. ab €2.500 / Projekt', help: 'Optional. Spanne oder Startpreis reicht.' },
    { key: 'tone', label: 'Tonalität', type: 'text', placeholder: 'z.B. premium, klar, direkt', help: 'Wie du klingen willst. Beispiel: “premium, direkt, ohne Buzzwords”.' },
    { key: 'channels', label: 'Kanäle', type: 'tags', placeholder: 'z.B. LinkedIn, Instagram, E-Mail (kommagetrennt)', help: 'Wo du posten/schreiben willst. Kommagetrennt.' },
    { key: 'markets', label: 'Märkte', type: 'tags', placeholder: 'z.B. DACH, EU, USA (kommagetrennt)', help: 'Regionen/Zielmärkte. Kommagetrennt.' },
    { key: 'no_go_claims', label: 'No-Go Claims', type: 'textarea', placeholder: 'Welche Aussagen sind tabu?', help: 'Was niemals behauptet werden darf. Beispiel: “garantiert”, “100% sicher”, “Heilversprechen”.' },
    { key: 'goal_primary', label: 'Hauptziel', type: 'textarea', placeholder: 'z.B. Leads, Brand, Sales, Recruiting', help: '1 Hauptziel. Beispiel: “Termine buchen” oder “Inbound-Leads erhöhen”.' },
    { key: 'goals_secondary', label: 'Sekundäre Ziele', type: 'textarea', placeholder: 'z.B. Newsletter, Community, Partnerschaften', help: 'Optional. 1–3 Nebenziele, wenn vorhanden.' },
    { key: 'assets', label: 'Assets', type: 'tags', placeholder: 'z.B. Website, Case Studies, PDFs (kommagetrennt)', help: 'Was du schon hast. Kommagetrennt.' },
    { key: 'competitors', label: 'Wettbewerber', type: 'tags', placeholder: 'z.B. Firma A, Firma B (kommagetrennt)', help: 'Optional. Nenne 1–5 Wettbewerber. Kommagetrennt.' },
    { key: 'cta_preference', label: 'CTA-Präferenz', type: 'text', placeholder: 'z.B. Demo buchen, Call vereinbaren, Kontaktformular', help: 'Wie Leute dich kontaktieren sollen (CTA). Beispiel: “15-min Call buchen”.' },
  ],
};

const AGENT_PROFILES: Record<string, AgentProfileDefinition> = {
  marketing: MARKETING_PROFILE,
  apollo: {
    agentId: 'apollo',
    title: 'Sales-/Outreach-Kontext',
    description: 'Hilft dem SalesAgent bei ICP, Value Prop und Outreach.',
    fields: [
      { key: 'offer', label: 'Angebot', type: 'textarea', placeholder: 'Was bietest du an? Ergebnis/Outcome?', help: 'Kurz: Ergebnis, für wen, in welchem Rahmen.' },
      { key: 'icp', label: 'ICP (Ideal Customer Profile)', type: 'textarea', placeholder: 'Branche, Rollen, Firmengröße, Region, Trigger', help: 'Beispiel: “KMU, CFO/CEO, DACH, ab 10 MA, Prozesschaos/Tool-Wildwuchs”.' },
      { key: 'channels', label: 'Kanäle', type: 'tags', placeholder: 'z.B. E-Mail, LinkedIn, Call (kommagetrennt)' },
      { key: 'tone', label: 'Tonalität', type: 'text', placeholder: 'z.B. premium, direkt, freundlich' },
      { key: 'no_go', label: 'No-Go Claims', type: 'textarea', placeholder: 'Was darf nicht versprochen/geschrieben werden?' },
      { key: 'cta_preference', label: 'CTA-Präferenz', type: 'text', placeholder: 'z.B. 15-min Call, Demo, E-Mail-Antwort' },
      { key: 'competitors', label: 'Wettbewerber', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'assets', label: 'Assets', type: 'tags', placeholder: 'z.B. Website, Case Studies (kommagetrennt)' },
    ],
  },
  athena: {
    agentId: 'athena',
    title: 'Research-Kontext',
    description: 'Fokus für Recherche, Markt-/Wettbewerbsanalyse und Quellen.',
    fields: [
      { key: 'research_goal', label: 'Recherche-Ziel', type: 'textarea', placeholder: 'Was soll am Ende klar sein?', help: 'Beispiel: “Welche 5 Anbieter sind top in DACH und was kosten sie?”' },
      { key: 'keywords', label: 'Keywords / Themen', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'markets', label: 'Märkte/Regionen', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'competitors', label: 'Wettbewerber', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'sources_preference', label: 'Quellen-Präferenz', type: 'text', placeholder: 'z.B. Studien, Behörden, Presse, G2' },
      { key: 'output_style', label: 'Output-Stil', type: 'text', placeholder: 'z.B. Executive Summary + Bullet Points + Risiken' },
    ],
  },
  metis: {
    agentId: 'metis',
    title: 'KPI-/Reporting-Kontext',
    description: 'Definitionen, Zeiträume und KPI-Logik für Auswertungen.',
    fields: [
      { key: 'kpis', label: 'KPIs', type: 'tags', placeholder: 'z.B. Leads, Calls, CAC, MRR (kommagetrennt)', help: 'Kommagetrennt. Beispiel: “Leads, Calls, Conversion, Umsatz”.' },
      { key: 'timeframe', label: 'Standard-Zeitraum', type: 'text', placeholder: 'z.B. 7 Tage, 30 Tage, Quartal' },
      { key: 'targets', label: 'Zielwerte', type: 'textarea', placeholder: 'Welche KPI-Ziele gelten?' },
      { key: 'definitions', label: 'Definitionen', type: 'textarea', placeholder: 'Wie werden KPIs gezählt? (Lead-Definition etc.)' },
    ],
  },
  'kb-manager': {
    agentId: 'kb-manager',
    title: 'Wissens-/Dokument-Kontext',
    description: 'Taxonomie, Ablage und Regeln für Knowledge-Management.',
    fields: [
      { key: 'taxonomy', label: 'Taxonomie', type: 'textarea', placeholder: 'z.B. Bereiche, Tags, Ordnerlogik' },
      { key: 'naming', label: 'Naming-Konvention', type: 'text', placeholder: 'z.B. YYYY-MM-DD Thema v1' },
      { key: 'privacy', label: 'Datenschutz/No-Go', type: 'textarea', placeholder: 'Welche Daten dürfen nie gespeichert werden?' },
      { key: 'outputs', label: 'Bevorzugte Outputs', type: 'tags', placeholder: 'z.B. Markdown, JSON, Checklist (kommagetrennt)' },
    ],
  },
  'browser-operator': {
    agentId: 'browser-operator',
    title: 'Browser-Workflow-Kontext',
    description: 'Grenzen und Präferenzen für Web-Workflows.',
    fields: [
      { key: 'allowed_sites', label: 'Erlaubte Sites', type: 'tags', placeholder: 'z.B. google.com, linkedin.com (kommagetrennt)' },
      { key: 'goals_primary', label: 'Hauptziel', type: 'textarea', placeholder: 'Welche Tasks sollen im Browser erledigt werden?' },
      { key: 'constraints', label: 'Einschränkungen', type: 'textarea', placeholder: 'z.B. keine Logins, keine Zahlungen, nur Recherche' },
    ],
  },
  codepilot: {
    agentId: 'codepilot',
    title: 'Tech-/Code-Kontext',
    description: 'Tech-Stack und Regeln für saubere Implementierungen.',
    fields: [
      { key: 'stack', label: 'Tech-Stack', type: 'text', placeholder: 'z.B. Next.js, Postgres, Docker' },
      { key: 'constraints', label: 'Constraints', type: 'textarea', placeholder: 'z.B. minimal-invasive Changes, kein Refactor' },
      { key: 'style', label: 'Coding-Style', type: 'text', placeholder: 'z.B. TypeScript strict, functional, tests' },
      { key: 'links', label: 'Links/Repos', type: 'tags', placeholder: 'kommagetrennt' },
    ],
  },
  'support-concierge': {
    agentId: 'support-concierge',
    title: 'Support-Kontext',
    description: 'Ton, Regeln und Eskalation für Support-Antworten.',
    fields: [
      { key: 'tone', label: 'Tonalität', type: 'text', placeholder: 'z.B. freundlich, professionell, klar' },
      { key: 'support_hours', label: 'Support-Zeiten', type: 'text', placeholder: 'z.B. Mo–Fr 09:00–17:00' },
      { key: 'policies', label: 'Policies', type: 'textarea', placeholder: 'z.B. Rückerstattung, SLA, Eskalation' },
      { key: 'no_go', label: 'No-Go', type: 'textarea', placeholder: 'z.B. keine Schuldzuweisungen, keine Spekulationen' },
    ],
  },
  'campaign-studio': {
    agentId: 'campaign-studio',
    title: 'Kampagnen-Kontext',
    description: 'Ziele, Budget und Kanäle für Kampagnenplanung.',
    fields: [
      { key: 'goal_primary', label: 'Hauptziel', type: 'textarea', placeholder: 'z.B. Launch, Leads, Sales', help: '1 Satz reicht. Beispiel: “In 14 Tagen 20 Termine” oder “Launch-Plan für April”.' },
      { key: 'budget', label: 'Budget', type: 'text', placeholder: 'z.B. €500/Monat Ads' },
      { key: 'channels', label: 'Kanäle', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'timeline', label: 'Zeitraum', type: 'text', placeholder: 'z.B. 14 Tage, April 2026' },
      { key: 'assets', label: 'Assets', type: 'tags', placeholder: 'kommagetrennt' },
    ],
  },
  'insta-agent': {
    agentId: 'insta-agent',
    title: 'Instagram-Kontext',
    description: 'Content-Pfeiler, Ton und Ziele für IG.',
    fields: [
      { key: 'brand_name', label: 'Markenname', type: 'text' },
      { key: 'target_audience', label: 'Zielgruppe', type: 'textarea' },
      { key: 'content_pillars', label: 'Content-Pfeiler', type: 'tags', placeholder: 'kommagetrennt' },
      { key: 'tone', label: 'Tonalität', type: 'text' },
      { key: 'cta_preference', label: 'CTA', type: 'text' },
    ],
  },
  'docu-agent': {
    agentId: 'docu-agent',
    title: 'Dokumente/Ablage-Kontext',
    description: 'Ablage-Regeln, Struktur und Namenskonventionen.',
    fields: [
      { key: 'structure', label: 'Ordnerstruktur', type: 'textarea', placeholder: 'Wie sollen Dokumente organisiert werden?' },
      { key: 'naming', label: 'Naming-Konvention', type: 'text', placeholder: 'z.B. Kunde_Projekt_Datum' },
      { key: 'retention', label: 'Aufbewahrung', type: 'textarea', placeholder: 'Lösch-/Retention-Regeln' },
      { key: 'no_go', label: 'No-Go', type: 'textarea', placeholder: 'Was darf nie abgelegt werden?' },
    ],
  },
  'mail-agent': {
    agentId: 'mail-agent',
    title: 'E-Mail-Kontext',
    description: 'Prioritäten, Ton und Standards für Mail-Workflows.',
    fields: [
      { key: 'tone', label: 'Tonalität', type: 'text', placeholder: 'z.B. kurz, freundlich, premium' },
      { key: 'priorities', label: 'Prioritäten', type: 'textarea', placeholder: 'Welche Mails sind kritisch? Welche können warten?' },
      { key: 'templates', label: 'Standard-Antworten', type: 'textarea', placeholder: 'Optional: Textbausteine' },
      { key: 'signature', label: 'Signatur', type: 'textarea', placeholder: 'Optional: E-Mail-Signatur' },
    ],
  },
  main: {
    agentId: 'main',
    title: 'Workspace-Kontext',
    description: 'Allgemeiner Kontext für den Master Agent (Routing/Planung). Master Agent orchestriert Agenten und kann auch wie ein normaler Chat arbeiten.',
    fields: [
      { key: 'company', label: 'Firma', type: 'text', help: 'Optional. Firma/Marke. Hilft für passende Beispiele.' },
      { key: 'goals_primary', label: 'Hauptziel', type: 'textarea', placeholder: 'Was soll heute erreicht werden?', help: 'Das wichtigste Ziel für heute. Beispiel: “Angebot finalisieren und 3 LinkedIn-Posts planen”.' },
      { key: 'goals_secondary', label: 'Sekundäre Ziele', type: 'textarea', help: 'Optional. Dinge, die “nice to have” sind.' },
      { key: 'constraints', label: 'Constraints', type: 'textarea', placeholder: 'Budget, Zeit, Regeln', help: 'Grenzen/Regeln. Beispiel: “Max 2h”, “keine sensiblen Daten”, “Ton: premium”.' },
      { key: 'assets', label: 'Assets', type: 'tags', placeholder: 'kommagetrennt', help: 'Wichtige Links/Dateien als Stichworte. Kommagetrennt.' },
    ],
  },
};

export function getAgentProfileDefinition(agentId: string | null | undefined): AgentProfileDefinition {
  if (!agentId) return GENERIC_PROFILE;
  return AGENT_PROFILES[agentId] ?? GENERIC_PROFILE;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function sanitizeAgentProfileInput(agentId: string, input: unknown): Record<string, unknown> {
  const definition = getAgentProfileDefinition(agentId);
  const allowed = new Set(definition.fields.map((field) => field.key));
  const raw = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};

  const out: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (!allowed.has(field.key)) continue;
    const value = raw[field.key];
    if (value == null) continue;

    if (field.type === 'tags') {
      const tags = normalizeTags(value);
      if (tags.length > 0) out[field.key] = tags;
      continue;
    }

    const text = String(value).trim();
    if (!text) continue;
    out[field.key] = field.maxLen ? text.slice(0, field.maxLen) : text;
  }
  return out;
}

export function profileToFormState(agentId: string, profile: Record<string, unknown> | null | undefined): Record<string, string> {
  const definition = getAgentProfileDefinition(agentId);
  const src = profile ?? {};
  const out: Record<string, string> = {};
  for (const field of definition.fields) {
    const value = (src as any)[field.key];
    if (field.type === 'tags') {
      out[field.key] = Array.isArray(value) ? value.map(String).join(', ') : typeof value === 'string' ? value : '';
    } else {
      out[field.key] = value == null ? '' : String(value);
    }
  }
  return out;
}

export function buildAgentProfilePromptSnippet(agentId: string, profile: Record<string, unknown> | null | undefined): string {
  const definition = getAgentProfileDefinition(agentId);
  const src = profile ?? {};

  const lines: string[] = [];
  for (const field of definition.fields) {
    const value = (src as any)[field.key];
    if (value == null) continue;
    if (field.type === 'tags') {
      const tags = normalizeTags(value);
      if (tags.length === 0) continue;
      lines.push(`- ${field.label}: ${tags.join(', ')}`);
      continue;
    }
    const text = String(value).trim();
    if (!text) continue;
    lines.push(`- ${field.label}: ${text}`);
  }

  if (lines.length === 0) return '';
  return [
    `# CUSTOMER PROFILE (für diesen Agenten)`,
    `Nutze die folgenden Angaben als stabilen Kontext. Wenn etwas fehlt, frage gezielt nach.`,
    '',
    ...lines,
  ].join('\n');
}
