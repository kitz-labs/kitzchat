/**
 * Exportiert alle aktuell konfigurierten Agenten + CSV Templates in einen Desktop-Ordner.
 * Run: pnpm tsx scripts/export-nexora-agents.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { getAgents, type AgentDefinition } from '../src/lib/agent-config';
import { CSV_TEMPLATES } from '../src/data/downloads/csv-templates';

function safeName(input: string) {
  return input
    .trim()
    .replace(/[^\w\-.\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeText(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, { encoding: 'utf8' });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8' });
}

function agentReadme(agent: AgentDefinition) {
  const tools = (agent.tools || []).map((t) => `- ${t}`).join('\n') || '- (none)';
  const apiProviders = (agent.apiProviders || []).map((p) => `- ${p}`).join('\n') || '- (none)';
  const skills = (agent.skills || []).map((s) => `- ${s.name}: ${s.description}`).join('\n') || '- (none)';

  return [
    `# ${agent.emoji || '🤖'} ${agent.name}`,
    ``,
    `**ID:** \`${agent.id}\``,
    `**Rolle:** ${agent.role}`,
    `**Model:** \`${agent.model}\`${agent.fallbacks?.length ? ` (Fallbacks: ${agent.fallbacks.map((m) => `\`${m}\``).join(', ')})` : ''}`,
    `**Customer Visible:** ${agent.customerVisible ? 'ja' : 'nein'}`,
    agent.inspiredBy ? `**Inspired By:** ${agent.inspiredBy}` : '',
    agent.sourceRepo ? `**Source Repo:** ${agent.sourceRepo}` : '',
    ``,
    `## Kurzbeschreibung`,
    agent.description || '',
    ``,
    `## Skills`,
    skills,
    ``,
    `## Tools (allowed)`,
    tools,
    ``,
    `## API Providers / Datenquellen`,
    apiProviders,
    ``,
    `## Dateien in diesem Ordner`,
    `- \`agent.json\` – komplette Konfiguration`,
    `- \`SYSTEM_PROMPT.md\` – System Prompt`,
    `- \`INPUT_FORMAT.md\` – Input Format`,
    `- \`OUTPUT_FORMAT.md\` – Output Format`,
    `- \`LIMITS.md\` – Limits`,
    `- \`POLICIES.md\` – Policies`,
    ``,
    `## Quickstart (Copy/Paste)`,
    '```',
    'ZIEL: …',
    'KONTEXT:',
    '- …',
    'INPUT (Daten):',
    '- …',
    'OUTPUT:',
    '- Format: Tabelle/CSV/JSON',
    '- Struktur: …',
    'QUALITY CHECK:',
    '- Annahmen, Risiken, offene Fragen',
    '```',
    ``,
  ]
    .filter(Boolean)
    .join('\n');
}

function rootDescriptions() {
  const maximal = [
    '# Beschreibung App (maximal)',
    '',
    'KitzChat (Nexora Branding) ist ein Business‑KI‑Arbeitsbereich fuer Kunden und Admins.',
    'Kern: kuratierte Premium‑Agenten, Wallet/Top‑up (Stripe), klare Rollen/Berechtigungen, Support und Reporting.',
    '',
    'Highlights:',
    '- Wallet-/Top‑up‑Modell: Guthaben aufladen, Tokens verbrauchen, transparente Usage.',
    '- Agenten-Katalog: pro Agent System Prompt, Input/Output Format, Policies & Limits.',
    '- Kundenbereich: Webchat, Agenten, Guthaben, Downloads (CSV Templates), Hilfe, Support.',
    '- Adminbereich: Branding, SMTP/E-Mail, Betrieb, Reporting, Agenten-Kuration.',
    '',
    'Ziel: Ultra‑Business Outputs – reproduzierbar, strukturiert und sofort umsetzbar.',
    '',
  ].join('\n');

  const medium = [
    '# Beschreibung App (medium)',
    '',
    'KitzChat ist eine Business‑KI‑Plattform mit kuratierten Agenten, Wallet/Top‑up (Stripe) und einem klaren Kunden-/Admin‑Dashboard.',
    'Kunden nutzen Agenten ueber definierte Input/Output‑Formate; Admins steuern Betrieb, E‑Mail und Kuration.',
    '',
  ].join('\n');

  const small = [
    '# Beschreibung App (small)',
    '',
    'KitzChat: Premium‑Agenten + Wallet/Top‑up + Business‑Dashboard.',
    '',
  ].join('\n');

  const social = [
    '# Beschreibung Social Media',
    '',
    'Kurzpost (LinkedIn):',
    '„Wir bringen KI ins Tagesgeschaeft: kuratierte Agenten, klare Input/Output‑Formate und ein Wallet‑Modell fuer planbare Kosten. Business‑ready – ohne Spielerei.“',
    '',
    'Hashtags:',
    '#KI #AI #Automation #LLM #BusinessApps #Agenten #Produktivitaet',
    '',
  ].join('\n');

  const datenname = [
    '# Inhalt (Dateiname = Inhalt)',
    '',
    'Diese Sammlung ist absichtlich so strukturiert, dass der Dateiname immer beschreibt, was drin ist:',
    '- Agent‑Ordner enthalten: Prompt, Input/Output, Limits/Policies und eine JSON‑Config.',
    '- CSV‑Templates enthalten: gefuellte Beispielzeilen fuer reale Business‑Workflows.',
    '',
  ].join('\n');

  return { maximal, medium, small, social, datenname };
}

async function exportAgents(outDir: string) {
  const agents = getAgents();
  const agentsDir = path.join(outDir, 'agents');
  const csvDir = path.join(outDir, 'csv-templates');

  await ensureDir(outDir);
  await ensureDir(agentsDir);
  await ensureDir(csvDir);

  // Root docs
  const d = rootDescriptions();
  await writeText(path.join(outDir, 'beschreibung App maximal.md'), d.maximal);
  await writeText(path.join(outDir, 'beschreibung App medium.md'), d.medium);
  await writeText(path.join(outDir, 'beschreibung app small.md'), d.small);
  await writeText(path.join(outDir, 'beschreibung Social Media.md'), d.social);
  await writeText(path.join(outDir, 'inhalt sagt der daten name.md'), d.datenname);

  // Export CSV templates
  const csvIndex: Array<{ slug: string; filename: string; title: string; category: string; tags: string[] }> = [];
  for (const t of CSV_TEMPLATES) {
    const fileName = safeName(t.filename || `${t.slug}.csv`);
    await writeText(path.join(csvDir, fileName), t.csv.trimEnd() + '\n');
    csvIndex.push({ slug: t.slug, filename: fileName, title: t.title, category: t.category, tags: t.tags });
  }
  await writeJson(path.join(csvDir, 'index.json'), csvIndex);

  // Export agents
  const index: Array<{ id: string; name: string; folder: string; customerVisible: boolean; model: string }> = [];

  for (const agent of agents) {
    const folder = safeName(agent.id);
    const dir = path.join(agentsDir, folder);
    await ensureDir(dir);

    await writeJson(path.join(dir, 'agent.json'), agent);
    await writeText(path.join(dir, 'README.md'), agentReadme(agent));
    await writeText(path.join(dir, 'SYSTEM_PROMPT.md'), (agent.systemPrompt || '').trim() + '\n');
    await writeText(path.join(dir, 'INPUT_FORMAT.md'), (agent.inputFormat || '').trim() + '\n');
    await writeText(path.join(dir, 'OUTPUT_FORMAT.md'), (agent.outputFormat || '').trim() + '\n');
    await writeText(path.join(dir, 'LIMITS.md'), (agent.limits || []).map((l) => `- ${l}`).join('\n').trim() + '\n');
    await writeText(path.join(dir, 'POLICIES.md'), (agent.policies || []).map((p) => `- ${p}`).join('\n').trim() + '\n');

    index.push({ id: agent.id, name: agent.name, folder: `agents/${folder}`, customerVisible: agent.customerVisible, model: agent.model });
  }

  await writeJson(path.join(outDir, 'AGENT_INDEX.json'), index);
  await writeText(
    path.join(outDir, 'AGENT_INDEX.md'),
    [
      '# Agent Index',
      '',
      'Auflistung aller aktuell konfigurierten Agenten inkl. Ordnerpfad.',
      '',
      ...index.map((a) => `- \`${a.id}\` – ${a.name} (${a.customerVisible ? 'customer' : 'hidden'}) – \`${a.folder}\``),
      '',
    ].join('\n'),
  );

  return { agentCount: agents.length, csvCount: CSV_TEMPLATES.length };
}

async function main() {
  const outDir = process.env.NEXORA_AGENTS_DIR?.trim() || path.join(os.homedir(), 'Desktop', 'NexoraAgents');
  const res = await exportAgents(outDir);
  // eslint-disable-next-line no-console
  console.log(`Export fertig: ${res.agentCount} Agenten, ${res.csvCount} CSV Templates → ${outDir}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

