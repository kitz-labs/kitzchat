import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { readSettings, setAllowUserDeletion } from '@/lib/settings';

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const settings = readSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as { allow_user_deletion?: boolean };
    if (typeof body.allow_user_deletion === 'boolean') {
      setAllowUserDeletion(!!body.allow_user_deletion);
    }
    const settings = readSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (msg === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
