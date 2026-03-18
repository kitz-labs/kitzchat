import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { resolveCookieDomain } from '@/lib/cookies';
import { getIntegrationProvider } from '@/lib/integration-catalog';
import { getAuthLinkBaseUrl } from '@/lib/public-url';
import { upsertCustomerIntegrationProfile } from '@/lib/customer-preferences';

const STATE_COOKIE = 'kitzchat-integration-oauth-state';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

type OAuthState = {
  nonce: string;
  userId: number;
  providerId: string;
  profileId: string;
  returnTo: string;
  scopes: string[];
};

function readStateCookie(request: Request): OAuthState | null {
  const rawCookie = request.headers.get('cookie') || '';
  const match = rawCookie.match(/(?:^|;\s*)kitzchat-integration-oauth-state=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : '';
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as OAuthState;
    if (!parsed?.nonce || !parsed?.providerId || !parsed?.profileId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getCallbackUrl(request: Request): string {
  const configured = process.env.CUSTOMER_INTEGRATION_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  return new URL('/api/customer/integrations/oauth/callback', getAuthLinkBaseUrl(request)).toString();
}

function redirectWithStateCleared(request: Request, target: string) {
  const response = NextResponse.redirect(new URL(target, getAuthLinkBaseUrl(request)));
  const domain = resolveCookieDomain(request);
  response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/', ...(domain ? { domain } : {}) });
  return response;
}

async function exchangeGoogleCode(request: Request, code: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth ist nicht konfiguriert');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getCallbackUrl(request),
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Google Code konnte nicht eingetauscht werden');
  return response.json() as Promise<{ access_token?: string; refresh_token?: string }>;
}

async function fetchGoogleIdentity(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Google Profil konnte nicht geladen werden');
  const payload = await response.json() as { email?: string; name?: string; sub?: string };
  return {
    accountIdentifier: payload.email || payload.name || payload.sub || 'Google Workspace',
  };
}

async function exchangeGithubCode(request: Request, code: string) {
  const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID?.trim() || process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_INTEGRATION_CLIENT_SECRET?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth ist nicht konfiguriert');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getCallbackUrl(request),
  });

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('GitHub Code konnte nicht eingetauscht werden');
  return response.json() as Promise<{ access_token?: string; refresh_token?: string }>;
}

async function fetchGithubIdentity(accessToken: string) {
  const [userResponse, emailResponse] = await Promise.all([
    fetch(GITHUB_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    }),
    fetch(GITHUB_EMAILS_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    }),
  ]);
  if (!userResponse.ok) throw new Error('GitHub Profil konnte nicht geladen werden');
  const userPayload = await userResponse.json() as { login?: string; name?: string };
  const emailPayload = emailResponse.ok ? await emailResponse.json() as Array<{ email?: string; primary?: boolean }> : [];
  const primaryEmail = emailPayload.find((entry) => entry.primary)?.email || emailPayload[0]?.email || '';
  return {
    accountIdentifier: primaryEmail || userPayload.login || userPayload.name || 'GitHub',
  };
}

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();
    const state = url.searchParams.get('state')?.trim();
    const providerError = url.searchParams.get('error')?.trim();
    const oauthState = readStateCookie(request);

    if (providerError) {
      return redirectWithStateCleared(request, `/settings?integration_oauth=error&reason=${encodeURIComponent(providerError)}#integrations`);
    }
    if (!code || !state || !oauthState || oauthState.nonce !== state || oauthState.userId !== user.id) {
      return redirectWithStateCleared(request, '/settings?integration_oauth=error&reason=state#integrations');
    }

    const provider = getIntegrationProvider(oauthState.providerId);
    if (!provider || !provider.oauthSupported || !provider.oauthProvider) {
      return redirectWithStateCleared(request, '/settings?integration_oauth=error&reason=provider#integrations');
    }

    let accessToken = '';
    let refreshToken = '';
    let accountIdentifier = provider.name;

    if (provider.oauthProvider === 'google-workspace') {
      const tokenPayload = await exchangeGoogleCode(request, code);
      accessToken = tokenPayload.access_token || '';
      refreshToken = tokenPayload.refresh_token || '';
      if (!accessToken) throw new Error('Google Access Token fehlt');
      const identity = await fetchGoogleIdentity(accessToken);
      accountIdentifier = identity.accountIdentifier;
    } else if (provider.oauthProvider === 'github') {
      const tokenPayload = await exchangeGithubCode(request, code);
      accessToken = tokenPayload.access_token || '';
      refreshToken = tokenPayload.refresh_token || '';
      if (!accessToken) throw new Error('GitHub Access Token fehlt');
      const identity = await fetchGithubIdentity(accessToken);
      accountIdentifier = identity.accountIdentifier;
    } else {
      throw new Error('OAuth-Provider ist noch nicht verfuegbar');
    }

    upsertCustomerIntegrationProfile(user.id, oauthState.profileId, oauthState.providerId, {
      provider: oauthState.providerId,
      label: provider.name,
      accountIdentifier,
      accessToken,
      refreshToken,
      connectionType: 'oauth',
      oauthProvider: provider.oauthProvider,
      oauthConnectedAt: new Date().toISOString(),
      oauthStatus: 'connected',
      oauthScopes: oauthState.scopes,
    });

    const returnTo = oauthState.returnTo?.startsWith('/') ? oauthState.returnTo : '/settings';
    return redirectWithStateCleared(request, `${returnTo.includes('?') ? returnTo : `${returnTo}?integration_oauth=success`}#integrations`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth Verbindung fehlgeschlagen';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return redirectWithStateCleared(request, `/settings?integration_oauth=error&reason=${encodeURIComponent(message)}#integrations`);
  }
}
