import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { resolveCookieDomain } from '@/lib/cookies';
import { getAuthLinkBaseUrl } from '@/lib/public-url';
import { getIntegrationProvider } from '@/lib/integration-catalog';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const STATE_COOKIE = 'kitzchat-integration-oauth-state';

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

function getCallbackUrl(request: Request): string {
  const configured = process.env.CUSTOMER_INTEGRATION_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  return new URL('/api/customer/integrations/oauth/callback', getAuthLinkBaseUrl(request)).toString();
}

function getGoogleConfig(request: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth ist nicht konfiguriert');
  return { clientId, clientSecret, callbackUrl: getCallbackUrl(request) };
}

function getGithubConfig(request: Request) {
  const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID?.trim() || process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_INTEGRATION_CLIENT_SECRET?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth ist nicht konfiguriert');
  return { clientId, clientSecret, callbackUrl: getCallbackUrl(request) };
}

function getScopes(providerId: string): string[] {
  switch (providerId) {
    case 'google-drive':
      return ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'];
    case 'google-calendar':
      return ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'];
    case 'google-sheets':
      return ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets.readonly'];
    case 'google-analytics':
      return ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/analytics.readonly'];
    case 'github':
      return ['read:user', 'user:email', 'repo'];
    default:
      return ['openid', 'email', 'profile'];
  }
}

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const providerId = url.searchParams.get('provider')?.trim() || '';
    const profileId = url.searchParams.get('profile_id')?.trim() || '';
    const returnToRaw = url.searchParams.get('return_to')?.trim() || '/settings';
    const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/settings';
    if (!providerId || !profileId) {
      return NextResponse.json({ error: 'provider and profile_id required' }, { status: 400 });
    }

    const provider = getIntegrationProvider(providerId);
    if (!provider || !provider.oauthSupported || !provider.oauthProvider) {
      return NextResponse.json({ error: 'OAuth ist fuer diese Integration noch nicht verfuegbar' }, { status: 400 });
    }

    const nonce = randomBytes(24).toString('hex');
    const statePayload = {
      nonce,
      userId: user.id,
      providerId,
      profileId,
      returnTo,
      scopes: getScopes(providerId),
    };

    let targetUrl: URL;
    if (provider.oauthProvider === 'google-workspace') {
      const { clientId, callbackUrl } = getGoogleConfig(request);
      targetUrl = new URL(GOOGLE_AUTH_URL);
      targetUrl.searchParams.set('client_id', clientId);
      targetUrl.searchParams.set('redirect_uri', callbackUrl);
      targetUrl.searchParams.set('response_type', 'code');
      targetUrl.searchParams.set('scope', statePayload.scopes.join(' '));
      targetUrl.searchParams.set('state', nonce);
      targetUrl.searchParams.set('access_type', 'offline');
      targetUrl.searchParams.set('include_granted_scopes', 'true');
      targetUrl.searchParams.set('prompt', 'consent');
    } else if (provider.oauthProvider === 'github') {
      const { clientId, callbackUrl } = getGithubConfig(request);
      targetUrl = new URL(GITHUB_AUTH_URL);
      targetUrl.searchParams.set('client_id', clientId);
      targetUrl.searchParams.set('redirect_uri', callbackUrl);
      targetUrl.searchParams.set('scope', statePayload.scopes.join(' '));
      targetUrl.searchParams.set('state', nonce);
    } else {
      return NextResponse.json({ error: 'OAuth-Provider ist noch nicht aktiviert' }, { status: 400 });
    }

    const response = NextResponse.redirect(targetUrl);
    const domain = resolveCookieDomain(request);
    response.cookies.set(STATE_COOKIE, encodeURIComponent(JSON.stringify(statePayload)), {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookies(request),
      maxAge: 10 * 60,
      path: '/',
      ...(domain ? { domain } : {}),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth konnte nicht gestartet werden';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
