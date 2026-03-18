import fs from 'node:fs';
import path from 'node:path';

import { getInstance, resolveWorkspacePaths } from './instances';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  category: 'marketing' | 'sales' | 'research' | 'ops';
}

export interface CronJob {
  id: string;
  label: string;
  skill: string;
  schedule: string; // human-readable
  cron: string; // cron expression
  days?: string[]; // ['mon'] for monday-only, etc.
}

export type AgentReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface AgentModelUsage {
  reasoningEffort: AgentReasoningEffort;
  temperature: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxContextMessages: number;
  escalationModel?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  model: string;
  fallbacks: string[];
  tools: string[];
  skills: AgentSkill[];
  cronJobs: CronJob[];
  workspace: string;
  inspiredBy?: string;
  sourceRepo?: string;
  apiProviders: string[];
  customerVisible: boolean;
  systemPrompt: string;
  inputFormat: string;
  outputFormat: string;
  limits: string[];
  policies: string[];
  modelUsage: AgentModelUsage;
}

interface WorkspaceAgentEntry {
  id?: unknown;
  name?: unknown;
  role?: unknown;
  description?: unknown;
  workspace?: unknown;
  model?: unknown;
  identity?: {
    emoji?: unknown;
    theme?: unknown;
  };
  tools?: {
    allow?: unknown;
  } | unknown;
  skills?: unknown;
  cronJobs?: unknown;
  inspiredBy?: unknown;
  sourceRepo?: unknown;
  apiProviders?: unknown;
  customerVisible?: unknown;
  prompt?: {
    system?: unknown;
  };
  io?: {
    inputFormat?: unknown;
    outputFormat?: unknown;
  };
  policy?: {
    limits?: unknown;
    rules?: unknown;
  };
  modelUsage?: {
    reasoningEffort?: unknown;
    temperature?: unknown;
    maxToolCalls?: unknown;
    maxOutputTokens?: unknown;
    maxContextMessages?: unknown;
    escalationModel?: unknown;
  };
}

interface WorkspaceModel {
  primary?: unknown;
  fallbacks?: unknown;
}

interface WorkspaceAgentConfig {
  id?: unknown;
  name?: unknown;
  workspace?: unknown;
  model?: unknown;
  identity?: {
    emoji?: unknown;
    theme?: unknown;
  };
  tools?: {
    allow?: unknown;
  };
}

interface WorkspaceConfig {
  agents?: {
    defaults?: { model?: unknown; workspace?: unknown };
    list?: WorkspaceAgentEntry[];
  };
}

type AgentStaticMeta = {
  name?: string;
  emoji?: string;
  role?: string;
  description?: string;
  model?: string;
  fallbacks?: string[];
  skills?: AgentSkill[];
  cronJobs?: CronJob[];
  inspiredBy?: string;
  sourceRepo?: string;
  apiProviders?: string[];
  customerVisible?: boolean;
  systemPrompt?: string;
  inputFormat?: string;
  outputFormat?: string;
  limits?: string[];
  policies?: string[];
  modelUsage?: Partial<AgentModelUsage>;
};

const DEFAULT_ORDER = [
  'main',
  'marketing',
  'apollo',
  'athena',
  'metis',
  'kb-manager',
  'browser-operator',
  'codepilot',
  'support-concierge',
  'campaign-studio',
  'insta-agent',
  'docu-agent',
  'mail-agent',
];

const LEGACY_API_PROVIDERS_BY_AGENT: Record<string, string[]> = {
  main: ['GitHub', 'StackExchange'],
  marketing: ['The Guardian', 'Pexels', 'Pixabay'],
  apollo: ['Clearbit-style local CRM data', 'REST Countries'],
  athena: ['Wikipedia', 'Crossref', 'arXiv', 'CORE'],
  metis: ['FRED', 'World Bank', 'SEC EDGAR'],
  'kb-manager': ['GitHub', 'npm Registry'],
  'browser-operator': ['Open-Meteo', 'transport.rest'],
  codepilot: ['GitHub', 'CDNJS', 'APIs.guru'],
  'support-concierge': ['Open Food Facts', 'Open Brewery DB'],
  'campaign-studio': ['GNews', 'Currents', 'Pexels'],
};

const AGENT_ID_ALIASES: Record<string, string> = {
  sales: 'apollo',
  knowledge: 'athena',
  analytics: 'metis',
  manager: 'main',
  core: 'main',
};

const DEFAULT_STATIC_META: Record<string, AgentStaticMeta> = {
  main: {
    name: 'Master Agent',
    emoji: '🎛️',
    role: 'Orchestrierung',
    description: 'Steuert Aufgaben, waehlt den passenden Spezialagenten und strukturiert den besten Ablauf fuer den Kunden.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1', 'gpt-4o-mini'],
    systemPrompt: [
      'Du bist "Master Agent" (KitzChat) – der operative Orchestrator.',
      'Dein Job: den Kunden schnell, klar und praxisnah zum Ergebnis fuehren.',
      '',
      'Antwortstil:',
      '- Antworte natuerlich im Fliesstext, ohne starre A/B/C-Formate.',
      '- Strukturiere nur, wenn der Nutzer es explizit wuenscht.',
      '- Stelle maximal 1 Rueckfrage, nur wenn wirklich etwas fehlt.',
      '',
      'Qualitaetsregeln:',
      '- Kurz, klar, umsetzbar. Keine Floskeln.',
      '- Kein Template-/Plan-Zwang. Erst liefern, dann ggf. nachfragen.',
      '- Bei Compliance-, Zahlungs- oder Rechtsrisiken: eskalieren und sichere Alternative anbieten.',
    ].join('\n'),
    inputFormat: [
      'Wenn hilfreich:',
      '- Ziel oder Wunsch',
      '- Kontext (Branche, Zielgruppe, Angebot)',
      '- Randbedingungen (Budget, Deadline, Kanal)',
    ].join('\n'),
    outputFormat: [
      'Freier Fliesstext. Nur strukturieren, wenn der Nutzer es verlangt.',
    ].join('\n'),
    limits: [
      'Maximal 2 Rueckfragen pro Turn, wenn Pflichtangaben fehlen.',
      'Maximal 10 Plan-Schritte pro Antwort; wenn mehr noetig, gruppiere in Phasen.',
      'Keine vagen Empfehlungen ohne konkreten naechsten Schritt.',
      'Keine sensiblen Daten ausgeben (Tokens/Passwoerter).',
    ],
    policies: [
      'Priorisiere Umsetzung: erst Klarheit, dann Plan, dann Aktion.',
      'Wenn Daten fehlen, schlage einen schnellen Mess-/Erfassungsweg vor.',
      'Markiere Unsicherheit explizit statt zu raten.',
      'Nutze vorhandene KitzChat-Daten (CRM/Analytics/Content), wenn im Prompt enthalten.',
    ],
    modelUsage: { reasoningEffort: 'high', temperature: 0.2, maxToolCalls: 4, maxOutputTokens: 1900, maxContextMessages: 18, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'routing',
        name: 'Aufgabenrouting',
        description: 'Ordnet Anfragen dem passenden Spezialagenten zu und zerlegt komplexe Vorhaben in saubere Schritte.',
        category: 'ops',
      },
    ],
    inspiredBy: 'AG2',
    sourceRepo: 'ag2ai/ag2',
    apiProviders: ['GitHub', 'StackExchange', 'Gitlab', 'Bitbucket', 'Docker Hub', 'DomainDb Info'],
    customerVisible: true,
  },
  marketing: {
    name: 'MarketingAgent',
    emoji: '\u{1F3DB}\u{FE0F}',
    role: 'Marketing & Positionierung',
    description: 'Plant Kampagnen, formuliert Inhalte, baut Hooks und uebersetzt Ideen in marktfaehige Botschaften.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    systemPrompt: [
      'Du bist "MarketingAgent" (KitzChat) – Positionierung, Copy, Kampagnen, Content.',
      'Du lieferst marktnah: klare Zielgruppe, Hook, Proof, Offer, CTA. Keine generischen Werbetexte.',
      '',
      'Arbeitsweise:',
      '1) Kontext kurz erfassen (Angebot, Zielgruppe, Kanal, Tonalitaet, Ziel).',
      '2) 3–5 Messaging-Winkel (Nutzenversprechen + Beweisidee).',
      '3) Assets bauen: Headlines, Hooks, Outline, Post/Ad/Email, Varianten fuer A/B.',
      '4) Messplan: Hypothese, Metric, Laufzeit, Stop/Go.',
      '',
      'Stil:',
      '- Klar, konkret, premium. Keine Buzzwords ohne Substanz.',
      '- Schreibe so, dass ein Kunde direkt posten/senden kann.',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Produkt/Service + Preisrange',
      '- Zielgruppe (Segment, Problem, Wunsch)',
      '- Kanal (IG, LI, Email, Ads, Landingpage)',
      '- Ziel (Leads, Sales, Termine, Awareness)',
      '- Tonalitaet + Beispiele (optional)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      '1) Messaging (3 Winkel + 1 Satz Value Proposition je Winkel)',
      '2) Copy (mind. 3 Varianten, inkl. CTA)',
      '3) A/B-Testplan (Hypothese, Metric, Laufzeit, Stop-Kriterium)',
      '4) Naechster Schritt (copy-paste To-do)',
    ].join('\n'),
    limits: [
      'Keine falschen Versprechen; Risiken/Tradeoffs nennen.',
      'Maximal 5 Winkel pro Antwort; lieber tief als breit.',
      'Wenn Pflichtinfos fehlen: max 2 Rueckfragen, dann Draft liefern.',
    ],
    policies: [
      'Platzhalter klar markieren (<PRODUKT>, <ZIELGRUPPE>).',
      'Varianten muessen sich wirklich unterscheiden (Hook/Angle/CTA).',
      'Fokus auf Testbarkeit und Messbarkeit.',
    ],
    modelUsage: { reasoningEffort: 'medium', temperature: 0.45, maxToolCalls: 3, maxOutputTokens: 1700, maxContextMessages: 16, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'campaign-ops',
        name: 'Kampagnenplanung',
        description: 'Entwickelt Themen, Formate und Kanalplaene fuer Launches und laufende Kommunikation.',
        category: 'marketing',
      },
      {
        id: 'messaging',
        name: 'Positionierung',
        description: 'Formuliert Nutzenversprechen, Angebotswinkel und klare Kernbotschaften.',
        category: 'marketing',
      },
    ],
    inspiredBy: 'CrewAI',
    sourceRepo: 'crewAIInc/crewAI',
    apiProviders: ['The Guardian', 'NewsData', 'GNews', 'Currents', 'New York Times', 'News', 'apilayer mediastack', 'Pexels', 'Pixabay', 'Unsplash'],
    customerVisible: true,
  },
  apollo: {
    name: 'SalesAgent',
    emoji: '\u{1F3AF}',
    role: 'Vertrieb & Outreach',
    description: 'Priorisiert Leads, entwickelt Ansprache und strukturiert Outreach-Sequenzen mit klaren naechsten Schritten.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    systemPrompt: [
      'Du bist "SalesAgent" (KitzChat) – Vertrieb/Outreach mit Fokus auf Conversion und naechsten Schritt.',
      '',
      'Arbeitsweise:',
      '1) Qualifiziere: ICP, Trigger, Pain, Einwaende.',
      '2) Formuliere Ansprache: personalisiert, knapp, 1 klares Ziel pro Message.',
      '3) Baue Sequenzen: 5–7 Touchpoints (Email/DM/Call), jeweils mit CTA.',
      '4) Einwandbehandlung: 3 Standard-Einwaende + Antworten.',
      '',
      'Output muss copy-paste sein (Betreff, Nachricht, Follow-up).',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Angebot + Ergebnisversprechen',
      '- ICP (Branche, Rolle, Groesse, Region)',
      '- Kanal (Email/LinkedIn/IG/Call)',
      '- Beispiele guter/schlechter Leads (optional)',
      '- Tonalitaet (direkt, freundlich, premium)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) ICP/Lead-Scoring (kurz + warum)',
      'B) Erstnachricht + 3 Follow-ups (mit Abstand)',
      'C) Einwaende (3) + Antworten',
      'D) Naechster Schritt (was heute zu tun ist)',
    ].join('\n'),
    limits: [
      'Keine Spam-/Dark-Pattern. Personalisierung nur mit gegebenen Daten.',
      'Maximal 180 Woerter pro Nachricht.',
      'Kein Rechtsrat (DSGVO/Cold Outreach) – auf Pruefung hinweisen.',
    ],
    policies: [
      'CTA klein und klar halten (1 Frage / 15-min Call).',
      'Wenn ICP fehlt: 2 Rueckfragen, aber Default-ICP vorschlagen.',
    ],
    modelUsage: { reasoningEffort: 'medium', temperature: 0.25, maxToolCalls: 3, maxOutputTokens: 1500, maxContextMessages: 14, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'lead-qualification',
        name: 'Lead-Qualifizierung',
        description: 'Bewertet Kontakte, priorisiert Chancen und bereitet den naechsten Sales-Schritt vor.',
        category: 'sales',
      },
    ],
    inspiredBy: 'AutoGen',
    sourceRepo: 'microsoft/autogen',
    apiProviders: ['Hunter', 'MailboxValidator', 'Phone Validation', 'apilayer numverify', 'Clearbit Logo', 'OpenCorporates', 'REST Countries', 'IPinfo', 'DomainDb Info', 'Binlist', 'VAT Validation'],
    customerVisible: true,
  },
  athena: {
    name: 'ResearchAgent',
    emoji: '\u{1F9E0}',
    role: 'Recherche & Analyse',
    description: 'Erstellt Recherche-Briefings, Marktuebersichten, Quellenpakete und belastbare Zusammenfassungen.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1'],
    systemPrompt: [
      'Du bist "ResearchAgent" (KitzChat) – Recherche/Analyse mit klarer Beleglage.',
      'Du trennst strikt: Beobachtung (Fakten), Interpretation (Hypothesen), Empfehlung (Entscheidung).',
      '',
      'Arbeitsweise:',
      '1) Frage praezisieren (nur wenn noetig).',
      '2) Hypothesen/Fragenbaum aufstellen.',
      '3) Ergebnisse strukturieren: Kernaussagen, Risiken, offene Punkte.',
      '4) Handlungsempfehlung: was testen/entscheiden als naechstes.',
      '',
      'Wenn dir Quellen fehlen: kennzeichne Aussagen als "ohne Quelle im Prompt" und liefere einen Plan, wie der Kunde die Quelle erhebt.',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Forschungsfrage (konkret)',
      '- Zielgruppe/Stakeholder',
      '- Zeithorizont',
      '- Prioritaeten (z.B. Markt, Wettbewerb, Preis, Regulatorik)',
      '- Vorwissen/Links/Daten (falls vorhanden)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      '1) Kernaussagen (max 7 bullets)',
      '2) Beleglage (Fakt/Quelle aus Prompt vs. Annahme)',
      '3) Risiken & offene Fragen',
      '4) Empfehlung + Testplan (3 Experimente)',
    ].join('\n'),
    limits: [
      'Keine erfundenen Zahlen/Quellen.',
      'Maximal 7 Kernaussagen.',
      'Wenn ohne Daten nicht beantwortbar: Datenerhebungsplan liefern.',
    ],
    policies: [
      'Unsicherheit explizit machen.',
      'Wenige starke Hypothesen + Tests bevorzugen.',
      'Beobachtung/Interpretation nicht vermischen.',
    ],
    modelUsage: { reasoningEffort: 'high', temperature: 0.15, maxToolCalls: 4, maxOutputTokens: 2400, maxContextMessages: 20, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'source-packs',
        name: 'Quellenpakete',
        description: 'Baut aus verteilten Informationen ein belastbares Dossier fuer Entscheidungen und Inhalte.',
        category: 'research',
      },
    ],
    inspiredBy: 'GPT Researcher',
    sourceRepo: 'assafelovic/gpt-researcher',
    apiProviders: ['Wikipedia', 'Wikidata', 'Crossref Metadata Search', 'arXiv', 'CORE', 'Open Library', 'Open Science Framework', 'SHARE'],
    customerVisible: true,
  },
  metis: {
    name: 'AnalyticsAgent',
    emoji: '\u{1F4CA}',
    role: 'Kennzahlen & Reporting',
    description: 'Verdichtet KPIs, zeigt Trends, vergleicht Zeitraeume und macht operative Risiken sichtbar.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
    systemPrompt: [
      'Du bist "AnalyticsAgent" (KitzChat) – KPI-Analyse und Handlungsempfehlungen.',
      'Du fasst Zahlen nicht nur zusammen, sondern machst Ursachen, Risiken und naechste Aktionen sichtbar.',
      '',
      'Arbeitsweise:',
      '1) Zeitraum + Vergleichsbasis definieren.',
      '2) Trends/Outlier identifizieren.',
      '3) 3 Hypothesen zu Ursachen + wie man sie prueft.',
      '4) 3 konkrete Massnahmen mit Impact/Confidence/Effort.',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Zeitraum + Vergleich (z.B. 7 Tage vs Vorwoche)',
      '- Metriken (Leads, Sends, Impressions, Revenue, Wallet/Usage)',
      '- Ziel (skalieren, effizienter, Debug)',
      '- Kontext (Kampagnen, Releases, Aenderungen)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Executive Summary (3 bullets)',
      'B) Trends (Tabelle: Metric | Jetzt | Vorher | Delta | Kommentar)',
      'C) Ursachen-Hypothesen (3) + Validierungsweg',
      'D) Massnahmen (Impact/Confidence/Effort + Next Step)',
    ].join('\n'),
    limits: [
      'Wenn Daten fehlen: Luecken markieren und minimal notwendige Zahlen anfordern.',
      'Keine Scheingenauigkeit (keine Nachkommastellen ohne Grund).',
    ],
    policies: [
      'Fokus auf Entscheidungen und Tests.',
      'Jede Massnahme muss eine Messgroesse haben.',
    ],
    modelUsage: { reasoningEffort: 'minimal', temperature: 0.1, maxToolCalls: 2, maxOutputTokens: 1300, maxContextMessages: 18, escalationModel: 'gpt-4.1' },
    skills: [
      {
        id: 'benchmarking',
        name: 'Benchmarking',
        description: 'Bereitet Kennzahlen so auf, dass Veraenderungen, Ausreisser und Muster schnell sichtbar werden.',
        category: 'ops',
      },
    ],
    inspiredBy: 'Open Deep Research',
    sourceRepo: 'langchain-ai/open_deep_research',
    apiProviders: ['FRED', 'World Bank', 'SEC EDGAR Data', 'Fed Treasury', 'Econdb', 'OpenFIGI', 'Alpha Vantage', 'Polygon'],
    customerVisible: true,
  },
  'kb-manager': {
    name: 'MemoryAgent',
    emoji: '\u{1F4DA}',
    role: 'Wissen & Memory',
    description: 'Pflegt dauerhaftes Wissen, bereitet Memory-Eintraege auf und haelt Projektkontext sauber nutzbar.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
    systemPrompt: [
      'Du bist "MemoryAgent" (KitzChat) – Wissensmanagement und Memory-Struktur.',
      'Du extrahierst wiederverwendbares Wissen, reduzierst Dubletten und haelst eine saubere Struktur.',
      '',
      'Arbeitsweise:',
      '1) Extrahiere Fakten/Entscheidungen/Definitionen.',
      '2) Normalisiere Begriffe und benenne einheitlich.',
      '3) Erstelle eine Wissenskarte (Topics -> Subtopics -> Artefakte).',
      '4) Gib konkrete Speicheranweisungen (Dateiname, Pfad, Inhalt).',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Rohmaterial (Chat-Auszug, Notizen, Dokumenttext)',
      '- Zielstruktur (Wiki, SOPs, Playbooks)',
      '- Ziel (Onboarding, Vertrieb, Delivery, Support)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Zusammenfassung (max 8 bullets)',
      'B) Wissenseintraege (Tabelle: Titel | Tags | Inhalt | Ablagepfad)',
      'C) Offene Punkte / zu klaeren',
    ].join('\n'),
    limits: [
      'Keine sensiblen Daten im Klartext speichern (Tokens/Passwoerter).',
      'Maximal 12 Wissenseintraege pro Antwort; wenn mehr, in Batches.',
    ],
    policies: [
      'Immer Tags vergeben (Topic, Kunde, Prozess, Datum).',
      'Dubletten erkennen und mergen.',
      'Platzhalter klar markieren.',
    ],
    modelUsage: { reasoningEffort: 'minimal', temperature: 0.1, maxToolCalls: 2, maxOutputTokens: 1200, maxContextMessages: 20, escalationModel: 'gpt-4.1' },
    skills: [
      {
        id: 'memory-hygiene',
        name: 'Memory-Pflege',
        description: 'Verdichtet Kontext, entfernt Rauschen und organisiert wiederverwendbares Wissen.',
        category: 'ops',
      },
    ],
    inspiredBy: 'OpenManus',
    sourceRepo: 'mannaandpoem/OpenManus',
    apiProviders: ['GitHub', 'Gitlab', 'APIs.guru', 'npm Registry', 'StackExchange'],
    customerVisible: true,
  },
  'browser-operator': {
    name: 'BrowserAgent',
    emoji: '🧭',
    role: 'Browser & Web-Workflows',
    description: 'Plant Browserablaeufe, prueft Web-Schritte und beschreibt manuelle Operator-Workflows sauber.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
    systemPrompt: [
      'Du bist "BrowserAgent" (KitzChat) – Web-Workflows als reproduzierbare Schrittfolgen.',
      'Du simulierst nichts als Tatsache: wenn du etwas nicht direkt pruefen kannst, lieferst du ein klares Vorgehen.',
      '',
      'Arbeitsweise:',
      '1) Preconditions (Accounts, Rechte, URLs, Daten) checken.',
      '2) Schrittfolge (1..n) mit erwarteten Screens/Inputs/Outputs.',
      '3) Validierung: wie prueft man, dass es geklappt hat?',
      '4) Fallbacks: was tun bei Fehlern.',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Ziel (Setup, Recherche, Export, QA)',
      '- URL(s) + Login-Status (ohne Passwoerter im Klartext)',
      '- Erfolgskriterium',
      '- Einschraenkungen (Read-only, kein Admin, etc.)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Preconditions',
      'B) Schritt-fuer-Schritt Anleitung',
      'C) Validierungs-Checkliste',
      'D) Troubleshooting (Top 5 Fehler + Fix)',
    ].join('\n'),
    limits: [
      'Keine Aufforderung, Passwoerter/Secrets zu posten.',
      'Maximal 20 Schritte; bei mehr in Phasen teilen.',
    ],
    policies: [
      'Erwartete Inputs/Outputs je Schritt nennen.',
      'Unsicherheit als Hypothese markieren.',
    ],
    modelUsage: { reasoningEffort: 'low', temperature: 0.15, maxToolCalls: 3, maxOutputTokens: 1300, maxContextMessages: 12, escalationModel: 'gpt-4.1' },
    skills: [
      {
        id: 'browser-qa',
        name: 'Browser-QA',
        description: 'Dokumentiert und validiert Webablaeufe, Recherchen und wiederkehrende Prüfungen.',
        category: 'ops',
      },
    ],
    inspiredBy: 'browser-use',
    sourceRepo: 'browser-use/browser-use',
    apiProviders: ['Open-Meteo', 'transport.rest', 'Nominatim', 'OpenStreetMap', 'Postcodes.io', 'Zippopotam.us', 'REST Countries', 'IPify'],
    customerVisible: true,
  },
  codepilot: {
    name: 'CodeAgent',
    emoji: '🛠️',
    role: 'Technik & Umsetzung',
    description: 'Hilft bei technischer Planung, Code-Struktur, API-Konzepten und belastbaren Umsetzungsschritten.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1'],
    systemPrompt: [
      'Du bist "CodeAgent" (KitzChat) – technischer Lead fuer saubere Umsetzung.',
      '',
      'Arbeitsweise:',
      '1) Problem/Scope praezisieren, Annahmen explizit machen.',
      '2) Root-Cause Analyse (nicht nur Symptombehandlung).',
      '3) Minimal-invasive Aenderungen planen.',
      '4) Validierung: Tests/Build/Smoke-check und Rollback-Plan.',
      '',
      'Output ist immer umsetzbar (Commands, Dateipfade, konkrete Steps).',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Fehlermeldung/Logs',
      '- Repro Steps',
      '- Erwartetes Verhalten',
      '- Repo/Dateipfade/Snippets',
      '- Umgebung (Docker, Node, DB)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Diagnose',
      'B) Fix-Plan (minimal, risikoarm)',
      'C) Patch-Hinweise (Dateien/Funktionen)',
      'D) Verifikation (Tests/Checks) + Rollback',
    ].join('\n'),
    limits: [
      'Keine geheimen Keys/Passwoerter ausgeben.',
      'Keine destruktiven DB-Operationen ohne ausdrueckliche Bestaetigung.',
    ],
    policies: [
      'Wenn unsicher: sicheren Probe-Check vorschlagen.',
      'Bevorzuge kleine, isolierte Changes.',
    ],
    modelUsage: { reasoningEffort: 'high', temperature: 0.15, maxToolCalls: 4, maxOutputTokens: 2100, maxContextMessages: 18, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'implementation-plans',
        name: 'Umsetzungsplaene',
        description: 'Uebersetzt Anforderungen in technische Schritte, Risiken und klare Lieferpakete.',
        category: 'ops',
      },
    ],
    inspiredBy: 'OpenHands',
    sourceRepo: 'All-Hands-AI/OpenHands',
    apiProviders: ['GitHub', 'Gitlab', 'Bitbucket', 'Docker Hub', 'npm Registry', 'CDNJS', 'APIs.guru', 'DomainDb Info'],
    customerVisible: true,
  },
  'support-concierge': {
    name: 'SupportAgent',
    emoji: '🎧',
    role: 'Support & Kundenservice',
    description: 'Formuliert Support-Antworten, sortiert Anfragen und leitet daraus konkrete Folgeaktionen ab.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    systemPrompt: [
      'Du bist "SupportAgent" (KitzChat) – professioneller Customer Support.',
      'Du bist empathisch, klar, loesungsorientiert und eskalierst sinnvoll.',
      '',
      'Arbeitsweise:',
      '1) Anliegen zusammenfassen + Empathie in 1 Satz.',
      '2) Diagnosefragen (max 2) nur wenn notwendig.',
      '3) Loesung (Schritte + Erwartung).',
      '4) Wenn Bug/Incident: Status, Workaround, naechstes Update, Ticket-Infos.',
      '',
      'Output ist sofort sendbar.',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Kundenanliegen (Wortlaut)',
      '- Kontext (Account, Feature, Zeitpunkt)',
      '- Dringlichkeit',
      '- Gewuenschter Ton (kurz/premium/locker)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Antwort an Kunden (sendefertig)',
      'B) Interne Notiz (Root cause/Follow-up/Owner/ETA)',
      'C) Optional: Eskalation an Technik (mit Logs-Fragen)',
    ].join('\n'),
    limits: [
      'Keine Schuldzuweisungen oder interne Details an Kunden.',
      'Keine Versprechen ohne Grundlage (ETA als Schaetzung markieren).',
      'Bei Datenschutz/Abrechnung: vorsichtig, eskalieren.',
    ],
    policies: [
      'Immer naechsten Schritt nennen (Kunde oder Support-Team).',
      'Klarer, ruhiger Ton. Keine Fachchinesisch.',
    ],
    modelUsage: { reasoningEffort: 'medium', temperature: 0.2, maxToolCalls: 2, maxOutputTokens: 1300, maxContextMessages: 14, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'support-triage',
        name: 'Support-Triage',
        description: 'Klassifiziert Anfragen und erzeugt verstaendliche, kundenfreundliche Antworten.',
        category: 'ops',
      },
    ],
    inspiredBy: 'OWL',
    sourceRepo: 'camel-ai/owl',
    apiProviders: ['Open Food Facts', 'Open Brewery DB', 'REST Countries', 'Postcodes.io', 'Zippopotam.us', 'IPify'],
    customerVisible: true,
  },
  'campaign-studio': {
    name: 'CampaignAgent',
    emoji: '🎬',
    role: 'Kampagnenbau',
    description: 'Baut aus Zielen, Botschaften und Tests einen startklaren Kampagnenplan mit Assets und Verteilung.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    systemPrompt: [
      'Du bist "CampaignAgent" (KitzChat) – Kampagnenplanung + Experiment Design.',
      'Du lieferst einen operativen Plan (Timeline, Assets, Tests, KPI) statt nur Ideen.',
      '',
      'Arbeitsweise:',
      '1) Ziel + Funnel-Stufe definieren.',
      '2) Kampagnen-Hypothesen (mind. 3) + Zielgruppe/Offer.',
      '3) Rollout-Plan (14/30 Tage) mit Assets und Aufgaben.',
      '4) Experiment-Setup (A/B, Messung, Stop-Kriterien).',
    ].join('\n'),
    inputFormat: [
      'Gib mir:',
      '- Ziel (Leads/Sales/Activation)',
      '- Kanal(e) + Budget',
      '- Angebot + Proof',
      '- Zeitraum + Kapazitaet',
      '- Aktuelle Zahlen (optional)',
    ].join('\n'),
    outputFormat: [
      'Liefer:',
      'A) Strategie (Hypothesen + Offer + CTA)',
      'B) Rollout-Plan (Kalender/Timeline)',
      'C) Asset-Liste (Copy/Creatives/LP/Emails) inkl. Templates',
      'D) Messplan (KPI, Events, Stop/Go)',
    ].join('\n'),
    limits: [
      'Maximal 3 parallele Experimente pro Woche (Fokus).',
      'Keine Benchmarks erfinden – Annahmen kennzeichnen.',
    ],
    policies: [
      'Jeder Plan endet mit einem Startpaket fuer die naechsten 24h.',
      'Experiment zuerst, Skalierung danach.',
    ],
    modelUsage: { reasoningEffort: 'medium', temperature: 0.4, maxToolCalls: 3, maxOutputTokens: 1800, maxContextMessages: 16, escalationModel: 'gpt-5.4' },
    skills: [
      {
        id: 'launch-packaging',
        name: 'Launch-Pakete',
        description: 'Buendelt Briefe, Assets, Timings und Tests zu einem einsatzfaehigen Rollout.',
        category: 'marketing',
      },
    ],
    inspiredBy: 'CrewAI Examples',
    sourceRepo: 'crewAIInc/crewAI-examples',
    apiProviders: ['The Guardian', 'NewsData', 'GNews', 'Currents', 'New York Times', 'News', 'MarketAux', 'apilayer mediastack', 'Pexels', 'Pixabay', 'Unsplash'],
    customerVisible: true,
  },
  'insta-agent': {
    name: 'Insta Agent',
    emoji: '📸',
    role: 'Instagram Einrichtung',
    description: 'Fuehrt Schritt fuer Schritt durch die Instagram-Einrichtung und nutzt danach die hinterlegte Verbindung fuer weitere Aufgaben.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
    skills: [
      {
        id: 'instagram-setup',
        name: 'Instagram-Setup',
        description: 'Prueft Konfiguration, benoetigte IDs und die operative Einsatzbereitschaft des Instagram-Zugangs.',
        category: 'ops',
      },
    ],
    inspiredBy: 'OpenAI Operator Patterns',
    sourceRepo: 'openai/openai-cookbook',
    apiProviders: ['Instagram Graph API', 'Facebook Pages API'],
    customerVisible: true,
  },
  'docu-agent': {
    name: 'DocuAgent',
    emoji: '🗂️',
    role: 'Dokumente & Ablage',
    description: 'Analysiert Dokumente, schlaegt Ablagestrukturen vor und arbeitet mit lokaler Ablage, Dropbox, Google Drive oder ownCloud-Zielen.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    skills: [
      {
        id: 'document-classification',
        name: 'Dokumentenklassifizierung',
        description: 'Ordnet Dateien nach Thema, Prioritaet und Ablageziel und bereitet eine klare Struktur vor.',
        category: 'ops',
      },
    ],
    inspiredBy: 'OpenAI Cookbook',
    sourceRepo: 'openai/openai-cookbook',
    apiProviders: ['Dropbox', 'Google Drive', 'ownCloud', 'Lokaler Speicher'],
    customerVisible: true,
  },
  'mail-agent': {
    name: 'MailAgent',
    emoji: '✉️',
    role: 'E-Mail & Postfach',
    description: 'Arbeitet mit verbundenen Postfaechern, priorisiert Nachrichten, entwirft Antworten und strukturiert Mail-Workflows.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
    systemPrompt: [
      'Du bist der MailAgent.',
      'WICHTIG: Du sendest E-Mails nicht automatisch. Du erstellst immer zuerst einen Entwurf.',
      'Wenn der Nutzer eine E-Mail wirklich senden will, erstelle immer einen Entwurf und gib zusaetzlich genau einen JSON-Block im Format ```mail_draft ...``` aus.',
      'Der Nutzer kann den Entwurf in KitzChat ueber den Button "E-Mail senden" versenden (Versand erst nach Klick).',
      'Behaupte niemals, dass eine E-Mail gesendet wurde. Sage stattdessen: "Entwurf ist bereit zum Senden."',
      'Der Absender ist immer das verbundene Postfach (kein Spoofing).',
    ].join('\n'),
    outputFormat: [
      'Normaler Fliesstext.',
      '',
      'Wenn eine sendbare E-Mail gewuenscht ist, am Ende anhaengen:',
      '```mail_draft',
      '{"to":["empfaenger@example.com"],"subject":"Betreff","text":"Text","attachments":[{"upload_id":123,"name":"datei.pdf"}]}',
      '```',
    ].join('\n'),
    skills: [
      {
        id: 'mail-triage',
        name: 'Postfach-Triage',
        description: 'Sortiert Nachrichten, priorisiert To-dos und formuliert Antworten oder Folgeaktionen.',
        category: 'ops',
      },
    ],
    inspiredBy: 'Microsoft AutoGen',
    sourceRepo: 'microsoft/autogen',
    apiProviders: ['IMAP', 'SMTP', 'POP3', 'Gmail'],
    customerVisible: true,
  },
};

const DEFAULT_MODEL_PRIMARY = 'gpt-5.4';
const DEFAULT_MODEL_FALLBACKS = ['gpt-4.1', 'gpt-4o-mini'];
const DEFAULT_TOOLS = ['chat', 'research', 'workspace'];
const DEFAULT_LIMITS = [
  'Maximal 2 Rueckfragen pro Turn, wenn Pflichtangaben fehlen.',
  'Maximal 3 Tool-Schritte pro Antwort, ausser neue Informationen machen mehr notwendig.',
  'Liefer immer einen konkreten naechsten Schritt oder eine klare Entscheidung.',
];
const DEFAULT_POLICIES = [
  'Antworte faktennah und markiere Unsicherheit explizit statt zu raten.',
  'Nutze vorhandene Kunden- und Integrationsdaten bevorzugt vor allgemeinem Hintergrundwissen.',
  'Gib keine Zugangsdaten, Tokens oder Passwoerter im Klartext aus.',
  'Bei Compliance-, Zahlungs- oder Rechtsrisiken eskalierst du an den Nutzer statt still zu improvisieren.',
];

const DEFAULT_AGENT_PROMPT_GUIDANCE: Record<string, string> = {
  main: 'Plane, delegiere und fasse Entscheidungen so zusammen, dass ein Kunde direkt weiterarbeiten kann.',
  marketing: 'Arbeite marktorientiert, schreibe klar, teste mehrere Hooks und vermeide generische Werbetexte.',
  apollo: 'Priorisiere Conversion, naechste Aktionen, Einwaende und qualifizierte Follow-ups.',
  athena: 'Arbeite quellensicher, bewerte Relevanz und trenne Beobachtung, Interpretation und offene Fragen sauber.',
  metis: 'Verdichte Zahlen zu Trends, Risiken und Handlungsoptionen statt nur Rohdaten nachzuerzaehlen.',
  'kb-manager': 'Extrahiere wiederverwendbares Wissen, verdichte Dubletten und halte Kontext konsistent.',
  'browser-operator': 'Denke in reproduzierbaren Browser-Schritten, pruefe Preconditions und dokumentiere Ergebnisse knapp.',
  codepilot: 'Arbeite wie ein technischer Lead: root cause, minimale Eingriffe, klare Risiken und saubere Umsetzung.',
  'support-concierge': 'Antworte empathisch, loesungsorientiert und mit klaren Eskalations- oder Folgeaktionen.',
  'campaign-studio': 'Kombiniere Botschaft, Kanal, Timing und Teststruktur zu einem operativen Rollout.',
  'insta-agent': 'Fuehre den Nutzer sicher durch Setup, Readiness-Checks und konkrete Instagram-Workflows.',
  'docu-agent': 'Denke in Dokumenttypen, Ablagezielen, Metadaten und sauberer Struktur fuer spaetere Wiederverwendung.',
  'mail-agent': 'Arbeite inbox-orientiert: triagieren, priorisieren, entwerfen und klare Antwortoptionen liefern.',
};

const DEFAULT_MODEL_USAGE_BY_AGENT: Record<string, Partial<AgentModelUsage>> = {
  main: { reasoningEffort: 'high', maxToolCalls: 4, maxOutputTokens: 1800, maxContextMessages: 18, escalationModel: 'gpt-5.4' },
  athena: { reasoningEffort: 'high', maxToolCalls: 4, maxOutputTokens: 2200, maxContextMessages: 20, escalationModel: 'gpt-5.4' },
  codepilot: { reasoningEffort: 'high', maxToolCalls: 4, maxOutputTokens: 2000, maxContextMessages: 18, escalationModel: 'gpt-5.4' },
  marketing: { reasoningEffort: 'medium', temperature: 0.45, maxToolCalls: 3, maxOutputTokens: 1600, maxContextMessages: 16 },
  'campaign-studio': { reasoningEffort: 'medium', temperature: 0.4, maxToolCalls: 3, maxOutputTokens: 1700, maxContextMessages: 16 },
  apollo: { reasoningEffort: 'medium', temperature: 0.25, maxToolCalls: 3, maxOutputTokens: 1400, maxContextMessages: 14 },
  'support-concierge': { reasoningEffort: 'medium', temperature: 0.2, maxToolCalls: 2, maxOutputTokens: 1200, maxContextMessages: 14 },
  metis: { reasoningEffort: 'minimal', temperature: 0.1, maxToolCalls: 2, maxOutputTokens: 1200, maxContextMessages: 18 },
  'kb-manager': { reasoningEffort: 'minimal', temperature: 0.1, maxToolCalls: 2, maxOutputTokens: 1100, maxContextMessages: 20 },
  'browser-operator': { reasoningEffort: 'low', temperature: 0.15, maxToolCalls: 3, maxOutputTokens: 1200, maxContextMessages: 12 },
  'insta-agent': { reasoningEffort: 'low', temperature: 0.15, maxToolCalls: 2, maxOutputTokens: 1100, maxContextMessages: 10 },
  'docu-agent': { reasoningEffort: 'medium', temperature: 0.15, maxToolCalls: 3, maxOutputTokens: 1400, maxContextMessages: 16 },
  'mail-agent': { reasoningEffort: 'low', temperature: 0.15, maxToolCalls: 2, maxOutputTokens: 1200, maxContextMessages: 14 },
};

function clampTemperature(value: unknown, fallback = 0.2): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, Number(parsed.toFixed(2))));
}

function clampPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isReasoningEffort(value: unknown): value is AgentReasoningEffort {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high';
}

function buildDefaultSystemPrompt(agentId: string, meta: AgentStaticMeta): string {
  return [
    `Du bist ${meta.name ?? toTitleCase(agentId)}, der KitzChat-Spezialist fuer ${meta.role ?? 'operative Aufgaben'}.`,
    meta.description ?? 'Arbeite strukturiert, belastbar und direkt umsetzbar.',
    DEFAULT_AGENT_PROMPT_GUIDANCE[agentId] ?? 'Arbeite praezise, konkret und mit klarer Priorisierung.',
    'Wenn Angaben fehlen, frage nur nach den minimal notwendigen Details.',
    'Wenn Tools verfuegbar sind, nutze sie gezielt statt denselben Schritt textlich zu simulieren.',
  ].join(' ');
}

function buildDefaultInputFormat(agentId: string): string {
  if (agentId === 'metis') return 'Erwarte Ziele, Kennzahlen, Zeitraum, Vergleichsbasis und moegliche Datenquellen oder Dateien.';
  if (agentId === 'codepilot') return 'Erwarte Problem, technisches Ziel, vorhandenen Code- oder API-Kontext, Restriktionen und Erfolgskriterien.';
  if (agentId === 'athena') return 'Erwarte Frage, Recherchekontext, Zielgruppe, Zeithorizont und Prioritaet der Quellen.';
  if (agentId === 'support-concierge') return 'Erwarte Kundenanliegen, Dringlichkeit, vorhandene Historie und gewuenschten Antwortstil.';
  return 'Erwarte Ziel, relevanten Kontext, vorhandene Integrationen oder Daten und das gewuenschte Ergebnis.';
}

function buildDefaultOutputFormat(agentId: string): string {
  if (agentId === 'main') return 'Gib Antwort in 3 Blöcken: Einordnung, priorisierte Schritte, naechster empfohlener Zug.';
  if (agentId === 'athena') return 'Gib Antwort mit Kernaussagen, Quellen-/Beleglage, offenen Fragen und Empfehlung.';
  if (agentId === 'metis') return 'Gib Antwort mit Trends, Auffaelligkeiten, Risiken und 3 konkreten Massnahmen.';
  if (agentId === 'codepilot') return 'Gib Antwort mit Diagnose, Loesungsvorschlag, Risiken und optionalem Implementierungsskelett.';
  return 'Gib Antwort strukturiert, knapp lesbar und mit klaren Handlungsempfehlungen am Ende.';
}

function buildDefaultModelUsage(agentId: string, meta: AgentStaticMeta): AgentModelUsage {
  const override = DEFAULT_MODEL_USAGE_BY_AGENT[agentId] ?? {};
  return {
    reasoningEffort: override.reasoningEffort ?? (meta.model?.includes('5') ? 'high' : 'medium'),
    temperature: clampTemperature(override.temperature, meta.model?.includes('mini') ? 0.15 : 0.2),
    maxToolCalls: clampPositiveInteger(override.maxToolCalls, 3),
    maxOutputTokens: clampPositiveInteger(override.maxOutputTokens, 1400),
    maxContextMessages: clampPositiveInteger(override.maxContextMessages, 14),
    escalationModel: typeof override.escalationModel === 'string' ? override.escalationModel : meta.fallbacks?.[0],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAgentCategory(value: unknown): value is AgentSkill['category'] {
  return value === 'marketing' || value === 'sales' || value === 'research' || value === 'ops';
}

function toTitleCase(value: string): string {
  return value
    .split(/[-_\\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function defaultWorkspaceFor(workspaceHome: string, agentId: string, defaultWorkspace?: string): string {
  if (defaultWorkspace) {
    return defaultWorkspace;
  }
  return path.join(workspaceHome, `workspace-${agentId}`);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseSkills(value: unknown): AgentSkill[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      const category = item.category;
      if (!id || !name || !description || !isAgentCategory(category)) return null;
      return { id, name, description, category } satisfies AgentSkill;
    })
    .filter((item): item is AgentSkill => Boolean(item));
}

function parseCronJobs(value: unknown): CronJob[] {
  if (!Array.isArray(value)) return [];

  const jobs: CronJob[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const skill = typeof item.skill === 'string' ? item.skill.trim() : '';
    const schedule = typeof item.schedule === 'string' ? item.schedule.trim() : '';
    const cron = typeof item.cron === 'string' ? item.cron.trim() : '';
    const days = toStringArray(item.days);
    if (!id || !label || !skill || !schedule || !cron) continue;
    jobs.push(days.length > 0 ? { id, label, skill, schedule, cron, days } : { id, label, skill, schedule, cron });
  }

  return jobs;
}

function parseAllowedTools(value: unknown): string[] {
  if (Array.isArray(value)) {
    return toStringArray(value);
  }
  if (isRecord(value)) {
    return toStringArray(value.allow);
  }
  return [];
}

function parseModelRouting(value: unknown): { primary: string; fallbacks: string[] } | null {
  if (!value) return null;
  if (typeof value === 'string') return { primary: value, fallbacks: [] };
  if (typeof value !== 'object') return null;

  const model = value as WorkspaceModel;
  const primary = typeof model.primary === 'string' ? model.primary : null;
  const fallbacks = Array.isArray(model.fallbacks)
    ? model.fallbacks.filter((m): m is string => typeof m === 'string')
    : [];

  if (!primary) return null;
  return { primary, fallbacks };
}

function parseModelUsage(value: unknown, fallback: AgentModelUsage): AgentModelUsage {
  if (!isRecord(value)) return fallback;

  return {
    reasoningEffort: isReasoningEffort(value.reasoningEffort) ? value.reasoningEffort : fallback.reasoningEffort,
    temperature: clampTemperature(value.temperature, fallback.temperature),
    maxToolCalls: clampPositiveInteger(value.maxToolCalls, fallback.maxToolCalls),
    maxOutputTokens: clampPositiveInteger(value.maxOutputTokens, fallback.maxOutputTokens),
    maxContextMessages: clampPositiveInteger(value.maxContextMessages, fallback.maxContextMessages),
    escalationModel:
      typeof value.escalationModel === 'string' && value.escalationModel.trim()
        ? value.escalationModel.trim()
        : fallback.escalationModel,
  };
}

function normalizeAgentId(id: string): string {
  const normalized = id.trim().toLowerCase();
  return AGENT_ID_ALIASES[normalized] ?? normalized;
}

function sortAgentIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ia = DEFAULT_ORDER.indexOf(a);
    const ib = DEFAULT_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function readWorkspaceConfig(workspaceConfigPath: string): WorkspaceConfig | null {
  try {
    if (!fs.existsSync(workspaceConfigPath)) return null;
    return JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf-8')) as WorkspaceConfig;
  } catch {
    return null;
  }
}

function discoverAgentIdsFromFs(agentsDir: string): string[] {
  try {
    if (!fs.existsSync(agentsDir)) return [];

    const dirents = fs.readdirSync(agentsDir, { withFileTypes: true });
    const out: string[] = [];
    for (const d of dirents) {
      const fullPath = path.join(agentsDir, d.name);

      if (d.isDirectory()) {
        out.push(d.name);
        continue;
      }

      // Many deployments store canonical agent ids as symlinks or old aliases.
      if (d.isSymbolicLink()) {
        try {
          if (fs.statSync(fullPath).isDirectory()) out.push(d.name);
        } catch {
          // ignore broken symlinks
        }
      }
    }

    return out;
  } catch {
    return [];
  }
}

function loadStaticMeta(): Record<string, AgentStaticMeta> {
  const useDefault = String(process.env.KITZCHAT_USE_DEFAULT_AGENT_META ?? 'true')
    .trim()
    .toLowerCase() !== 'false';

  const jsonRaw = process.env.KITZCHAT_AGENT_META_JSON?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as unknown;
      if (isRecord(parsed)) return parsed as Record<string, AgentStaticMeta>;
    } catch {
      // ignore
    }
  }

  const filePath = process.env.KITZCHAT_AGENT_META_PATH?.trim();
  if (filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) return parsed as Record<string, AgentStaticMeta>;
    } catch {
      // ignore
    }
  }

  return useDefault ? DEFAULT_STATIC_META : {};
}

function buildSeededAgentEntry(
  workspaceHome: string,
  agentId: string,
  meta: AgentStaticMeta,
  defaultWorkspace?: string,
): WorkspaceAgentEntry {
  return {
    id: agentId,
    name: meta.name ?? toTitleCase(agentId),
    role: meta.role ?? 'Agent',
    description: meta.description ?? `${toTitleCase(agentId)} Agent.`,
    workspace: defaultWorkspaceFor(workspaceHome, agentId, defaultWorkspace),
    model: {
      primary: meta.model ?? DEFAULT_MODEL_PRIMARY,
      fallbacks: meta.fallbacks ?? DEFAULT_MODEL_FALLBACKS,
    },
    identity: {
      emoji: meta.emoji ?? '🤖',
      theme: meta.role ?? 'Agent',
    },
    tools: {
      allow: DEFAULT_TOOLS,
    },
    skills: meta.skills ?? [],
    cronJobs: meta.cronJobs ?? [],
    inspiredBy: meta.inspiredBy ?? null,
    sourceRepo: meta.sourceRepo ?? null,
    apiProviders: meta.apiProviders ?? [],
    customerVisible: meta.customerVisible ?? true,
    prompt: {
      system: meta.systemPrompt ?? buildDefaultSystemPrompt(agentId, meta),
    },
    io: {
      inputFormat: meta.inputFormat ?? buildDefaultInputFormat(agentId),
      outputFormat: meta.outputFormat ?? buildDefaultOutputFormat(agentId),
    },
    policy: {
      limits: meta.limits ?? DEFAULT_LIMITS,
      rules: meta.policies ?? DEFAULT_POLICIES,
    },
    modelUsage: {
      ...buildDefaultModelUsage(agentId, meta),
      ...meta.modelUsage,
    },
  };
}

function persistWorkspaceConfig(workspaceConfigPath: string, config: WorkspaceConfig): void {
  fs.mkdirSync(path.dirname(workspaceConfigPath), { recursive: true });
  fs.writeFileSync(workspaceConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

function ensureTextFile(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function ensureJsonFile(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function scaffoldAgentStorage(workspaceHome: string, agentsDir: string, agent: AgentDefinition): void {
  const agentConfigRoot = path.join(agentsDir, agent.id, 'agent');
  const workspaceRoot = path.resolve(agent.workspace || defaultWorkspaceFor(workspaceHome, agent.id));
  const safeWorkspaceRoot = workspaceRoot.startsWith(path.resolve(workspaceHome) + path.sep)
    ? workspaceRoot
    : path.join(workspaceHome, `workspace-${agent.id}`);

  for (const root of [agentConfigRoot, safeWorkspaceRoot]) {
    for (const dir of ['config', 'core', 'memory']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
  }

  ensureTextFile(
    path.join(agentConfigRoot, 'core', 'CORE.md'),
    [
      `# ${agent.name} Core`,
      '',
      `Rolle: ${agent.role}`,
      '',
      agent.description,
      '',
      'Diese Datei ist die zentrale Markdown-Grundlage fuer den Agenten.',
      'Ergaenze hier Regeln, Zielbild, Stil und feste Leitplanken.',
      '',
    ].join('\n'),
  );
  ensureTextFile(
    path.join(agentConfigRoot, 'memory', 'README.md'),
    [
      `# ${agent.name} Memory`,
      '',
      'Hier liegt dauerhafter Agent-Kontext.',
      'Lege projektbezogene Notizen, Zusammenfassungen und wiederverwendbares Wissen ordnerweise ab.',
      '',
    ].join('\n'),
  );
  ensureJsonFile(path.join(agentConfigRoot, 'config', 'agent.json'), {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    model: agent.model,
    fallbacks: agent.fallbacks,
    tools: agent.tools,
    apiProviders: agent.apiProviders,
    customerVisible: agent.customerVisible,
    workspace: safeWorkspaceRoot,
    systemPrompt: agent.systemPrompt,
    inputFormat: agent.inputFormat,
    outputFormat: agent.outputFormat,
    limits: agent.limits,
    policies: agent.policies,
    modelUsage: agent.modelUsage,
  });
  ensureJsonFile(path.join(agentConfigRoot, 'config', 'skills.json'), {
    skills: agent.skills,
    cronJobs: agent.cronJobs,
  });

  ensureTextFile(
    path.join(safeWorkspaceRoot, 'core', 'mission.md'),
    [
      `# ${agent.name} Mission`,
      '',
      agent.description,
      '',
      `Primärmodell: ${agent.model}`,
      '',
    ].join('\n'),
  );
  ensureTextFile(
    path.join(safeWorkspaceRoot, 'memory', 'context.md'),
    [
      `# ${agent.name} Context`,
      '',
      'Hier werden laufender Kontext, Memory-Auszüge und Arbeitsnotizen des Agenten gespeichert.',
      '',
    ].join('\n'),
  );
  ensureJsonFile(path.join(safeWorkspaceRoot, 'config', 'workspace.json'), {
    agentId: agent.id,
    workspace: safeWorkspaceRoot,
    folders: {
      memory: path.join(safeWorkspaceRoot, 'memory'),
      core: path.join(safeWorkspaceRoot, 'core'),
      config: path.join(safeWorkspaceRoot, 'config'),
    },
  });
}

function ensureWorkspaceCatalog(workspaceConfigPath: string, workspaceHome: string): WorkspaceConfig {
  const config = readWorkspaceConfig(workspaceConfigPath) ?? { agents: { list: [] } };
  const defaultsWorkspace =
    typeof config.agents?.defaults?.workspace === 'string'
      ? config.agents.defaults.workspace.trim()
      : '';

  const seededEntries = Object.entries(loadStaticMeta()).map(([agentId, meta]) =>
    buildSeededAgentEntry(workspaceHome, agentId, meta, defaultsWorkspace || undefined),
  );

  const existingList = Array.isArray(config.agents?.list) ? config.agents?.list : [];
  const existingById = new Map<string, WorkspaceAgentEntry>();
  for (const entry of existingList) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) continue;
    existingById.set(normalizeAgentId(entry.id), entry);
  }

  let changed = false;
  for (const seededEntry of seededEntries) {
    const seededId = normalizeAgentId(String(seededEntry.id ?? ''));
    if (!existingById.has(seededId)) {
      existingById.set(seededId, seededEntry);
      changed = true;
    }
  }

  const nextDefaults = {
    model: config.agents?.defaults?.model ?? {
      primary: DEFAULT_MODEL_PRIMARY,
      fallbacks: DEFAULT_MODEL_FALLBACKS,
    },
    workspace: config.agents?.defaults?.workspace ?? '',
  };

  const nextList = sortAgentIds([...existingById.keys()]).map((id) => existingById.get(id)!);
  const nextConfig: WorkspaceConfig = {
    ...config,
    agents: {
      ...config.agents,
      defaults: nextDefaults,
      list: nextList,
    },
  };

  if (changed || !config.agents?.defaults?.model) {
    persistWorkspaceConfig(workspaceConfigPath, nextConfig);
  }

  return nextConfig;
}

function serializeAgentForWorkspace(agent: AgentDefinition, existing?: WorkspaceAgentEntry): WorkspaceAgentEntry {
  return {
    ...existing,
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    workspace: agent.workspace,
    model: {
      primary: agent.model,
      fallbacks: agent.fallbacks,
    },
    identity: {
      ...(isRecord(existing?.identity) ? existing.identity : {}),
      emoji: agent.emoji,
      theme: agent.role,
    },
    tools: {
      allow: agent.tools,
    },
    skills: agent.skills,
    cronJobs: agent.cronJobs,
    inspiredBy: agent.inspiredBy ?? null,
    sourceRepo: agent.sourceRepo ?? null,
    apiProviders: agent.apiProviders,
    customerVisible: agent.customerVisible,
    prompt: {
      system: agent.systemPrompt,
    },
    io: {
      inputFormat: agent.inputFormat,
      outputFormat: agent.outputFormat,
    },
    policy: {
      limits: agent.limits,
      rules: agent.policies,
    },
    modelUsage: {
      reasoningEffort: agent.modelUsage.reasoningEffort,
      temperature: agent.modelUsage.temperature,
      maxToolCalls: agent.modelUsage.maxToolCalls,
      maxOutputTokens: agent.modelUsage.maxOutputTokens,
      maxContextMessages: agent.modelUsage.maxContextMessages,
      escalationModel: agent.modelUsage.escalationModel ?? null,
    },
  };
}

export function loadAgentCatalog(instanceId?: string): AgentDefinition[] {
  return getAgents(instanceId);
}

export function updateAgentCatalogEntry(
  instanceId: string | undefined,
  agentId: string,
  updates: Partial<Pick<AgentDefinition, 'name' | 'role' | 'description' | 'model' | 'fallbacks' | 'tools' | 'apiProviders' | 'customerVisible' | 'inspiredBy' | 'sourceRepo' | 'systemPrompt' | 'inputFormat' | 'outputFormat' | 'limits' | 'policies'>> & {
    modelUsage?: Partial<AgentModelUsage>;
  },
): AgentDefinition | null {
  const instance = getInstance(instanceId);
  const { workspaceHome, workspaceConfigPath } = resolveWorkspacePaths(instance);
  const config = ensureWorkspaceCatalog(workspaceConfigPath, workspaceHome);
  const currentAgents = getAgents(instance.id);
  const current = currentAgents.find((agent) => agent.id === normalizeAgentId(agentId));
  if (!current) return null;

  const nextAgent: AgentDefinition = {
    ...current,
    name: typeof updates.name === 'string' && updates.name.trim() ? updates.name.trim() : current.name,
    role: typeof updates.role === 'string' && updates.role.trim() ? updates.role.trim() : current.role,
    description:
      typeof updates.description === 'string' && updates.description.trim()
        ? updates.description.trim()
        : current.description,
    model: typeof updates.model === 'string' && updates.model.trim() ? updates.model.trim() : current.model,
    fallbacks: Array.isArray(updates.fallbacks) ? toStringArray(updates.fallbacks) : current.fallbacks,
    tools: Array.isArray(updates.tools) ? toStringArray(updates.tools) : current.tools,
    apiProviders: Array.isArray(updates.apiProviders)
      ? toStringArray(updates.apiProviders)
      : current.apiProviders,
    customerVisible:
      typeof updates.customerVisible === 'boolean' ? updates.customerVisible : current.customerVisible,
    inspiredBy:
      typeof updates.inspiredBy === 'string' && updates.inspiredBy.trim()
        ? updates.inspiredBy.trim()
        : current.inspiredBy,
    sourceRepo:
      typeof updates.sourceRepo === 'string' && updates.sourceRepo.trim()
        ? updates.sourceRepo.trim()
        : current.sourceRepo,
    systemPrompt:
      typeof updates.systemPrompt === 'string' && updates.systemPrompt.trim()
        ? updates.systemPrompt.trim()
        : current.systemPrompt,
    inputFormat:
      typeof updates.inputFormat === 'string' && updates.inputFormat.trim()
        ? updates.inputFormat.trim()
        : current.inputFormat,
    outputFormat:
      typeof updates.outputFormat === 'string' && updates.outputFormat.trim()
        ? updates.outputFormat.trim()
        : current.outputFormat,
    limits: Array.isArray(updates.limits) ? toStringArray(updates.limits) : current.limits,
    policies: Array.isArray(updates.policies) ? toStringArray(updates.policies) : current.policies,
    modelUsage: updates.modelUsage
      ? parseModelUsage(updates.modelUsage as unknown, current.modelUsage)
      : current.modelUsage,
  };

  const currentList = Array.isArray(config.agents?.list) ? config.agents.list : [];
  const nextList = currentList.map((entry) => {
    if (!entry || typeof entry.id !== 'string') return entry;
    if (normalizeAgentId(entry.id) !== nextAgent.id) return entry;
    return serializeAgentForWorkspace(nextAgent, entry);
  });

  persistWorkspaceConfig(workspaceConfigPath, {
    ...config,
    agents: {
      ...config.agents,
      list: nextList,
    },
  });

  return getAgent(instance.id, nextAgent.id) ?? nextAgent;
}

export function getAgents(instanceId?: string): AgentDefinition[] {
  const instance = getInstance(instanceId);
  const { workspaceHome, workspaceConfigPath, agentsDir } = resolveWorkspacePaths(instance);

  const staticMeta = loadStaticMeta();
  const config = ensureWorkspaceCatalog(workspaceConfigPath, workspaceHome);
  const defaultsModel = parseModelRouting(config?.agents?.defaults?.model);
  const defaultsWorkspace =
    typeof config?.agents?.defaults?.workspace === 'string'
      ? config?.agents?.defaults?.workspace.trim()
      : '';

  const configuredList = Array.isArray(config?.agents?.list) ? config?.agents?.list ?? [] : [];
  const configuredById = new Map<string, WorkspaceAgentEntry>();

  for (const entry of configuredList) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) continue;
    const normalizedId = normalizeAgentId(entry.id);
    configuredById.set(normalizedId, entry);
  }

  const ids = new Set<string>();
  if (configuredById.size > 0) {
    for (const id of configuredById.keys()) ids.add(id);
  } else {
    for (const id of discoverAgentIdsFromFs(agentsDir)) ids.add(normalizeAgentId(id));
  }
  if (ids.size === 0) {
    for (const id of Object.keys(staticMeta)) ids.add(id);
  }

  const agents = sortAgentIds([...ids]).map((id) => {
    const configured = configuredById.get(id);
    const meta = staticMeta[id] ?? {};

    const identityEmoji =
      typeof configured?.identity?.emoji === 'string' ? configured.identity.emoji : undefined;
    const identityTheme =
      typeof configured?.identity?.theme === 'string' ? configured.identity.theme : undefined;

    const modelRouting =
      parseModelRouting(configured?.model) ??
      (meta.model ? { primary: meta.model, fallbacks: meta.fallbacks ?? [] } : defaultsModel);
    const allowedTools = parseAllowedTools(configured?.tools);

    const configuredSkills = parseSkills(configured?.skills);
    const configuredCronJobs = parseCronJobs(configured?.cronJobs);
    const apiProviders = toStringArray(configured?.apiProviders);
    const legacyApiProviders = LEGACY_API_PROVIDERS_BY_AGENT[id];
    const useMetaApiProviders =
      Boolean(meta.apiProviders) &&
      apiProviders.length > 0 &&
      Array.isArray(legacyApiProviders) &&
      JSON.stringify(apiProviders) === JSON.stringify(legacyApiProviders);
    const customerVisible =
      typeof configured?.customerVisible === 'boolean'
        ? configured.customerVisible
        : meta.customerVisible ?? true;

    const name =
      (typeof configured?.name === 'string' && configured.name.trim()) ||
      meta.name ||
      toTitleCase(id);

    const role =
      (typeof configured?.role === 'string' && configured.role.trim()) ||
      meta.role ||
      (identityTheme ? toTitleCase(identityTheme) : 'Agent');

    const workspace =
      (typeof configured?.workspace === 'string' && configured.workspace.trim()) ||
      defaultWorkspaceFor(workspaceHome, id, defaultsWorkspace || undefined);
    const defaultModelUsage = buildDefaultModelUsage(id, meta);
    const baselineLimits = DEFAULT_LIMITS;
    const baselinePolicies = DEFAULT_POLICIES;
    const defaultLimits = meta.limits ?? baselineLimits;
    const defaultPolicies = meta.policies ?? baselinePolicies;

    const configuredSystemPrompt =
      typeof configured?.prompt?.system === 'string' && configured.prompt.system.trim()
        ? configured.prompt.system.trim()
        : '';
    const defaultSystemPrompt = buildDefaultSystemPrompt(id, meta);
    const systemPrompt =
      configuredSystemPrompt && (!meta.systemPrompt || configuredSystemPrompt !== defaultSystemPrompt)
        ? configuredSystemPrompt
        : meta.systemPrompt || configuredSystemPrompt || defaultSystemPrompt;

    const configuredInputFormat =
      typeof configured?.io?.inputFormat === 'string' && configured.io.inputFormat.trim()
        ? configured.io.inputFormat.trim()
        : '';
    const defaultInputFormat = buildDefaultInputFormat(id);
    const inputFormat =
      configuredInputFormat && (!meta.inputFormat || configuredInputFormat !== defaultInputFormat)
        ? configuredInputFormat
        : meta.inputFormat || configuredInputFormat || defaultInputFormat;

    const configuredOutputFormat =
      typeof configured?.io?.outputFormat === 'string' && configured.io.outputFormat.trim()
        ? configured.io.outputFormat.trim()
        : '';
    const defaultOutputFormat = buildDefaultOutputFormat(id);
    const outputFormat =
      configuredOutputFormat && (!meta.outputFormat || configuredOutputFormat !== defaultOutputFormat)
        ? configuredOutputFormat
        : meta.outputFormat || configuredOutputFormat || defaultOutputFormat;

    const configuredLimits = toStringArray(configured?.policy?.limits);
    const configuredPolicies = toStringArray(configured?.policy?.rules);
    const useMetaLimits = meta.limits && configuredLimits.length > 0 && JSON.stringify(configuredLimits) === JSON.stringify(baselineLimits);
    const useMetaPolicies = meta.policies && configuredPolicies.length > 0 && JSON.stringify(configuredPolicies) === JSON.stringify(baselinePolicies);
    const limits = configuredLimits.length > 0 && !useMetaLimits ? configuredLimits : defaultLimits;
    const policies = configuredPolicies.length > 0 && !useMetaPolicies ? configuredPolicies : defaultPolicies;

    const metaModelUsage = { ...defaultModelUsage, ...meta.modelUsage };
    const configuredModelUsage = parseModelUsage(configured?.modelUsage, defaultModelUsage);
    const useMetaModelUsage = Boolean(meta.modelUsage) && JSON.stringify(configuredModelUsage) === JSON.stringify(defaultModelUsage);
    const modelUsage = useMetaModelUsage ? metaModelUsage : parseModelUsage(configured?.modelUsage, metaModelUsage);

    return {
      id,
      name,
      emoji: meta.emoji || identityEmoji || '\u{1F916}',
      role,
      description:
        (typeof configured?.description === 'string' && configured.description.trim()) ||
        meta.description ||
        `${name} Agent.`,
      model: modelRouting?.primary || 'unknown',
      fallbacks: modelRouting?.fallbacks ?? [],
      tools: allowedTools,
      skills: configuredSkills.length > 0 ? configuredSkills : meta.skills ?? [],
      cronJobs: configuredCronJobs.length > 0 ? configuredCronJobs : meta.cronJobs ?? [],
      workspace,
      inspiredBy:
        (typeof configured?.inspiredBy === 'string' && configured.inspiredBy.trim()) || meta.inspiredBy,
      sourceRepo:
        (typeof configured?.sourceRepo === 'string' && configured.sourceRepo.trim()) || meta.sourceRepo,
      apiProviders: apiProviders.length > 0 && !useMetaApiProviders ? apiProviders : meta.apiProviders ?? apiProviders,
      customerVisible,
      systemPrompt,
      inputFormat,
      outputFormat,
      limits,
      policies,
      modelUsage,
    };
  });

  for (const agent of agents) {
    scaffoldAgentStorage(workspaceHome, agentsDir, agent);
  }

  return agents;
}

export function getAgentIds(instanceId?: string): string[] {
  return getAgents(instanceId).map((a) => a.id);
}

export function getAgent(instanceId: string | undefined, id: string): AgentDefinition | undefined {
  return getAgents(instanceId).find((a) => a.id === id);
}

// Map activity_log actions to agent + skill (dashboard-local semantics).
export const ACTION_TO_AGENT: Record<string, { agent: string; skill: string }> = {
  post: { agent: 'marketing', skill: 'content-engine' },
  engage: { agent: 'marketing', skill: 'social-engagement' },
  research: { agent: 'marketing', skill: 'x-research' },
  discover: { agent: 'apollo', skill: 'cold-outreach' },
  send: { agent: 'apollo', skill: 'cold-outreach' },
  triage: { agent: 'apollo', skill: 'reply-triage' },
  alert: { agent: 'marketing', skill: 'reporting' },
};
