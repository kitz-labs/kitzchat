import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getIntegrationProvider, type CustomerIntegrationProfile } from '@/lib/integration-catalog';
import { ensureCustomerPreferences, upsertCustomerIntegrationProfile } from '@/lib/customer-preferences';
import { getAuthLinkBaseUrl } from '@/lib/public-url';
import { getOAuthProviderDefinition, getProviderConfig } from '@/lib/integrations/oauth-providers';

function getCallbackUrl(request: Request): string {
  const configured = process.env.CUSTOMER_INTEGRATION_OAUTH_CALLBACK_URL?.trim();
  if (configured) return configured;
  return new URL('/api/customer/integrations/oauth/callback', getAuthLinkBaseUrl(request)).toString();
}

export async function POST(request: Request) {
  try {
    const user = requireUser(request);
    if (user.account_type !== 'customer') {
      return NextResponse.json({ error: 'Customer access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { profile_id?: string };
    const profileId = typeof body.profile_id === 'string' ? body.profile_id.trim() : '';
    if (!profileId) return NextResponse.json({ error: 'profile_id required' }, { status: 400 });

    const preferences = ensureCustomerPreferences(user.id);
    const profile = preferences.integration_profiles.find((item) => item.id === profileId);
    if (!profile) return NextResponse.json({ error: 'Integration profile not found' }, { status: 404 });
    if (profile.connectionType !== 'oauth') return NextResponse.json({ error: 'OAuth profile required' }, { status: 400 });
    if (!profile.refreshToken) return NextResponse.json({ error: 'Refresh token fehlt' }, { status: 400 });

    const provider = getIntegrationProvider(profile.provider);
    if (!provider?.oauthProvider) return NextResponse.json({ error: 'OAuth Provider fehlt' }, { status: 400 });

    const oauthProviderId = provider.oauthProvider as Parameters<typeof getOAuthProviderDefinition>[0];
    const oauthProvider = getOAuthProviderDefinition(oauthProviderId);
    if (!oauthProvider.refreshToken) return NextResponse.json({ error: 'Refresh fuer diesen Provider nicht verfuegbar' }, { status: 400 });

    const config = getProviderConfig(oauthProviderId, getCallbackUrl(request));
    const token = await oauthProvider.refreshToken(config, profile.refreshToken);
    const identity = await oauthProvider.fetchIdentity(token.accessToken).catch(() => null);

    const patch: Partial<CustomerIntegrationProfile> = {
      connectionType: 'oauth',
      oauthProvider: provider.oauthProvider,
      oauthStatus: 'connected',
      accessToken: token.accessToken,
    };
    if (token.refreshToken) patch.refreshToken = token.refreshToken;
    if (identity?.accountIdentifier) patch.accountIdentifier = identity.accountIdentifier;
    if (!profile.oauthConnectedAt) patch.oauthConnectedAt = new Date().toISOString();

    upsertCustomerIntegrationProfile(user.id, profile.id, profile.provider, patch);
    return NextResponse.json({ ok: true, oauth_status: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth Refresh fehlgeschlagen';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

