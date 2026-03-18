import { NextResponse } from 'next/server';
import { resetPasswordWithToken, seedAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    seedAdmin();
    const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token || !password) {
      return NextResponse.json({ error: 'Token und Passwort erforderlich' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
    const userAgent = request.headers.get('user-agent') || null;
    resetPasswordWithToken({ token, newPassword: password, ip, userAgent });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Passwort Reset fehlgeschlagen';
    if (msg === 'token_expired' || msg === 'token_invalid' || msg === 'token_used') {
      return NextResponse.json({ error: 'Token ist ungueltig oder abgelaufen' }, { status: 400 });
    }
    if (msg.includes('Password')) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: 'Passwort Reset fehlgeschlagen' }, { status: 500 });
  }
}

