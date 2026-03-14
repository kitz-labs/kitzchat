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

const AGENT_ID_ALIASES: Record<string, string> = {
  sales: 'apollo',
  knowledge: 'athena',
  analytics: 'metis',
  manager: 'main',
  core: 'main',
};

const DEFAULT_STATIC_META: Record<string, AgentStaticMeta> = {
  main: {
    name: 'Leitstand',
    emoji: '🎛️',
    role: 'Orchestrierung',
    description: 'Steuert Aufgaben, waehlt den passenden Spezialagenten und strukturiert den besten Ablauf fuer den Kunden.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1', 'gpt-4o-mini'],
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
    apiProviders: ['GitHub', 'StackExchange'],
    customerVisible: true,
  },
  marketing: {
    name: 'MarketingAgent',
    emoji: '\u{1F3DB}\u{FE0F}',
    role: 'Marketing & Positionierung',
    description: 'Plant Kampagnen, formuliert Inhalte, baut Hooks und uebersetzt Ideen in marktfaehige Botschaften.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
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
    apiProviders: ['The Guardian', 'Pexels', 'Pixabay'],
    customerVisible: true,
  },
  apollo: {
    name: 'SalesAgent',
    emoji: '\u{1F3AF}',
    role: 'Vertrieb & Outreach',
    description: 'Priorisiert Leads, entwickelt Ansprache und strukturiert Outreach-Sequenzen mit klaren naechsten Schritten.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
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
    apiProviders: ['Clearbit-style local CRM data', 'REST Countries'],
    customerVisible: true,
  },
  athena: {
    name: 'ResearchAgent',
    emoji: '\u{1F9E0}',
    role: 'Recherche & Analyse',
    description: 'Erstellt Recherche-Briefings, Marktuebersichten, Quellenpakete und belastbare Zusammenfassungen.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1'],
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
    apiProviders: ['Wikipedia', 'Crossref', 'arXiv', 'CORE'],
    customerVisible: true,
  },
  metis: {
    name: 'AnalyticsAgent',
    emoji: '\u{1F4CA}',
    role: 'Kennzahlen & Reporting',
    description: 'Verdichtet KPIs, zeigt Trends, vergleicht Zeitraeume und macht operative Risiken sichtbar.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
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
    apiProviders: ['FRED', 'World Bank', 'SEC EDGAR'],
    customerVisible: true,
  },
  'kb-manager': {
    name: 'MemoryAgent',
    emoji: '\u{1F4DA}',
    role: 'Wissen & Memory',
    description: 'Pflegt dauerhaftes Wissen, bereitet Memory-Eintraege auf und haelt Projektkontext sauber nutzbar.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
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
    apiProviders: ['GitHub', 'npm Registry'],
    customerVisible: true,
  },
  'browser-operator': {
    name: 'BrowserAgent',
    emoji: '🧭',
    role: 'Browser & Web-Workflows',
    description: 'Plant Browserablaeufe, prueft Web-Schritte und beschreibt manuelle Operator-Workflows sauber.',
    model: 'gpt-4o-mini',
    fallbacks: ['gpt-4.1'],
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
    apiProviders: ['Open-Meteo', 'transport.rest'],
    customerVisible: true,
  },
  codepilot: {
    name: 'CodeAgent',
    emoji: '🛠️',
    role: 'Technik & Umsetzung',
    description: 'Hilft bei technischer Planung, Code-Struktur, API-Konzepten und belastbaren Umsetzungsschritten.',
    model: 'gpt-5.4',
    fallbacks: ['gpt-4.1'],
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
    apiProviders: ['GitHub', 'CDNJS', 'APIs.guru'],
    customerVisible: true,
  },
  'support-concierge': {
    name: 'SupportAgent',
    emoji: '🎧',
    role: 'Support & Kundenservice',
    description: 'Formuliert Support-Antworten, sortiert Anfragen und leitet daraus konkrete Folgeaktionen ab.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
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
    apiProviders: ['Open Food Facts', 'Open Brewery DB'],
    customerVisible: true,
  },
  'campaign-studio': {
    name: 'CampaignAgent',
    emoji: '🎬',
    role: 'Kampagnenbau',
    description: 'Baut aus Zielen, Botschaften und Tests einen startklaren Kampagnenplan mit Assets und Verteilung.',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o-mini'],
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
    apiProviders: ['GNews', 'Currents', 'Pexels'],
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
  };
}

export function loadAgentCatalog(instanceId?: string): AgentDefinition[] {
  return getAgents(instanceId);
}

export function updateAgentCatalogEntry(
  instanceId: string | undefined,
  agentId: string,
  updates: Partial<Pick<AgentDefinition, 'name' | 'role' | 'description' | 'model' | 'fallbacks' | 'tools' | 'apiProviders' | 'customerVisible' | 'inspiredBy' | 'sourceRepo'>>,
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

    return {
      id,
      name,
      emoji: meta.emoji || identityEmoji || '\u{1F916}',
      role,
      description: meta.description || `${name} Agent.`,
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
      apiProviders: apiProviders.length > 0 ? apiProviders : meta.apiProviders ?? [],
      customerVisible,
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
