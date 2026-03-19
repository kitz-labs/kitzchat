import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppStateDir } from '@/lib/app-state';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';

type MemorySummaryMeta = {
  updated_at: string;
  source_file: string;
  source_updated_at: string;
};

export type CustomerMemoryFile = {
  path: string;
  name: string;
  size_bytes: number;
  updated_at: string;
};

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'customer';
}

export function resolveCustomerMemoryBasePath(userId: number, username: string): string {
  const preferences = ensureCustomerPreferences(userId);
  if (preferences.memory_storage_mode === 'custom' && preferences.memory_storage_path.trim()) {
    return preferences.memory_storage_path.trim();
  }
  // Cloud mode currently stores memory locally; cloud credentials are used by agents as context.
  return path.join(getAppStateDir(), 'customer-memory', `${sanitizePathSegment(username)}-${userId}`);
}

function assertSafeRelativeFile(file: string) {
  if (!file || typeof file !== 'string') throw new Error('file_required');
  if (file.includes('..') || path.isAbsolute(file)) throw new Error('invalid_file');
  if (file.startsWith('/') || file.startsWith('\\')) throw new Error('invalid_file');
}

export async function listCustomerMemoryFiles(userId: number, username: string): Promise<{ basePath: string; files: CustomerMemoryFile[] }> {
  const basePath = resolveCustomerMemoryBasePath(userId, username);
  const conversationsDir = path.join(basePath, 'conversations');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(conversationsDir);
  } catch {
    return { basePath, files: [] };
  }

  const files: CustomerMemoryFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(conversationsDir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      files.push({
        path: path.posix.join('conversations', entry),
        name: entry,
        size_bytes: stat.size,
        updated_at: stat.mtime.toISOString(),
      });
    } catch {
      // ignore
    }
  }

  files.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return { basePath, files };
}

export async function readCustomerMemoryFile(userId: number, username: string, file: string): Promise<{ basePath: string; file: string; content: string }> {
  assertSafeRelativeFile(file);
  const basePath = resolveCustomerMemoryBasePath(userId, username);
  const resolved = path.resolve(basePath, file);
  const baseResolved = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(baseResolved)) throw new Error('invalid_file');
  const content = await fs.readFile(resolved, 'utf-8');
  return { basePath, file, content };
}

export async function getRecentCustomerMemorySnippet(userId: number, username: string, maxChars = 6000): Promise<string> {
  const { basePath, files } = await listCustomerMemoryFiles(userId, username);
  const newest = files[0];
  if (!newest) return '';
  try {
    const resolved = path.resolve(basePath, newest.path);
    const raw = await fs.readFile(resolved, 'utf-8');
    const summaryPath = path.join(basePath, 'memory-summary.md');
    const metaPath = path.join(basePath, 'memory-summary.meta.json');
    const rawTooBig = raw.length > 12_000;

    const nowIso = new Date().toISOString();
    const safeSourceUpdatedAt = newest.updated_at;
    const shouldRebuildSummary = async () => {
      if (!rawTooBig) return false;
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as Partial<MemorySummaryMeta>;
        if (!meta?.source_file || !meta?.source_updated_at) return true;
        return meta.source_file !== newest.path || meta.source_updated_at !== safeSourceUpdatedAt;
      } catch {
        return true;
      }
    };

    const buildCompactSummary = (input: string): string => {
      // Token-saving heuristic: keep headings, bullet highlights, and the last few exchanges.
      const lines = input.split('\n');
      const headings: string[] = [];
      const highlights: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('#')) {
          headings.push(t.slice(0, 160));
          continue;
        }
        if (t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s/.test(t)) {
          if (highlights.length < 40) highlights.push(t.slice(0, 220));
          continue;
        }
        if (/^(todo|entscheidung|decision|fix|bug|blocked)\b/i.test(t)) {
          if (highlights.length < 40) highlights.push(t.slice(0, 220));
        }
      }
      const tail = input.length > 2400 ? input.slice(Math.max(0, input.length - 2400)) : input;
      const summaryParts = [
        `# MEMORY_SUMMARY`,
        `updated_at: ${nowIso}`,
        `source: ${newest.path}`,
        `source_updated_at: ${safeSourceUpdatedAt}`,
        '',
        headings.length ? `Headings:\n${headings.slice(-18).join('\n')}` : '',
        highlights.length ? `\nHighlights:\n${highlights.slice(0, 30).join('\n')}` : '',
        `\nRecent Tail:\n${tail}`.trimEnd(),
      ].filter(Boolean);
      const summary = summaryParts.join('\n');
      return summary.length > 4200 ? summary.slice(0, 4200) : summary;
    };

    if (await shouldRebuildSummary()) {
      await fs.mkdir(basePath, { recursive: true }).catch(() => {});
      const summary = buildCompactSummary(raw);
      await fs.writeFile(summaryPath, summary, 'utf-8').catch(() => {});
      const meta: MemorySummaryMeta = {
        updated_at: nowIso,
        source_file: newest.path,
        source_updated_at: safeSourceUpdatedAt,
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8').catch(() => {});
    }

    let memoryBody = raw;
    if (rawTooBig) {
      try {
        memoryBody = await fs.readFile(summaryPath, 'utf-8');
      } catch {
        memoryBody = raw;
      }
    }

    const clipped = memoryBody.length > maxChars ? memoryBody.slice(memoryBody.length - maxChars) : memoryBody;
    return [
      `# CUSTOMER_MEMORY`,
      `source: ${newest.path}`,
      `updated_at: ${newest.updated_at}`,
      '',
      clipped,
    ].join('\n');
  } catch {
    return '';
  }
}
