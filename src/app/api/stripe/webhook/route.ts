import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { processStripeEvent, verifyStripeWebhook } from '@/modules/stripe/stripe.service';

export async function POST(request: Request) {
  try {
    const signature = (await headers()).get('stripe-signature');
    if (!signature) return NextResponse.json({ error: 'Missing stripe signature' }, { status: 400 });
    const body = await request.text();
    const event = verifyStripeWebhook(body, signature);
    await processStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook failed';
    if (message === 'stripe_not_configured') return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
    if (message.includes('signature')) return NextResponse.json({ error: 'Invalid stripe signature' }, { status: 400 });
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
