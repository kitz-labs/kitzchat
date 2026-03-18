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

function logoPath() {
  return path.join(getAppStateDir(), 'branding', 'logo.png');
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    const p = logoPath();
    const exists = await fs
      .stat(p)
      .then((s) => s.isFile())
      .catch(() => false);
    return NextResponse.json({
      ok: true,
      exists,
      url: buildPublicUrl('/brand/logo.png'),
      updated_at: settings.branding?.logo_updated_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load branding';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load branding' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file fehlt' }, { status: 400 });

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: `file zu gross (max ${MAX_BYTES} bytes)` }, { status: 400 });
    }

    const type = (file.type || '').toLowerCase();
    if (type !== 'image/png') {
      return NextResponse.json({ error: 'Nur PNG erlaubt (image/png)' }, { status: 400 });
    }

    const dir = path.dirname(logoPath());
    await fs.mkdir(dir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(logoPath(), buf);

    const settings = readSettings();
    settings.branding = settings.branding || {};
    settings.branding.logo_updated_at = new Date().toISOString();
    writeSettings(settings);

    return NextResponse.json({ ok: true, url: buildPublicUrl('/brand/logo.png'), updated_at: settings.branding.logo_updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload logo';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    await fs.unlink(logoPath()).catch(() => {});
    const settings = readSettings();
    if (settings.branding) delete settings.branding.logo_updated_at;
    writeSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete logo';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to delete logo' }, { status: 500 });
  }
}

