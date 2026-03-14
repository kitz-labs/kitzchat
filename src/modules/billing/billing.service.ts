import { getStripeClient } from '@/config/stripe';
import { centsToEur, env, eurToCents } from '@/config/env';
import { queryPg } from '@/config/db';
import { ensureBillingUser, getWalletView, getWalletLedger, applyWalletDelta } from '@/modules/wallet/wallet.service';
import { enableCorePremiumEntitlements, getEntitlements } from '@/modules/entitlements/entitlements.service';
import { activateCustomerPaymentAccess } from '@/lib/auth';

export async function getTopupOffers() {
  const result = await queryPg<{
    offer_code: string;
    name: string;
    amount_eur: string;
    credits: number;
    bonus_credits: number;
    active: boolean;
    sort_order: number;
    marketing_label: string | null;
  }>(
    `SELECT offer_code, name, amount_eur, credits, bonus_credits, active, sort_order, marketing_label
     FROM topup_offers
     WHERE active = TRUE
     ORDER BY sort_order ASC, amount_eur ASC`,
  );
  return result.rows.map((row) => ({
    offerCode: row.offer_code,
    name: row.name,
    amountEur: Number(row.amount_eur),
    credits: row.credits,
    bonusCredits: row.bonus_credits,
    active: row.active,
    sortOrder: row.sort_order,
    marketingLabel: row.marketing_label,
  }));
}

export async function getUiMessages(contextArea?: string) {
  const result = await queryPg<{ message_code: string; title: string; body: string; context_area: string }>(
    `SELECT message_code, title, body, context_area
     FROM ui_messages
     WHERE active = TRUE AND ($1 IS NULL OR context_area = $2)
     ORDER BY message_code ASC`,
    [contextArea ?? null, contextArea ?? null],
  );
  return result.rows;
}

function normalizeAmountEur(amountEur: number): number {
  const rounded = Number(amountEur.toFixed(2));
  if (rounded < env.MIN_TOPUP_EUR || rounded > env.MAX_TOPUP_EUR) {
    throw new Error(`amount_out_of_range:${env.MIN_TOPUP_EUR}:${env.MAX_TOPUP_EUR}`);
  }
  return rounded;
}

export async function createCheckoutSession(params: {
  userId: number;
  email?: string | null;
  name: string;
  stripeCustomerId?: string | null;
  preset?: string;
  amountEur?: number;
  creditAmountEur?: number;
  returnUrlBase?: string;
}) {
  await ensureBillingUser({ userId: params.userId, email: params.email, name: params.name, stripeCustomerId: params.stripeCustomerId, chatEnabled: false });
  const offers = await getTopupOffers();
  const selected = params.preset ? offers.find((offer) => offer.offerCode === params.preset) : null;
  const amountEur = normalizeAmountEur(selected?.amountEur ?? Number(params.amountEur ?? 0));
  const creditAmountEur = normalizeAmountEur(selected?.amountEur ?? Number(params.creditAmountEur ?? params.amountEur ?? 0));
  const credits = Math.round(creditAmountEur * env.CREDIT_MULTIPLIER);
  const bonusCredits = selected?.bonusCredits ?? 0;
  const totalCredits = credits + bonusCredits;
  const stripe = getStripeClient();
  const metadata = {
    user_id: String(params.userId),
    credits: String(totalCredits),
    gross_amount: amountEur.toFixed(2),
    credit_amount: creditAmountEur.toFixed(2),
    allocation_rule: '70_30',
    type: 'wallet_topup',
    bonus_credits: String(bonusCredits),
  };

  const successBase = params.returnUrlBase
    ? new URL(params.returnUrlBase, env.STRIPE_SUCCESS_URL)
    : new URL(env.STRIPE_SUCCESS_URL.replace('{CHECKOUT_SESSION_ID}', 'dev-session'));

  if (params.returnUrlBase) {
    successBase.searchParams.set('payment', 'success');
    successBase.searchParams.set('session_id', 'dev-session');
  }

  if (!stripe) {
    successBase.searchParams.set('mode', 'dev');
    successBase.searchParams.set('credits', String(totalCredits));
    return {
      checkoutUrl: successBase.toString(),
      sessionId: `dev-${params.userId}-${Date.now()}`,
      creditsPreview: totalCredits,
      amountEur,
      bonusCredits,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
    allow_promotion_codes: true,
    customer_email: params.email ?? undefined,
    metadata,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: eurToCents(amountEur),
          product_data: {
            name: selected?.name || 'Flex Topup',
            description: `${totalCredits} Credits fuer dein AI-Guthaben`,
          },
        },
      },
    ],
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    creditsPreview: totalCredits,
    amountEur,
    bonusCredits,
  };
}

export async function recordSuccessfulPayment(params: {
  userId: number;
  sessionId: string;
  paymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  grossAmountEur: number;
  creditsIssued: number;
  source: string;
}) {
  const existing = await queryPg<{ id: number }>('SELECT id FROM payments WHERE stripe_session_id = $1', [params.sessionId]);
  if (existing.rowCount && existing.rowCount > 0) {
    const wallet = await getWalletView(params.userId);
    const entitlements = await getEntitlements(params.userId);
    return {
      paymentId: existing.rows[0].id,
      currentBalance: wallet.balance,
      entitlements,
    };
  }

  const payment = await queryPg<{ id: number }>(
    `INSERT INTO payments
      (user_id, stripe_session_id, stripe_payment_intent_id, stripe_customer_id, gross_amount_eur, currency, status, credits_issued)
     VALUES ($1, $2, $3, $4, $5, 'eur', 'paid', $6)
     RETURNING id`,
    [params.userId, params.sessionId, params.paymentIntentId ?? null, params.stripeCustomerId ?? null, params.grossAmountEur, params.creditsIssued],
  );
  const paymentId = Number(payment.rows[0]?.id ?? payment.insertId ?? 0);

  await queryPg(
    `INSERT INTO payment_allocations
      (payment_id, gross_amount_eur, api_budget_eur, reserve_eur, allocation_rule)
     VALUES ($1, $2, $3, $4, '70_30')`,
    [paymentId, params.grossAmountEur, Number((params.grossAmountEur * env.API_BUDGET_RATIO).toFixed(2)), Number((params.grossAmountEur * env.RESERVE_RATIO).toFixed(2))],
  );

  await applyWalletDelta(params.userId, {
    entry_type: 'topup',
    credits_delta: params.creditsIssued,
    reference_type: 'payment',
    reference_id: String(paymentId),
    note: `Topup ${params.grossAmountEur.toFixed(2)} EUR`,
  });

  await enableCorePremiumEntitlements(params.userId, params.source);
  activateCustomerPaymentAccess(params.userId, params.sessionId, params.stripeCustomerId ?? null, eurToCents(params.grossAmountEur));
  await queryPg('UPDATE users SET chat_enabled = TRUE, stripe_customer_id = COALESCE($2, stripe_customer_id), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [params.userId, params.stripeCustomerId ?? null]);

  const wallet = await getWalletView(params.userId);
  const entitlements = await getEntitlements(params.userId);
  return { paymentId, currentBalance: wallet.balance, entitlements };
}

export async function recordRefundBySession(sessionId: string, reason: string) {
  const paymentResult = await queryPg<{ id: number; user_id: number; credits_issued: number }>(
    'SELECT id, user_id, credits_issued FROM payments WHERE stripe_session_id = $1',
    [sessionId],
  );
  const payment = paymentResult.rows[0];
  if (!payment) return false;
  await applyWalletDelta(payment.user_id, {
    entry_type: 'refund',
    credits_delta: -Math.abs(payment.credits_issued),
    reference_type: 'payment_refund',
    reference_id: String(payment.id),
    note: reason,
  });
  await queryPg('UPDATE payments SET status = $1 WHERE id = $2', ['refunded', payment.id]);
  return true;
}

export async function getSessionStatus(sessionId: string) {
  const payment = await queryPg<{ user_id: number; status: string; credits_issued: number }>(
    'SELECT user_id, status, credits_issued FROM payments WHERE stripe_session_id = $1',
    [sessionId],
  );
  const row = payment.rows[0];
  if (!row) {
    return { status: 'pending', creditsAdded: 0, currentBalance: 0, chatEnabled: false, entitlements: null };
  }
  const wallet = await getWalletView(row.user_id);
  const entitlements = await getEntitlements(row.user_id);
  return {
    status: row.status,
    creditsAdded: row.credits_issued,
    currentBalance: wallet.balance,
    chatEnabled: entitlements.webchat,
    entitlements,
  };
}

export async function getPaymentInvoices(userId: number) {
  const result = await queryPg<{
    stripe_session_id: string;
    gross_amount_eur: string;
    credits_issued: number;
    status: string;
    created_at: string;
  }>(
    `SELECT stripe_session_id, gross_amount_eur, credits_issued, status, created_at
     FROM payments
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function getWalletPayload(userId: number) {
  return getWalletView(userId);
}

export async function getWalletHistoryPayload(userId: number) {
  return getWalletLedger(userId);
}
