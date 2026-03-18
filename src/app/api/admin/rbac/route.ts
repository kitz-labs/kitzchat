import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getRoleMatrix, listRoles, listCapabilities, setRoleOverride, type Capability, type Role } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  requireAdmin(request);
  return NextResponse.json({
    roles: listRoles(),
    capabilities: listCapabilities(),
    matrix: getRoleMatrix(),
    checked_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as {
    role?: Role;
    capability?: Capability;
    enabled?: boolean | null;
  };

  if (!body.role || !body.capability || !listRoles().includes(body.role)) {
    return NextResponse.json({ error: 'Invalid role/capability' }, { status: 400 });
  }
  const known = listCapabilities().some((c) => c.key === body.capability);
  if (!known) {
    return NextResponse.json({ error: 'Unknown capability' }, { status: 400 });
  }

  setRoleOverride(body.role, body.capability, typeof body.enabled === 'boolean' ? body.enabled : null);

  return NextResponse.json({ ok: true, matrix: getRoleMatrix(), updated_at: new Date().toISOString() });
}

