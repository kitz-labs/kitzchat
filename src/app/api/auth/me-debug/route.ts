import { NextResponse } from 'next/server';

export async function GET() {
  try { console.log('[auth/me-debug] GET called'); } catch {}
  return NextResponse.json({ ok: true, message: 'me-debug OK' });
}
