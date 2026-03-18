import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { ensureDefaultEntitlements, setEntitlement } from '@/modules/entitlements/entitlements.service';
import { queryPg } from '@/config/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  requireAdmin(request);
  const url = new URL(request.url);
  const userId = Number(url.searchParams.get('user_id') || '');
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  await ensureDefaultEntitlements(userId);
  const flags = await queryPg<{ feature_code: string; name: string; default_enabled: boolean }>(
    'SELECT feature_code, name, default_enabled FROM feature_flags ORDER BY feature_code ASC',
  );
  const ent = await queryPg<{ feature_code: string; enabled: boolean; source: string; enabled_at: string | null }>(
    'SELECT feature_code, enabled, source, enabled_at FROM entitlements WHERE user_id = $1',
    [userId],
  );
  const entMap = new Map(ent.rows.map((r) => [r.feature_code, r]));

  return NextResponse.json({
    user_id: userId,
    features: flags.rows.map((f) => {
      const row = entMap.get(f.feature_code);
      return {
        feature_code: f.feature_code,
        name: f.name,
        default_enabled: f.default_enabled,
        enabled: Boolean(row?.enabled ?? f.default_enabled),
        source: row?.source ?? 'default',
        enabled_at: row?.enabled_at ?? null,
      };
    }),
    checked_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as { user_id?: number; feature_code?: string; enabled?: boolean };
  const userId = Number(body.user_id ?? 0);
  const featureCode = typeof body.feature_code === 'string' ? body.feature_code.trim() : '';
  if (!userId || !featureCode || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'user_id, feature_code, enabled required' }, { status: 400 });
  }

  await setEntitlement(userId, featureCode, body.enabled, 'admin');
  return NextResponse.json({ ok: true, updated_at: new Date().toISOString() });
}

