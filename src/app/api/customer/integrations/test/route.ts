import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences } from '@/lib/customer-preferences';
import { getIntegrationProvider } from '@/lib/integration-catalog';
import { getOAuthProviderDefinition } from '@/lib/integrations/oauth-providers';
 

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function testManual(providerId: string, profile: { apiKey: string; accessToken: string; baseUrl: string; username: string; password: string }) {
  const token = profile.accessToken || profile.apiKey || '';
  switch (providerId) {
    case 'notion': {
      if (!token) throw new Error('Notion Token fehlt');
      const response = await fetchWithTimeout('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      }, 12_000);
      if (!response.ok) throw new Error('Notion Verbindung fehlgeschlagen');
      return;
    }
    case 'dropbox': {
      if (!token) throw new Error('Dropbox Token fehlt');
      const response = await fetchWithTimeout('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }, 12_000);
      if (!response.ok) throw new Error('Dropbox Verbindung fehlgeschlagen');
      return;
    }
    case 'shopify': {
      if (!token) throw new Error('Shopify Token fehlt');
      const baseUrl = profile.baseUrl.trim();
      if (!baseUrl) throw new Error('Basis-URL fehlt (Shop-Domain)');
      const url = new URL('/admin/api/2024-07/shop.json', baseUrl).toString();
      const response = await fetchWithTimeout(url, { headers: { 'X-Shopify-Access-Token': token } }, 12_000);
      if (!response.ok) throw new Error('Shopify Verbindung fehlgeschlagen');
      return;
    }
    case 'stripe': {
      if (!token) throw new Error('Stripe Secret Key fehlt');
      const response = await fetchWithTimeout('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${token}` } }, 12_000);
      if (!response.ok) throw new Error('Stripe Verbindung fehlgeschlagen');
      return;
    }
    default: {
      if (token) return;
      if (profile.username && profile.password) return;
      if (profile.baseUrl && profile.username) return;
      throw new Error('Keine Zugangsdaten hinterlegt');
    }
  }
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

    const provider = getIntegrationProvider(profile.provider);
    if (profile.connectionType === 'oauth') {
      if (!provider?.oauthProvider) return NextResponse.json({ error: 'OAuth Provider fehlt' }, { status: 400 });
      if (!profile.accessToken) return NextResponse.json({ error: 'Access Token fehlt' }, { status: 400 });
      const oauthProviderId = provider.oauthProvider as Parameters<typeof getOAuthProviderDefinition>[0];
      const oauthProvider = getOAuthProviderDefinition(oauthProviderId);

      // If token is stale, allow callers to run refresh explicitly.
      const identity = await oauthProvider.fetchIdentity(profile.accessToken);
      return NextResponse.json({ ok: true, account: identity.accountIdentifier, provider: provider.id });
    }

    await testManual(profile.provider, profile);
    return NextResponse.json({ ok: true, provider: profile.provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Integration test fehlgeschlagen';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
