import net from 'node:net';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readSettings, writeSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function normalizeHost(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  if (v.length > 255) return null;
  return v;
}

function normalizeUser(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  if (v.length > 191) return null;
  return v;
}

function normalizeRootDir(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  if (v.length > 500) return null;
  return v;
}

function normalizePort(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const port = Math.round(n);
  if (port <= 0 || port > 65535) return null;
  return port;
}

async function verifyFtpConnection(params: { host: string; port: number }): Promise<{ ok: boolean; banner?: string; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeoutMs = 3500;
    let banner = '';
    let done = false;

    const finish = (payload: { ok: boolean; banner?: string; error?: string }) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(payload);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish({ ok: false, error: 'timeout' }));
    socket.once('error', (err) => finish({ ok: false, error: err?.message || 'socket_error' }));
    socket.once('data', (buf) => {
      banner = String(buf?.toString('utf-8') || '').trim().slice(0, 180);
      finish({ ok: true, banner });
    });

    socket.connect(params.port, params.host, () => {
      // Some FTP servers send banner immediately; if not, we still count TCP connect as "ok".
      setTimeout(() => finish({ ok: true, banner: banner || undefined }), 450);
    });
  });
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const url = new URL(request.url);
    const verify = url.searchParams.get('verify') === '1';

    const settings = readSettings();
    const ftp = settings.website?.ftp || {};
    const host = ftp.host?.trim() || null;
    const port = typeof ftp.port === 'number' ? ftp.port : null;
    const user = ftp.user?.trim() || null;
    const rootDir = ftp.root_dir?.trim() || null;
    const hasPassword = Boolean(ftp.password && String(ftp.password).trim().length > 0);
    const configured = Boolean(host && port && user && hasPassword);

    const verification = verify && host && port
      ? await verifyFtpConnection({ host, port })
      : null;

    return NextResponse.json({
      status: {
        configured,
        host,
        port,
        user,
        root_dir: rootDir,
        has_password: hasPassword,
      },
      verify: verification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load FTP settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load FTP settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      host?: unknown;
      port?: unknown;
      user?: unknown;
      password?: unknown;
      root_dir?: unknown;
    };

    const host = normalizeHost(body.host);
    const port = normalizePort(body.port);
    const user = normalizeUser(body.user);
    const rootDir = normalizeRootDir(body.root_dir);
    const passwordRaw = typeof body.password === 'string' ? body.password : body.password == null ? null : String(body.password);
    const password = passwordRaw == null ? null : passwordRaw.trim();

    const settings = readSettings();
    settings.website = settings.website || {};
    settings.website.ftp = settings.website.ftp || {};

    if (host !== null) settings.website.ftp.host = host;
    if (port !== null) settings.website.ftp.port = port;
    if (user !== null) settings.website.ftp.user = user;
    if (rootDir !== null) settings.website.ftp.root_dir = rootDir;

    // Password: if provided non-empty, update. If provided empty string, clear.
    if (passwordRaw !== null) {
      if (!password) {
        delete settings.website.ftp.password;
      } else {
        settings.website.ftp.password = passwordRaw;
      }
    }

    writeSettings(settings);

    const ftp = settings.website?.ftp || {};
    return NextResponse.json({
      ok: true,
      status: {
        configured: Boolean(ftp.host && ftp.port && ftp.user && ftp.password),
        host: ftp.host || null,
        port: typeof ftp.port === 'number' ? ftp.port : null,
        user: ftp.user || null,
        root_dir: ftp.root_dir || null,
        has_password: Boolean(ftp.password && String(ftp.password).trim().length > 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update FTP settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update FTP settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    if (settings.website?.ftp) {
      delete settings.website.ftp;
    }
    writeSettings(settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear FTP settings';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to clear FTP settings' }, { status: 500 });
  }
}

