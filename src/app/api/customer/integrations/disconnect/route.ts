import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { ensureCustomerPreferences, upsertCustomerIntegrationProfile } from '@/lib/customer-preferences';
import type { CustomerIntegrationProfile } from '@/lib/integration-catalog';

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
    const existing = preferences.integration_profiles.find((item) => item.id === profileId);
    if (!existing) return NextResponse.json({ error: 'Integration profile not found' }, { status: 404 });

    const patch: Partial<CustomerIntegrationProfile> = existing.connectionType === 'oauth'
      ? {
        oauthStatus: 'disconnected',
        oauthConnectedAt: '',
        oauthScopes: [],
        accessToken: '',
        refreshToken: '',
      }
      : {
        apiKey: '',
        accessToken: '',
        refreshToken: '',
        username: '',
        password: '',
      };

    upsertCustomerIntegrationProfile(user.id, existing.id, existing.provider, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Disconnect fehlgeschlagen';
    if (message === 'unauthorized') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

