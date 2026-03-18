import { NextResponse } from 'next/server';
import { createCustomerUserWithEmail, createEmailVerificationToken, seedAdmin } from '@/lib/auth';
import { sendTelegramAlert } from '@/lib/alerts';
import { buildPublicUrlFromRequest, isEmailConfigured, sendUserEmail } from '@/lib/mailer';
import { getAllowUserRegistration } from '@/lib/settings';

export async function POST(request: Request) {
  try {
    seedAdmin();
    if (!getAllowUserRegistration()) {
      return NextResponse.json({ error: 'Registrierung ist aktuell deaktiviert' }, { status: 403 });
    }
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      acceptedTerms?: boolean;
      email?: string;
      first_name?: string;
      last_name?: string;
      company?: string;
    };
    if (!body.username || !body.password || !body.email) {
      return NextResponse.json({ error: 'Benutzername, Passwort und E-Mail sind erforderlich' }, { status: 400 });
    }
    const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'Vorname und Nachname sind erforderlich' }, { status: 400 });
    }
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'E-Mail Versand ist nicht konfiguriert' }, { status: 500 });
    }
    const user = createCustomerUserWithEmail(body.username, body.password, {
      acceptedTerms: body.acceptedTerms === true,
      email: body.email,
      firstName,
      lastName,
      company: company || null,
    });
    const { token, expires_at } = createEmailVerificationToken({ userId: user.id, email: user.email ?? body.email });
    const verifyUrl = buildPublicUrlFromRequest(request, '/api/auth/verify-email', { token });

    await sendUserEmail({
      to: user.email ?? body.email,
      subject: 'KitzChat: E-Mail bestaetigen',
      text: `Hallo ${firstName || user.username},\n\nbitte bestaetige deine E-Mail-Adresse:\n${verifyUrl}\n\nDer Link ist zeitlich begrenzt.\n`,
      html: `<p>Hallo <b>${firstName || user.username}</b>,</p><p>bitte bestaetige deine E-Mail-Adresse:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Der Link ist zeitlich begrenzt.</p>`,
    });

    const telegramMessage = [
      'Neuer Kunde registriert ✅',
      '',
      `Kunde: ${firstName ? `${firstName} ${lastName}`.trim() : user.username} (@${user.username})`,
      company ? `Firma: ${company}` : null,
      `E-Mail: ${user.email ?? body.email}`,
      '',
      `Dashboard: /customers/${user.id}`,
    ].filter(Boolean).join('\n');
    sendTelegramAlert(telegramMessage).catch(() => {});

    const response = NextResponse.json(
      {
        ok: true,
        user: { id: user.id, username: user.username, email: user.email ?? body.email },
        verification: { sent: true, expires_at },
      },
      { status: 201 },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username oder E-Mail ist bereits registriert' }, { status: 409 });
    }
    if (message.includes('Username') || message.includes('Password')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
