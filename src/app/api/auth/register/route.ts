import { NextResponse } from 'next/server';
import { createCustomerUser, createSession, seedAdmin, userHasAgentAccess } from '@/lib/auth';
import { getAudienceFromAccountType } from '@/lib/app-audience';

const SESSION_COOKIE = 'kitzchat-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === 'true' || forced === '1' || forced === 'yes') return true;
  if (forced === 'false' || forced === '0' || forced === 'no') return false;
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

export async function POST(request: Request) {
  try {
    seedAdmin();
    const body = (await request.json()) as { username?: string; password?: string; acceptedTerms?: boolean };
    if (!body.username || !body.password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }
    const user = createCustomerUser(body.username, body.password, body.acceptedTerms === true);
    const token = createSession(user.id);
    const response = NextResponse.json({
      app_audience: getAudienceFromAccountType(user.account_type),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        account_type: user.account_type,
        payment_status: user.payment_status,
        has_agent_access: userHasAgentAccess(user),
        email: user.email ?? null,
        plan_amount_cents: user.plan_amount_cents ?? 0,
        wallet_balance_cents: user.wallet_balance_cents ?? 0,
        onboarding_completed_at: user.onboarding_completed_at ?? null,
        next_topup_discount_percent: user.next_topup_discount_percent ?? 0,
        completed_payments_count: user.completed_payments_count ?? 0,
        accepted_terms_at: user.accepted_terms_at ?? null,
      },
    }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    if (message.includes('Username') || message.includes('Password')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}