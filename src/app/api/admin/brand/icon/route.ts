import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getAppStateDir } from '@/lib/app-state';
import { readSettings, writeSettings } from '@/lib/settings';
import { buildPublicUrl } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

function assetPath() {
  return path.join(getAppStateDir(), 'branding', 'icon.png');
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    const exists = await fs
      .stat(assetPath())
      .then((s) => s.isFile())
      .catch(() => false);
    return NextResponse.json({
      ok: true,
      exists,
      url: buildPublicUrl('/brand/icon.png'),
      updated_at: settings.branding?.icon_updated_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load icon';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load icon' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file fehlt' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: `file zu gross (max ${MAX_BYTES} bytes)` }, { status: 400 });
    const type = (file.type || '').toLowerCase();
    if (type !== 'image/png') return NextResponse.json({ error: 'Nur PNG erlaubt (image/png)' }, { status: 400 });

    await fs.mkdir(path.dirname(assetPath()), { recursive: true });
    await fs.writeFile(assetPath(), Buffer.from(await file.arrayBuffer()));

    const settings = readSettings();
    settings.branding = settings.branding || {};
    settings.branding.icon_updated_at = new Date().toISOString();
    writeSettings(settings);

    return NextResponse.json({ ok: true, url: buildPublicUrl('/brand/icon.png'), updated_at: settings.branding.icon_updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload icon';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to upload icon' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    await fs.unlink(assetPath()).catch(() => {});
    const settings = readSettings();
    if (settings.branding) delete settings.branding.icon_updated_at;
    writeSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete icon';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to delete icon' }, { status: 500 });
  }
}

