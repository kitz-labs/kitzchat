import { NextResponse } from 'next/server';
import { authenticateForLogin, createSession, destroySession, getCustomerFreeMessageUsage, seedAdmin, userHasAgentAccess, userHasFreeCustomerAccess } from '@/lib/auth';
import { getAudienceFromAccountType } from '@/lib/app-audience';
import { resolveCookieDomain } from '@/lib/cookies';

const SESSION_COOKIE = 'kitzchat-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === "true" || forced === "1" || forced === "yes") return true;
  if (forced === "false" || forced === "0" || forced === "no") return false;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

export async function POST(request: Request) {
  try {
    seedAdmin();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auth configuration error' },
      { status: 500 },
    );
  }

  const { username, password } = await request.json();
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
  const userAgent = request.headers.get('user-agent') || null;

  let user;
  try {
    user = authenticateForLogin({ identifier: username, password, ip, userAgent });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'invalid_credentials';
    if (msg === 'email_not_verified') {
      return NextResponse.json({ error: 'Bitte bestaetige zuerst deine E-Mail-Adresse (Link im Postfach).' }, { status: 403 });
    }
    if (msg === 'login_locked') {
      return NextResponse.json({ error: 'Zu viele Fehlversuche. Bitte warte kurz und versuche es erneut.' }, { status: 429 });
    }
    if (msg === 'account_disabled' || msg === 'account_banned' || msg === 'account_deleted') {
      return NextResponse.json({ error: 'Account ist deaktiviert.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const freeMessages = getCustomerFreeMessageUsage(user.id, user.username);

  // Invalidate any previously presented session token to reduce session fixation risk.
  const cookie = request.headers.get('cookie') || '';
  const existingMatch = cookie.match(/(?:^|;\s*)kitzchat-session=([^;]*)/);
  const existingToken = existingMatch ? decodeURIComponent(existingMatch[1]) : null;
  if (existingToken) {
    destroySession(existingToken);
  }

  const token = createSession(user.id);
  const response = NextResponse.json({
    app_audience: getAudienceFromAccountType(user.account_type),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      account_type: user.account_type,
      payment_status: user.payment_status,
      has_agent_access: userHasAgentAccess(user) || userHasFreeCustomerAccess(user),
      email: user.email ?? null,
      plan_amount_cents: user.plan_amount_cents ?? 0,
      wallet_balance_cents: user.wallet_balance_cents ?? 0,
      onboarding_completed_at: user.onboarding_completed_at ?? null,
      next_topup_discount_percent: user.next_topup_discount_percent ?? 0,
      completed_payments_count: user.completed_payments_count ?? 0,
      accepted_terms_at: user.accepted_terms_at ?? null,
      free_messages_limit: freeMessages.limit,
      free_messages_used: freeMessages.used,
      free_messages_remaining: freeMessages.remaining,
    },
  });
  const secure = shouldUseSecureCookies(request);
  const domain = resolveCookieDomain(request);

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE,
    path: '/',
    ...(domain ? { domain } : {}),
  });
  response.headers.set('Cache-Control', 'no-store');

  return response;
}
