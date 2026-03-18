import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppStateDir } from '@/lib/app-state';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';

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
    const clipped = raw.length > maxChars ? raw.slice(raw.length - maxChars) : raw;
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
