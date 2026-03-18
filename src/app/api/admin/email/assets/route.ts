import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAppStateDir } from '@/lib/app-state';
import { buildPublicUrl } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

function sanitizeFilename(name: string): string {
  const base = name
    .trim()
    .replaceAll(' ', '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  return base || 'asset';
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function asUrl(name: string): string {
  return buildPublicUrl(`/email-assets/${name}`);
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const dir = path.join(getAppStateDir(), 'email-assets');
    await ensureDir(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => ALLOWED_EXT.has(path.extname(n).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ ok: true, files: files.map((name) => ({ name, url: asUrl(name) })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list assets';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const form = await request.formData();
    const file = form.get('file');
    const desiredName = form.get('name');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file fehlt' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: `file zu gross (max ${MAX_BYTES} bytes)` }, { status: 400 });
    }

    const original = sanitizeFilename(file.name || 'asset');
    const ext = path.extname(original).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: `Dateityp nicht erlaubt (${ext || 'unknown'})` }, { status: 400 });
    }

    const nameBase = typeof desiredName === 'string' && desiredName.trim() ? sanitizeFilename(desiredName) : original.replace(new RegExp(`${ext}$`, 'i'), '');
    const dir = path.join(getAppStateDir(), 'email-assets');
    await ensureDir(dir);

    let finalName = `${nameBase}${ext}`;
    const target = async (n: string) => path.join(dir, n);

    try {
      await fs.stat(await target(finalName));
      finalName = `${nameBase}-${Date.now()}${ext}`;
    } catch {
      // ok, does not exist
    }

    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(await target(finalName), buf);
    return NextResponse.json({ ok: true, name: finalName, url: asUrl(finalName) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload asset';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to upload asset' }, { status: 500 });
  }
}

