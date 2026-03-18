import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { resolveCookieDomain } from '@/lib/cookies';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const STATE_COOKIE = 'kitzchat-github-state';

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

function requireGithubEnv() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const callbackUrl = process.env.GITHUB_CALLBACK_URL?.trim();
  if (!clientId || !callbackUrl) {
    throw new Error('GitHub SSO is not configured');
  }
  return { clientId, callbackUrl };
}

export async function GET(request: Request) {
  try {
    const { clientId, callbackUrl } = requireGithubEnv();
    const state = randomBytes(24).toString('hex');
    const from = new URL(request.url).searchParams.get('from') || '/';

    const authUrl = new URL(GITHUB_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read:user user:email');
    authUrl.searchParams.set('state', state);

    const response = NextResponse.redirect(authUrl);
    const domain = resolveCookieDomain(request);
    response.cookies.set(STATE_COOKIE, `${state}:${encodeURIComponent(from)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookies(request),
      maxAge: 10 * 60,
      path: '/',
      ...(domain ? { domain } : {}),
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GitHub SSO error' },
      { status: 503 },
    );
  }
}
