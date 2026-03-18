import { NextResponse } from 'next/server';
import { createSession, destroySession, seedAdmin, upsertGithubUser } from '@/lib/auth';
import { getAllowUserRegistration } from '@/lib/settings';
import { getDb } from '@/lib/db';
import { resolveCookieDomain } from '@/lib/cookies';
import { getAuthLinkBaseUrl } from '@/lib/public-url';

const STATE_COOKIE = 'kitzchat-github-state';
const SESSION_COOKIE = 'kitzchat-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_USER = 'https://api.github.com/user';
const GITHUB_API_EMAILS = 'https://api.github.com/user/emails';

type GithubUser = { id: number; login: string };
type GithubEmail = { email: string; primary: boolean; verified: boolean; visibility?: string | null };

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

function parseStateCookie(request: Request): { state: string; from: string } | null {
  const rawCookie = request.headers.get('cookie') || '';
  const match = rawCookie.match(/(?:^|;\s*)kitzchat-github-state=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : '';
  if (!value) return null;
  const [state, encodedFrom] = value.split(':');
  if (!state) return null;
  const from = encodedFrom ? decodeURIComponent(encodedFrom) : '/';
  return { state, from: from.startsWith('/') ? from : '/' };
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const callbackUrl = process.env.GITHUB_CALLBACK_URL?.trim();
  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error('GitHub SSO is not configured');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl,
  });

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to exchange GitHub auth code');
  }

  const payload = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (payload.error) {
    throw new Error(payload.error_description || payload.error);
  }
  if (!payload.access_token) {
    throw new Error('Missing GitHub access token');
  }
  return payload.access_token;
}

async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const response = await fetch(GITHUB_API_USER, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Nexora',
      Accept: 'application/vnd.github+json',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user profile');
  }
  const payload = (await response.json()) as Partial<GithubUser>;
  if (!payload.id || !payload.login) {
    throw new Error('Invalid GitHub user profile');
  }
  return payload as GithubUser;
}

async function fetchGithubPrimaryVerifiedEmail(accessToken: string): Promise<string> {
  const response = await fetch(GITHUB_API_EMAILS, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Nexora',
      Accept: 'application/vnd.github+json',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub emails');
  }
  const emails = (await response.json()) as GithubEmail[];
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : null;
  if (primary?.email) return primary.email;
  const anyVerified = Array.isArray(emails) ? emails.find((e) => e.verified) : null;
  if (anyVerified?.email) return anyVerified.email;
  throw new Error('GitHub account must have a verified email');
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const origin = getAuthLinkBaseUrl(request);
  const cookieDomain = resolveCookieDomain(request);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    const fail = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('GitHub sign-in cancelled')}`, origin));
    fail.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    return fail;
  }

  const stateCookie = parseStateCookie(request);
  if (!code || !state || !stateCookie || stateCookie.state !== state) {
    const fail = NextResponse.redirect(new URL('/login?error=GitHub%20state%20mismatch', origin));
    fail.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    return fail;
  }

  try {
    seedAdmin();
    const accessToken = await exchangeCodeForToken(code);
    const profile = await fetchGithubUser(accessToken);
    const email = await fetchGithubPrimaryVerifiedEmail(accessToken);

    // If registration is disabled, only allow existing linked accounts.
    if (!getAllowUserRegistration()) {
      const db = getDb();
      const exists = db
        .prepare('SELECT id FROM users WHERE github_id = ? OR email = ? LIMIT 1')
        .get(String(profile.id), email.trim().toLowerCase()) as { id?: number } | undefined;
      if (!exists?.id) {
        throw new Error('Registrierung ist aktuell deaktiviert');
      }
    }

    const user = upsertGithubUser(String(profile.id), email, profile.login);

    const cookie = request.headers.get('cookie') || '';
    const existingMatch = cookie.match(/(?:^|;\s*)kitzchat-session=([^;]*)/);
    const existingToken = existingMatch ? decodeURIComponent(existingMatch[1]) : null;
    if (existingToken) destroySession(existingToken);

    const token = createSession(user.id);
    const response = NextResponse.redirect(new URL(stateCookie.from || '/', origin));
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: shouldUseSecureCookies(request),
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
    response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    return response;
  } catch (err) {
    const message = (err as Error).message || 'GitHub login failed';
    const fail = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
    fail.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    return fail;
  }
}
