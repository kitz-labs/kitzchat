import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAdmin(request);

    const stripeSecretConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
    const stripeWebhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

    return NextResponse.json({
      stripe_secret_configured: stripeSecretConfigured,
      stripe_webhook_configured: stripeWebhookConfigured,
      billing_mode: stripeSecretConfigured ? 'live-or-test' : 'dev-simulated',
      env_keys_required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      webhook_path: '/api/billing/webhook',
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