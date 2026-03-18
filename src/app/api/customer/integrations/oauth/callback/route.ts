import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { resolveCookieDomain } from '@/lib/cookies';
import { getIntegrationProvider, type CustomerIntegrationProfile } from '@/lib/integration-catalog';
import { getAuthLinkBaseUrl } from '@/lib/public-url';
import { upsertCustomerIntegrationProfile } from '@/lib/customer-preferences';
import { getOAuthProviderDefinition, getProviderConfig } from '@/lib/integrations/oauth-providers';

const STATE_COOKIE = 'kitzchat-integration-oauth-state';

type OAuthState = {
  nonce: string;
  userId: number;
  providerId: string;
  profileId: string;
  returnTo: string;
  scopes: string[];
  createdAt?: string;
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

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim();
    const state = url.searchParams.get('state')?.trim();
    const providerError = url.searchParams.get('error')?.trim() || url.searchParams.get('error_description')?.trim();
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

    let accountIdentifier = provider.name;
    const oauthProviderId = provider.oauthProvider as Parameters<typeof getOAuthProviderDefinition>[0];
    const callbackUrl = getCallbackUrl(request);
    const oauthProvider = getOAuthProviderDefinition(oauthProviderId);
    const config = getProviderConfig(oauthProviderId, callbackUrl);
    const token = await oauthProvider.exchangeCode(config, code);
    const identity = await oauthProvider.fetchIdentity(token.accessToken);
    accountIdentifier = identity.accountIdentifier || provider.name;

    const patch: Partial<CustomerIntegrationProfile> = {
      provider: oauthState.providerId,
      label: provider.name,
      accountIdentifier,
      accessToken: token.accessToken,
      connectionType: 'oauth',
      oauthProvider: provider.oauthProvider,
      oauthConnectedAt: new Date().toISOString(),
      oauthStatus: 'connected',
      oauthScopes: oauthState.scopes,
    };
    if (token.refreshToken) patch.refreshToken = token.refreshToken;

    upsertCustomerIntegrationProfile(user.id, oauthState.profileId, oauthState.providerId, patch);

    const returnTo = oauthState.returnTo?.startsWith('/') ? oauthState.returnTo : '/settings';
    return redirectWithStateCleared(request, `${returnTo.includes('?') ? returnTo : `${returnTo}?integration_oauth=success`}#integrations`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth Verbindung fehlgeschlagen';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return redirectWithStateCleared(request, `/settings?integration_oauth=error&reason=${encodeURIComponent(message)}#integrations`);
  }
}
