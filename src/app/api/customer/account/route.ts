import { NextResponse } from 'next/server';
import { changeUserPassword, requireUser, updateUserEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      email?: string | null;
      currentPassword?: string;
      newPassword?: string;
    };

    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      updateUserEmail(user.id, body.email ?? null);
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: 'Aktuelles Passwort erforderlich' }, { status: 400 });
      }
      changeUserPassword(user.id, body.currentPassword, body.newPassword);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update account';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (message.includes('Passwort') || message.includes('E-Mail-Adresse') || message.includes('Aktuelles Passwort')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Diese E-Mail-Adresse ist bereits vergeben' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
