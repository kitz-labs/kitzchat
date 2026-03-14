import Stripe from 'stripe';
import { queryPg } from '@/config/db';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const successUrl = process.env.STRIPE_SUCCESS_URL || '';
const cancelUrl = process.env.STRIPE_CANCEL_URL || '';
const defaultPriceId = process.env.STRIPE_PRICE_ID;

function getStripe() {
  if (!stripeKey) throw new Error('stripe_not_configured');
  return new Stripe(stripeKey, { apiVersion: '2022-11-15' });
}

export async function createCheckoutSession(opts: {
  userId: number;
  email?: string | null;
  name: string;
  stripeCustomerId?: string | null;
  preset?: string | undefined;
  amountEur?: number;
  returnUrlBase?: string | undefined;
}) {
  const stripe = getStripe();
  const { userId, stripeCustomerId, preset, amountEur } = opts;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (preset && typeof preset === 'string') {
    // if preset corresponds to a price id, use it; otherwise fallback to default price
    lineItems.push({ price: defaultPriceId ?? undefined, quantity: 1 } as any);
  } else if (amountEur && amountEur > 0) {
    lineItems.push({ price_data: { currency: 'eur', product_data: { name: 'Top-up' }, unit_amount: Math.round(amountEur * 100) }, quantity: 1 });
  } else {
    lineItems.push({ price: defaultPriceId ?? undefined, quantity: 1 } as any);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: lineItems as any,
    success_url: (opts.returnUrlBase || successUrl) + '',
    cancel_url: (opts.returnUrlBase || cancelUrl) + '',
    customer: stripeCustomerId ?? undefined,
    metadata: { user_id: String(userId), preset: preset ?? '' },
  });

  return { url: session.url, id: session.id };
}

export async function getTopupOffers() {
  const res = await queryPg('SELECT id, offer_code, name, amount_eur, credits, bonus_credits, active FROM topup_offers WHERE active = true ORDER BY sort_order ASC');
  return res.rows;
}

export async function getSessionStatus(sessionId: string) {
  const res = await queryPg('SELECT id, status, credits_issued FROM payments WHERE stripe_session_id = $1', [sessionId]);
  if (res.rowCount === 0) return { status: 'not_found' };
  return res.rows[0];
}

export async function getUiMessages(contextArea?: string) {
  if (!contextArea) contextArea = 'billing';
  const res = await queryPg('SELECT id, message_code, title, body, context_area FROM ui_messages WHERE context_area = $1 AND active = true', [contextArea]);
  return res.rows;
}

export default { createCheckoutSession, getTopupOffers, getSessionStatus, getUiMessages };
