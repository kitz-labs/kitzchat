import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAppStateDir } from './app-state';

export type WorkspaceInstance = {
  id: string;
  label: string;
  workspaceRoot: string;
  cronUser?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function normalizeId(raw: unknown): string {
  return String(raw ?? '').trim();
}

function normalizeLabel(raw: unknown, fallback: string): string {
  const v = String(raw ?? '').trim();
  return v ? v : fallback;
}

function normalizeHome(raw: unknown): string {
  const v = String(raw ?? '').trim();
  return path.resolve(expandHome(v));
}

function ensureWorkspaceScaffold(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  for (const dir of ['agents', 'cron', 'health', 'logs', 'shared']) {
    fs.mkdirSync(path.join(resolved, dir), { recursive: true });
  }
  for (const dir of ['config', 'core', 'memory']) {
    fs.mkdirSync(path.join(resolved, 'shared', dir), { recursive: true });
  }

  const configPath = path.join(resolved, 'workspace.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [] } }, null, 2));
  }

  const sharedReadmePath = path.join(resolved, 'shared', 'README.md');
  if (!fs.existsSync(sharedReadmePath)) {
    fs.writeFileSync(
      sharedReadmePath,
      [
        '# Shared Workspace',
        '',
        'Hier liegen gemeinsame Dateien fuer alle Agenten.',
        '- `memory/` fuer uebergreifenden Kontext',
        '- `core/` fuer zentrale Markdown-Grundlagen',
        '- `config/` fuer gemeinsame Konfigurationen',
        '',
      ].join('\n'),
      'utf-8',
    );
  }
  return resolved;
}

function parseInstancesFromEnv(): WorkspaceInstance[] | null {
  const raw = process.env.KITZCHAT_WORKSPACE_INSTANCES?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;

    const out: WorkspaceInstance[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const id = normalizeId(item.id);
      const workspaceRoot = normalizeHome(item.workspaceRoot);
      if (!id || !workspaceRoot) continue;
      out.push({
        id,
        label: normalizeLabel(item.label, id),
        workspaceRoot: ensureWorkspaceScaffold(workspaceRoot),
        cronUser:
          typeof item.cronUser === 'string' && item.cronUser.trim()
            ? item.cronUser.trim()
            : undefined,
      });
    }

    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function getDefaultInstanceId(): string {
  const v = process.env.KITZCHAT_DEFAULT_INSTANCE?.trim();
  return v ? v : 'default';
}

export function getInstances(): WorkspaceInstance[] {
  const fromEnv = parseInstancesFromEnv();
  if (fromEnv) return fromEnv;

  const defaultId = getDefaultInstanceId();
  const workspaceRoot = process.env.KITZCHAT_WORKSPACE_ROOT?.trim() || path.join(getAppStateDir(), 'runtime', defaultId);

  return [
    {
      id: defaultId,
      label: 'Default Workspace',
      workspaceRoot: ensureWorkspaceScaffold(path.resolve(expandHome(workspaceRoot))),
      cronUser: process.env.KITZCHAT_CRON_USER?.trim() || undefined,
    },
  ];
}

export function getInstance(id?: string | null): WorkspaceInstance {
  const instances = getInstances();
  const wanted = (id ?? '').trim();

  if (wanted) {
    const match = instances.find((it) => it.id === wanted);
    if (match) return match;
  }

  return (
    instances[0] ?? {
      id: getDefaultInstanceId(),
      label: 'Default Workspace',
      workspaceRoot: ensureWorkspaceScaffold(path.join(getAppStateDir(), 'runtime', getDefaultInstanceId())),
    }
  );
}

export function resolveWorkspacePaths(instance: WorkspaceInstance): {
  workspaceHome: string;
  workspaceConfigPath: string;
  agentsDir: string;
  cronDir: string;
  healthDir: string;
  logsDir: string;
} {
  const workspaceHome = ensureWorkspaceScaffold(instance.workspaceRoot);
  return {
    workspaceHome,
    workspaceConfigPath: path.join(workspaceHome, 'workspace.json'),
    agentsDir: path.join(workspaceHome, 'agents'),
    cronDir: path.join(workspaceHome, 'cron'),
    healthDir: path.join(workspaceHome, 'health'),
    logsDir: path.join(workspaceHome, 'logs'),
  };
}

export function allowPolicyWrite(): boolean {
  return String(process.env.KITZCHAT_ALLOW_POLICY_WRITE ?? '').trim().toLowerCase() === 'true';
}

export function allowCronWrite(): boolean {
  return String(process.env.KITZCHAT_ALLOW_CRON_WRITE ?? '').trim().toLowerCase() === 'true';
}

export function allowWorkspaceWrite(): boolean {
  return String(process.env.KITZCHAT_ALLOW_WORKSPACE_WRITE ?? '').trim().toLowerCase() === 'true';
}
