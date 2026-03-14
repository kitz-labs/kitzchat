import Stripe from 'stripe';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { queryPg } from '@/config/db';
import { recordRefundBySession, recordSuccessfulPayment } from '@/modules/billing/billing.service';

export function verifyStripeWebhook(payload: string, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('stripe_not_configured');
  }
  return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

export async function processStripeEvent(event: Stripe.Event): Promise<{ processed: boolean }> {
  console.info('[stripe:service] processing event', { eventId: event.id, eventType: event.type });
  const existing = await queryPg<{ processed: boolean }>('SELECT processed FROM webhook_events WHERE stripe_event_id = $1', [event.id]);
  if (existing.rowCount && existing.rowCount > 0) {
    console.info('[stripe:service] duplicate event skipped', { eventId: event.id, processed: existing.rows[0].processed });
    return { processed: existing.rows[0].processed };
  }

  await queryPg(
    `INSERT INTO webhook_events (stripe_event_id, event_type, processed, payload_json)
     VALUES ($1, $2, FALSE, $3)`,
    [event.id, event.type, JSON.stringify(event)],
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.info('[stripe:service] checkout session completed received', {
      eventId: event.id,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      customerId: typeof session.customer === 'string' ? session.customer : null,
    });
    if (session.payment_status === 'paid') {
      const metadata = session.metadata || {};
      const credits = Number(metadata.credits || 0);
      const grossAmount = (typeof session.amount_total === 'number' ? session.amount_total / 100 : 0) || Number(metadata.gross_amount || 0);
      const userId = Number(metadata.user_id || 0);
      console.info('[stripe:service] checkout metadata parsed', { eventId: event.id, userId, credits, grossAmount });
      if (userId > 0 && credits > 0 && grossAmount > 0) {
        await recordSuccessfulPayment({
          userId,
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          grossAmountEur: grossAmount,
          creditsIssued: credits,
          source: 'stripe_webhook',
        });
        console.info('[stripe:service] payment recorded', { eventId: event.id, userId, sessionId: session.id });
      } else {
        console.warn('[stripe:service] checkout metadata incomplete, skipping payment record', {
          eventId: event.id,
          userId,
          credits,
          grossAmount,
        });
      }
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    if (charge.payment_intent) {
      const payment = await queryPg<{ stripe_session_id: string }>(
        'SELECT stripe_session_id FROM payments WHERE stripe_payment_intent_id = $1 ORDER BY id DESC LIMIT 1',
        [String(charge.payment_intent)],
      );
      const sessionId = payment.rows[0]?.stripe_session_id;
      if (sessionId) {
        await recordRefundBySession(sessionId, 'Stripe refund');
      }
    }
  }

  await queryPg('UPDATE webhook_events SET processed = TRUE, processed_at = CURRENT_TIMESTAMP WHERE stripe_event_id = $1', [event.id]);
  console.info('[stripe:service] event marked processed', { eventId: event.id, eventType: event.type });
  return { processed: true };
}

export async function confirmStripeSession(sessionId: string) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('stripe_not_configured');
  return stripe.checkout.sessions.retrieve(sessionId);
}
