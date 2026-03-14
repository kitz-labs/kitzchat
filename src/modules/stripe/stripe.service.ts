import Stripe from 'stripe';
import { withPgClient } from '@/config/db';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const creditMultiplier = Number(process.env.CREDIT_MULTIPLIER || '1000');
const apiBudgetRatio = Number(process.env.API_BUDGET_RATIO || '0.7');
const reserveRatio = Number(process.env.RESERVE_RATIO || '0.3');

function getStripe() {
  if (!stripeKey) throw new Error('stripe_not_configured');
  return new Stripe(stripeKey, { apiVersion: '2022-11-15' });
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

      if (!userId) {
        // cannot allocate without user id; mark event processed and return
        await client.query('UPDATE webhook_events SET processed = true, processed_at = NOW() WHERE stripe_event_id = $1', [stripeEventId]);
        return;
      }

      // insert payment record if not exists
      const p = await client.query('SELECT id FROM payments WHERE stripe_session_id = $1', [sessionId]);
      let paymentId: number;
      if (p.rowCount === 0) {
        const res = await client.query(
          'INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent_id, stripe_customer_id, gross_amount_eur, currency, status, credits_issued) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [userId, sessionId, paymentIntent ?? null, stripeCustomerId, grossEur, session.currency ?? 'eur', 'completed', 0],
        );
        paymentId = Number(res.rows[0].id);
      } else {
        paymentId = Number(p.rows[0].id);
      }

      // compute credits and allocation
      const credits = Math.floor(grossEur * creditMultiplier);
      const apiBudgetEur = grossEur * apiBudgetRatio;
      const reserveEur = grossEur * reserveRatio;

      // ensure wallet exists
      const w = await client.query('SELECT id, balance_credits FROM wallets WHERE user_id = $1', [userId]);
      let walletId: number;
      let balanceAfter = credits;
      if (w.rowCount === 0) {
        const wr = await client.query('INSERT INTO wallets (user_id, balance_credits) VALUES ($1,$2) RETURNING id, balance_credits', [userId, credits]);
        walletId = Number(wr.rows[0].id);
        balanceAfter = Number(wr.rows[0].balance_credits);
      } else {
        walletId = Number(w.rows[0].id);
        const newBalance = Number(w.rows[0].balance_credits) + credits;
        await client.query('UPDATE wallets SET balance_credits = $1, updated_at = NOW() WHERE id = $2', [newBalance, walletId]);
        balanceAfter = newBalance;
      }

      // record wallet ledger
      await client.query(
        'INSERT INTO wallet_ledger (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [userId, walletId, 'topup', credits, balanceAfter, 'payment', String(paymentId), `Top-up via Stripe session ${sessionId}`],
      );

      // update payments with issued credits
      await client.query('UPDATE payments SET credits_issued = $1 WHERE id = $2', [credits, paymentId]);

      // allocate payment_allocations row
      await client.query(
        'INSERT INTO payment_allocations (payment_id, gross_amount_eur, api_budget_eur, reserve_eur, allocation_rule) VALUES ($1,$2,$3,$4,$5)',
        [paymentId, grossEur, apiBudgetEur, reserveEur, 'default'],
      );

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
