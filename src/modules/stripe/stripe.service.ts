import type Stripe from 'stripe';
import { withPgClient } from '@/config/db';
import { updateStripeCustomer } from '@/lib/auth';
import { recordSuccessfulPayment } from '@/modules/billing/billing.service';
import { requireStripeClient } from '@/lib/stripe-client';
import { amountEurToCredits, centsToCredits } from '@/config/env';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function getStripe() {
  return requireStripeClient();
}

export function verifyStripeWebhook(payload: string, signature: string) {
  if (!webhookSecret) throw new Error('stripe_not_configured');
  const stripe = getStripe();
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret as string);
  } catch (err) {
    throw err as Error;
  }
}

export async function ensureStripeCustomerForUser(params: {
  userId: number;
  username: string;
  email?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string | null> {
  if (params.stripeCustomerId) return params.stripeCustomerId;
  if (!stripeKey) return null;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: params.username,
    email: params.email ?? undefined,
    metadata: {
      user_id: String(params.userId),
      username: params.username,
    },
  });
  updateStripeCustomer(params.userId, customer.id, null);
  return customer.id;
}

export async function confirmStripeSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent', 'customer'] });
}

export async function processStripeEvent(event: Stripe.Event) {
  // Idempotent processing: record event and skip if already processed
  const stripeEventId = event.id;
  await withPgClient(async (client) => {
    const existing = await client.query('SELECT id, processed FROM webhook_events WHERE stripe_event_id = $1', [stripeEventId]);
    if (existing.rowCount > 0 && existing.rows[0].processed) return;

    // insert or upsert event row
    if (existing.rowCount === 0) {
      await client.query(
        'INSERT INTO webhook_events (stripe_event_id, event_type, processed, payload_json) VALUES ($1, $2, $3, $4)',
        [stripeEventId, event.type, false, JSON.stringify(event)],
      );
    } else {
      await client.query('UPDATE webhook_events SET payload_json = $2, event_type = $3 WHERE stripe_event_id = $1', [stripeEventId, JSON.stringify(event), event.type]);
    }

    // handle events
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;
      const paymentIntent = session.payment_intent as string | undefined;
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
      const amountTotal = (session.amount_total ?? session.amount_subtotal) as number | undefined;
      const grossEur = amountTotal ? Number(amountTotal) / 100.0 : 0;
      const userId = session.metadata?.user_id ? Number(session.metadata.user_id) : null;
      const metadata = session.metadata ?? {};
      const creditAmountCents = Number(metadata.credit_amount_cents ?? 0) || 0;
      const creditsMeta = Number(metadata.credits ?? 0) || 0;
      const checkoutType = metadata.checkout_type === 'activation' ? 'activation' : metadata.checkout_type === 'topup' ? 'topup' : undefined;
      const discountPercent = Number(metadata.discount_percent ?? 0) || 0;
      const creditsIssued = creditsMeta > 0
        ? creditsMeta
        : creditAmountCents > 0
          ? centsToCredits(creditAmountCents)
          : amountEurToCredits(grossEur);

      if (!userId) {
        // cannot allocate without user id; mark event processed and return
        await client.query('UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE stripe_event_id = $1', [stripeEventId]);
        return;
      }

      await recordSuccessfulPayment({
        userId,
        sessionId,
        paymentIntentId: paymentIntent ?? null,
        stripeCustomerId,
        grossAmountEur: grossEur,
        creditAmountCents: creditAmountCents > 0 ? creditAmountCents : undefined,
        creditsIssued: creditsIssued > 0 ? creditsIssued : undefined,
        checkoutType,
        discountPercent,
        source: 'stripe_webhook',
      });

      // mark event processed
      await client.query('UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE stripe_event_id = $1', [stripeEventId]);
      return;
    }

    // For other events, just mark processed
    await client.query('UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE stripe_event_id = $1', [stripeEventId]);
  });
}

export default {
  verifyStripeWebhook,
  processStripeEvent,
};
