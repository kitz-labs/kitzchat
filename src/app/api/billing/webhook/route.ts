import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySuccessfulCheckout } from '@/lib/billing';
import { hasPostgresConfig } from '@/config/env';
import { processStripeEvent, verifyStripeWebhook } from '@/modules/stripe/stripe.service';

export const dynamic = 'force-dynamic';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(request: Request) {
  if (hasPostgresConfig()) {
    try {
      const rawBody = await request.text();
      const signature = (await headers()).get('stripe-signature');
      if (!signature) return NextResponse.json({ error: 'Missing stripe signature' }, { status: 400 });
      const event = verifyStripeWebhook(rawBody, signature);
      await processStripeEvent(event);
      return NextResponse.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process stripe webhook';
      if (message === 'stripe_not_configured') return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
      if (message.includes('signature')) return NextResponse.json({ error: 'Invalid stripe signature' }, { status: 400 });
      return NextResponse.json({ error: 'Failed to process stripe webhook' }, { status: 500 });
    }
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid stripe signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      applySuccessfulCheckout(session);
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Failed to process stripe webhook' }, { status: 500 });
  }
}