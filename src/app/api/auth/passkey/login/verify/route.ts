import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createSession, destroySession, getCustomerFreeMessageUsage, getUserById, requireUser, userHasAgentAccess, userHasFreeCustomerAccess } from '@/lib/auth';
import { getAudienceFromAccountType } from '@/lib/app-audience';
import { consumePasskeyChallenge, getPasskeyByCredentialId, updatePasskeyCounter } from '@/lib/passkeys';
import { resolveCookieDomain } from '@/lib/cookies';

export const dynamic = 'force-dynamic';

const COOKIE = 'kitzchat-passkey-auth';
const SESSION_COOKIE = 'kitzchat-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function shouldUseSecureCookies(request: Request): boolean {
  const forced = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (forced === 'true' || forced === '1' || forced === 'yes') return true;
  if (forced === 'false' || forced === '0' || forced === 'no') return false;
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
    // Prevent already-authenticated users from doing passkey login flow (keeps logic simple).
    try {
      requireUser(request);
      return NextResponse.json({ error: 'Already authenticated' }, { status: 400 });
    } catch {
      // ignore
    }

    const token = readCookie(request, COOKIE);
    if (!token) return NextResponse.json({ error: 'Challenge missing' }, { status: 400 });
    const challenge = consumePasskeyChallenge(token, 'authentication');
    if (!challenge) return NextResponse.json({ error: 'Challenge invalid or expired' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { response?: any };
    const credentialId = typeof body?.response?.id === 'string' ? body.response.id : '';
    if (!credentialId) return NextResponse.json({ error: 'Missing credential id' }, { status: 400 });

    const passkey = getPasskeyByCredentialId(credentialId);
    if (!passkey) return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });

    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      authenticator: {
        credentialID: passkey.credential_id,
        credentialPublicKey: isoBase64URL.toBuffer(passkey.public_key_b64),
        counter: passkey.counter,
        transports: passkey.transports_json ? (JSON.parse(passkey.transports_json) as any) : undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json({ error: 'Passkey verification failed' }, { status: 400 });
    }

    updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter ?? passkey.counter);

    const user = getUserById(passkey.user_id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Invalidate any previously presented session token to reduce session fixation risk.
    const cookie = request.headers.get('cookie') || '';
    const existingMatch = cookie.match(/(?:^|;\\s*)kitzchat-session=([^;]*)/);
    const existingToken = existingMatch ? decodeURIComponent(existingMatch[1]) : null;
    if (existingToken) destroySession(existingToken);

    const sessionToken = createSession(user.id);
    const freeMessages = getCustomerFreeMessageUsage(user.id, user.username);

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

    const domain = resolveCookieDomain(request);
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE,
      path: '/',
      ...(domain ? { domain } : {}),
    });
    response.cookies.set(COOKIE, '', { maxAge: 0, path: '/', secure: shouldUseSecureCookies(request) });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Passkey login failed';
    return NextResponse.json({ error: message || 'Passkey login failed' }, { status: 500 });
  }
}
