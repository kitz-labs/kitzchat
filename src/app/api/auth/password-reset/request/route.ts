import { NextResponse } from 'next/server';
import { createPasswordResetToken, getUserByEmail, seedAdmin } from '@/lib/auth';
import { buildPublicUrlFromRequest, isEmailConfigured, sendUserEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    seedAdmin();
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'E-Mail Versand ist nicht konfiguriert' }, { status: 500 });
    }

    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === 'string' ? body.email : '';
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 });
    }

    const user = getUserByEmail(email);
    if (user && (user.auth_provider ?? 'local') === 'local' && user.email) {
      const { token, expires_at } = createPasswordResetToken({ userId: user.id });
      const resetUrl = buildPublicUrlFromRequest(request, '/reset-password', { token });

      await sendUserEmail({
        to: user.email,
        subject: 'KitzChat: Passwort zuruecksetzen',
        text: `Hallo ${user.username},\n\nhier kannst du dein Passwort zuruecksetzen:\n${resetUrl}\n\nDer Link ist zeitlich begrenzt.\n`,
        html: `<p>Hallo <b>${user.username}</b>,</p><p>hier kannst du dein Passwort zuruecksetzen:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Der Link ist zeitlich begrenzt.</p>`,
      });

      return NextResponse.json({ ok: true, expires_at });
    }

    // Avoid user enumeration.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
