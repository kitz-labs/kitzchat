import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { requireApiUser } from '@/lib/api-auth';
import { getInstance, resolveWorkspacePaths } from '@/lib/instances';
import { getAgentWorkspaceRoot } from '@/lib/agent-workspace';

export const dynamic = 'force-dynamic';

type RootKind = 'agent-workspace' | 'workspace' | 'agent';

type Root = {
  id: string;
  label: string;
  kind: RootKind;
  writable: boolean;
  agents?: string[];
};

function getInstanceIdFromRequest(req: NextRequest): string | null {
  try {
    const url = new URL(req.url);
    return url.searchParams.get('instance') || url.searchParams.get('namespace');
  } catch {
    return null;
  }
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((s) => s.slice(0, 1).toUpperCase() + s.slice(1))
    .join(' ');
}

/** Returns true only for real directories (not symlinks). */
async function isRealDir(p: string): Promise<boolean> {
  try {
    const lst = await fs.lstat(p);
    if (lst.isSymbolicLink()) return false;
    return lst.isDirectory();
  } catch {
    return false;
  }
}

/** Returns true if path is a directory (follows symlinks). */
async function isDir(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

interface AgentConfig {
  name: string;
  dirName?: string;
  displayName?: string;
  workspace?: string;
}

/** Read agent list from the local workspace config for dynamic agent roots. */
async function readAgentList(workspaceHome: string): Promise<AgentConfig[]> {
  try {
    const configPath = path.join(workspaceHome, 'workspace.json');
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const agents = config?.agents;
    if (!agents) return [];

    const list: unknown[] = Array.isArray(agents)
      ? agents
      : Array.isArray(agents?.list)
        ? agents.list
        : [];

    const out: AgentConfig[] = [];
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const a = item as Record<string, unknown>;
      const name = String(a.name ?? '').trim();
      if (!name) continue;

      // workspace can be a string path or an object with a path.
      let workspace: string | undefined;
      if (typeof a.workspace === 'string' && a.workspace.trim()) {
        workspace = a.workspace.trim();
      } else if (typeof a.workspace === 'object' && a.workspace !== null) {
        const w = a.workspace as Record<string, unknown>;
        const p = w.directory ?? w.path ?? w.dir;
        if (typeof p === 'string' && p.trim()) workspace = p.trim();
      }

      out.push({
        name,
        dirName: typeof a.dirName === 'string' ? a.dirName.trim() : undefined,
        displayName: typeof a.displayName === 'string' ? a.displayName.trim() : undefined,
        workspace,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Resolve an agent's workspace path to a root ID that matches our root naming.
 * Returns null if it maps to the top-level agent workspace or can't be resolved.
 */
function resolveWorkspaceToRootId(
  wsPath: string,
  workspaceHome: string,
  agentWorkspaceRoot: string,
): string | null {
  const resolved = path.resolve(wsPath);

  // If it points to the top-level agent workspace root.
  if (resolved === path.resolve(agentWorkspaceRoot)) {
    return 'agent-workspace';
  }

  // If it's a workspace-* under the runtime root (possibly via symlink).
  const resolvedHome = path.resolve(workspaceHome);
  const rel = path.relative(resolvedHome, resolved);

  // Direct: workspace-foo or a symlink workspace-bar → workspace-foo
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    if (rel.startsWith('workspace-')) {
      // Follow symlink to get the real directory name.
      try {
        const realResolved = realpathSync(resolved);
        const realRel = path.relative(resolvedHome, realResolved);
        if (realRel.startsWith('workspace-')) {
          return realRel;
        }
      } catch {
        return rel;
      }
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const auth = requireApiUser(req as unknown as Request);
  if (auth) return auth;

  const instanceId = getInstanceIdFromRequest(req);
  const instance = getInstance(instanceId);
  const { workspaceHome } = resolveWorkspacePaths(instance);
  const agentWorkspaceRoot = getAgentWorkspaceRoot();

  // Read agent config for labels and workspace mapping.
  const agentList = await readAgentList(workspaceHome);

  // Build workspace → agent names mapping.
  const wsToAgents = new Map<string, string[]>();
  for (const agent of agentList) {
    if (!agent.workspace) continue;
    const rootId = resolveWorkspaceToRootId(agent.workspace, workspaceHome, agentWorkspaceRoot);
    if (!rootId) continue;
    const label = agent.displayName || agent.name;
    const existing = wsToAgents.get(rootId) || [];
    existing.push(label);
    wsToAgents.set(rootId, existing);
  }

  const roots: Root[] = [];

  // Static: Agent Workspace root.
  const awAgents = wsToAgents.get('agent-workspace');
  roots.push({
    id: 'agent-workspace',
    label: 'Agent Workspace',
    kind: 'agent-workspace',
    writable: true,
    ...(awAgents?.length ? { agents: awAgents } : {}),
  });

  // Workspace folders: workspace-* and shared (skip symlinks to avoid duplicates).
  try {
    const names = await fs.readdir(workspaceHome);
    for (const name of names) {
      if (!name) continue;
      if (name === 'shared') {
        const p = path.join(workspaceHome, name);
        if (await isRealDir(p)) {
          roots.push({ id: 'shared', label: 'Shared', kind: 'workspace', writable: true });
        }
        continue;
      }

      if (!name.startsWith('workspace-')) continue;
      const p = path.join(workspaceHome, name);
      if (!(await isRealDir(p))) continue;
      const slug = name.slice('workspace-'.length) || name;
      const agents = wsToAgents.get(name);
      roots.push({
        id: name,
        label: titleCaseFromSlug(slug),
        kind: 'workspace',
        writable: true,
        ...(agents?.length ? { agents } : {}),
      });
    }
  } catch {
    // ignore
  }

  // Agent config roots: driven by workspace.json agent list.
  const agentsDir = path.join(workspaceHome, 'agents');
  for (const agent of agentList) {
    const dirSlug = agent.dirName || agent.name.toLowerCase().replace(/\s+/g, '-');
    const agentCfg = path.join(agentsDir, dirSlug, 'agent');
    if (!(await isDir(agentCfg))) continue;
    roots.push({
      id: `agent:${dirSlug}`,
      label: agent.displayName || agent.name,
      kind: 'agent',
      writable: true,
    });
  }

  // Stable ordering.
  const order: Record<RootKind, number> = {
    'agent-workspace': 0,
    workspace: 1,
    agent: 2,
  };

  roots.sort((a, b) => {
    const ka = order[a.kind] ?? 99;
    const kb = order[b.kind] ?? 99;
    if (ka !== kb) return ka - kb;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json({ instance: instance.id, roots });
}
