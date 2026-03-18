import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCanonicalBaseUrl } from '@/lib/public-url';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);

    const stripeSecretConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

    const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || getCanonicalBaseUrl();

    return NextResponse.json({
      stripe_secret_configured: stripeSecretConfigured,
      stripe_webhook_configured: stripeWebhookConfigured,
      billing_mode: stripeSecretConfigured ? 'live-or-test' : 'dev-simulated',
      env_keys_required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      webhook_path: '/api/billing/webhook',
      public_base_url: publicBaseUrl || null,
      success_url: process.env.STRIPE_SUCCESS_URL?.trim() || null,
      cancel_url: process.env.STRIPE_CANCEL_URL?.trim() || null,
      webhook_url: publicBaseUrl
        ? `${publicBaseUrl.replace(/\/$/, '')}/api/billing/webhook`
        : null,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'unauthorized') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (msg === 'forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to load billing configuration' }, { status: 500 });
  }
}
