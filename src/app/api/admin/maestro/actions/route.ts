import { NextRequest, NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-auth';
import { requireAdmin } from '@/lib/auth';
import { readSettings, writeSettings, type AppSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type MaestroAction =
  | {
      type: 'settings.merge';
      payload: {
        patch: Record<string, unknown>;
      };
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  return NextResponse.json({
    ok: true,
    allowed: [
      {
        type: 'settings.merge',
        description: 'Merged patch into app-settings.json (state).',
      },
    ],
  });
}

export async function POST(request: NextRequest) {
  const auth = requireApiAdmin(request as Request);
  if (auth) return auth;
  const actor = requireAdmin(request as Request);
  const body = (await request.json().catch(() => ({}))) as { action?: MaestroAction };
  const action = body.action;
  if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string') {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  if (action.type !== 'settings.merge') {
    return NextResponse.json({ error: 'action not allowed' }, { status: 400 });
  }

  const patch = (action.payload as any)?.patch;
  if (!isPlainObject(patch)) {
    return NextResponse.json({ error: 'payload.patch must be object' }, { status: 400 });
  }

  const current = readSettings() as unknown as Record<string, unknown>;
  const next = deepMerge(current, patch);
  const ok = writeSettings(next as AppSettings);

  logAudit({
    actor,
    action: 'maestro.action',
    target: 'settings.merge',
    detail: { ok, keys: Object.keys(patch).slice(0, 40) },
  });

  return NextResponse.json({ ok, settings: next });
}

