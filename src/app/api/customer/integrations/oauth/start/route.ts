import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { resolveCookieDomain } from '@/lib/cookies';
import { getAuthLinkBaseUrl } from '@/lib/public-url';
import { getIntegrationProvider } from '@/lib/integration-catalog';
import { getOAuthProviderDefinition, getProviderConfig } from '@/lib/integrations/oauth-providers';
import { newNonce, normalizeReturnTo, shouldUseSecureCookies } from '@/lib/integrations/oauth';

const STATE_COOKIE = 'kitzchat-integration-oauth-state';

function getCallbackUrl(request: Request): string {
  const configured = process.env.CUSTOMER_INTEGRATION_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  return new URL('/api/customer/integrations/oauth/callback', getAuthLinkBaseUrl(request)).toString();
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
    case 'onedrive':
      return ['offline_access', 'openid', 'profile', 'email', 'User.Read', 'Files.Read'];
    case 'github':
      return ['read:user', 'user:email', 'repo'];
    case 'slack':
      return ['team:read', 'users:read'];
    case 'hubspot':
      return ['oauth'];
    case 'xero':
      return ['openid', 'profile', 'email', 'offline_access', 'accounting.settings'];
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
    const returnTo = normalizeReturnTo(url.searchParams.get('return_to'));
    if (!providerId || !profileId) {
      return NextResponse.json({ error: 'provider and profile_id required' }, { status: 400 });
    }

    const provider = getIntegrationProvider(providerId);
    if (!provider || !provider.oauthSupported || !provider.oauthProvider) {
      return NextResponse.json({ error: 'OAuth ist fuer diese Integration noch nicht verfuegbar' }, { status: 400 });
    }

    const nonce = newNonce();
    const statePayload = {
      nonce,
      userId: user.id,
      providerId,
      profileId,
      returnTo,
      scopes: getScopes(providerId),
      createdAt: new Date().toISOString(),
    };

    const oauthProviderId = provider.oauthProvider as Parameters<typeof getOAuthProviderDefinition>[0];
    const callbackUrl = getCallbackUrl(request);
    const oauthProvider = getOAuthProviderDefinition(oauthProviderId);
    const config = getProviderConfig(oauthProviderId, callbackUrl);
    const targetUrl = oauthProvider.buildAuthUrl(config, { state: nonce, scopes: statePayload.scopes });

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
