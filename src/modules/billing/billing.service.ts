import Stripe from 'stripe';
import { queryPg, withPgClient } from '@/config/db';
import { ensureBillingTables, FIRST_TOPUP_DISCOUNT_PERCENT } from '@/lib/billing';
import { getDb } from '@/lib/db';
import {
  activateCustomerPaymentAccess,
  getUserById,
  setUserWalletBalanceCents,
  setNextTopupDiscountPercent,
  updateStripeCustomer,
} from '@/lib/auth';
import { ensureBillingUser, getWalletLedger, getWalletView } from '@/modules/wallet/wallet.service';
import { requireStripeClient } from '@/lib/stripe-client';
import { sendTelegramAlert } from '@/lib/alerts';
import { creditsToCents, env } from '@/config/env';
import { splitGrossAmountCents } from '@/lib/payment-split';

const stripeKey = process.env.STRIPE_SECRET_KEY;
const successUrl = process.env.STRIPE_SUCCESS_URL || '';
const cancelUrl = process.env.STRIPE_CANCEL_URL || '';
const defaultPriceId = process.env.STRIPE_PRICE_ID;
const creditMultiplier = Number(process.env.CREDIT_MULTIPLIER || '1000');

export type CheckoutType = 'activation' | 'topup';

function getStripe() {
  if (!stripeKey) throw new Error('stripe_not_configured');
  return requireStripeClient();
}

function toFixedEur(value: number | undefined): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * 100) / 100;
}

function toCredits(amountEur: number): number {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return 0;
  return Math.max(0, Math.round(amountEur * creditMultiplier));
}

function buildReturnUrl(base: string, params: Record<string, string | number | null | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function ensureStripeCustomerId(params: {
  stripe: Stripe;
  userId: number;
  username: string;
  email?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string | null> {
  if (params.stripeCustomerId) return params.stripeCustomerId;
  try {
    const customer = await params.stripe.customers.create({
      name: params.username,
      email: params.email ?? undefined,
      metadata: {
        user_id: String(params.userId),
        username: params.username,
      },
    });
    updateStripeCustomer(params.userId, customer.id, null);
    return customer.id;
  } catch {
    return null;
  }
}

async function findTopupOfferByCode(offerCode?: string | null) {
  if (!offerCode) return null;
  const res = await queryPg<{
    offer_code: string;
    amount_eur: number;
    credits: number;
    bonus_credits: number;
  }>('SELECT offer_code, amount_eur, credits, bonus_credits FROM topup_offers WHERE offer_code = $1 LIMIT 1', [offerCode]);
  return res.rows[0] ?? null;
}

async function findTopupOfferByAmount(amountEur: number) {
  if (!amountEur || amountEur <= 0) return null;
  const normalized = toFixedEur(amountEur);
  const res = await queryPg<{
    offer_code: string;
    amount_eur: number;
    credits: number;
    bonus_credits: number;
  }>(
    'SELECT offer_code, amount_eur, credits, bonus_credits FROM topup_offers WHERE active = true AND amount_eur = $1 ORDER BY sort_order ASC LIMIT 1',
    [normalized],
  );
  return res.rows[0] ?? null;
}

export async function createCheckoutSession(opts: {
  userId: number;
  email?: string | null;
  name: string;
  stripeCustomerId?: string | null;
  preset?: string | undefined;
  amountEur?: number;
  creditAmountEur?: number;
  checkoutType?: CheckoutType;
  discountPercent?: number;
  returnUrlBase?: string | undefined;
  returnPath?: string | undefined;
}) {
  const stripe = getStripe();
  const { userId, stripeCustomerId, preset } = opts;
  const checkoutType: CheckoutType = opts.checkoutType ?? 'topup';
  const discountPercent = Math.max(0, Math.min(100, Math.round(Number(opts.discountPercent ?? 0))));

  const presetOffer = await findTopupOfferByCode(preset);
  const normalizedAmountEur = toFixedEur(presetOffer?.amount_eur ?? opts.amountEur);
  const normalizedCreditAmountEur = toFixedEur(opts.creditAmountEur ?? normalizedAmountEur);
  const activeOffer = checkoutType === 'topup'
    ? presetOffer ?? await findTopupOfferByAmount(normalizedCreditAmountEur)
    : null;
  const offerCode = activeOffer?.offer_code ?? null;
  const creditsPreview = activeOffer
    ? Number(activeOffer.credits || 0) + Number(activeOffer.bonus_credits || 0)
    : toCredits(normalizedCreditAmountEur);

  if (!normalizedAmountEur && !defaultPriceId) {
    throw new Error('amount_required');
  }

  const amountCents = Math.round(normalizedAmountEur * 100);
  const creditAmountCents = Math.round(normalizedCreditAmountEur * 100);
  const returnPath = typeof opts.returnPath === 'string' && opts.returnPath.startsWith('/')
    ? opts.returnPath
    : (() => {
        try {
          return opts.returnUrlBase ? new URL(opts.returnUrlBase).pathname : '/';
        } catch {
          return '/';
        }
      })();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (defaultPriceId && preset && !activeOffer) {
    lineItems.push({ price: defaultPriceId ?? undefined, quantity: 1 } as any);
  } else if (amountCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: checkoutType === 'activation' ? 'Activation' : 'Top-up' },
        unit_amount: amountCents,
      },
      quantity: 1,
    });
  } else if (defaultPriceId) {
    lineItems.push({ price: defaultPriceId ?? undefined, quantity: 1 } as any);
  }

  const successRedirect = opts.returnUrlBase
    ? buildReturnUrl(opts.returnUrlBase, {
        payment: 'success',
        session_id: '{CHECKOUT_SESSION_ID}',
        checkout_type: checkoutType,
        amount_cents: amountCents,
        credit_amount_cents: creditAmountCents,
        discount_percent: discountPercent,
        credits: creditsPreview,
        return_path: returnPath,
      })
    : successUrl;
  const cancelRedirect = opts.returnUrlBase
    ? buildReturnUrl(opts.returnUrlBase, {
        payment: 'cancelled',
        checkout_type: checkoutType,
        amount_cents: amountCents,
        credit_amount_cents: creditAmountCents,
        discount_percent: discountPercent,
        credits: creditsPreview,
        return_path: returnPath,
      })
    : cancelUrl;

  const metadata: Record<string, string> = {
    user_id: String(userId),
    checkout_type: checkoutType,
    amount_cents: String(amountCents),
    credit_amount_cents: String(creditAmountCents),
    credits: String(creditsPreview),
    discount_percent: String(discountPercent),
    preset: preset ?? '',
  };
  if (offerCode) metadata.offer_code = offerCode;
  if (opts.email) metadata.email = opts.email;
  if (opts.name) metadata.username = opts.name;

  const ensuredCustomerId = await ensureStripeCustomerId({
    stripe,
    userId,
    username: opts.name,
    email: opts.email ?? null,
    stripeCustomerId: stripeCustomerId ?? null,
  });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: lineItems as any,
    success_url: successRedirect,
    cancel_url: cancelRedirect,
    customer: ensuredCustomerId ?? undefined,
    customer_email: ensuredCustomerId ? undefined : opts.email ?? undefined,
    client_reference_id: String(userId),
    metadata,
  });

  return { checkoutUrl: session.url, sessionId: session.id, creditsPreview, offerCode };
}

type TopupOfferRow = {
  id: number;
  offer_code: string;
  name: string;
  amount_eur: number;
  credits: number;
  bonus_credits: number;
  active: boolean | number;
  sort_order: number;
  marketing_label: string | null;
};

export function normalizeTopupOfferRow(row: TopupOfferRow) {
  return {
    id: row.id,
    offerCode: row.offer_code,
    offer_code: row.offer_code,
    name: row.name,
    amountEur: Number(row.amount_eur ?? 0),
    amount_eur: Number(row.amount_eur ?? 0),
    credits: Number(row.credits ?? 0),
    bonusCredits: Number(row.bonus_credits ?? 0),
    bonus_credits: Number(row.bonus_credits ?? 0),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    marketingLabel: row.marketing_label ?? null,
    marketing_label: row.marketing_label ?? null,
  };
}

export async function getTopupOffers() {
  const res = await queryPg<TopupOfferRow>(
    'SELECT id, offer_code, name, amount_eur, credits, bonus_credits, active, sort_order, marketing_label FROM topup_offers WHERE active = true ORDER BY sort_order ASC',
  );
  return res.rows.map(normalizeTopupOfferRow);
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

export async function getPaymentInvoices(userId: number) {
  const res = await queryPg<{
    stripe_session_id: string;
    gross_amount_eur: number;
    credits_issued: number;
    status: string;
    created_at: string;
  }>(
    'SELECT stripe_session_id, gross_amount_eur, credits_issued, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return res.rows;
}

export async function getWalletPayload(userId: number) {
  return getWalletView(userId);
}

export async function getWalletHistoryPayload(userId: number) {
  return getWalletLedger(userId);
}

export async function recordSuccessfulPayment(params: {
  userId: number;
  sessionId: string;
  paymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  grossAmountEur: number;
  creditAmountCents?: number;
  creditsIssued?: number;
  checkoutType?: CheckoutType;
  discountPercent?: number;
  source?: string;
}) {
  const grossAmountEur = Math.max(0, Number(params.grossAmountEur || 0));
  const creditAmountEur = params.creditAmountCents ? params.creditAmountCents / 100 : undefined;
  const creditsIssued = Number(params.creditsIssued ?? toCredits(creditAmountEur ?? grossAmountEur));
  const checkoutType = params.checkoutType ?? 'topup';
  const discountPercent = Math.max(0, Math.min(100, Math.round(Number(params.discountPercent ?? 0))));
  const grossAmountCents = Math.max(0, Math.round(grossAmountEur * 100));
  const derivedCreditCents = creditsToCents(creditsIssued);
  const effectiveCreditCents = params.creditAmountCents && params.creditAmountCents > 0
    ? Math.max(0, Math.round(params.creditAmountCents))
    : grossAmountCents > 0
      ? grossAmountCents
      : derivedCreditCents;

  // Internal bookkeeping split (customer still sees full credits).
  const allocationGrossCents = grossAmountCents > 0 ? grossAmountCents : effectiveCreditCents;
  const split = splitGrossAmountCents(allocationGrossCents, env.ADMIN_SHARE_RATIO);
  const usageBudgetEur = split.usageBudgetCents / 100;
  const adminShareEur = split.adminShareCents / 100;

  const user = getUserById(params.userId);
  if (!user) {
    throw new Error('user_not_found');
  }

  await ensureBillingUser({
    userId: params.userId,
    email: user.email ?? null,
    name: user.username,
    stripeCustomerId: params.stripeCustomerId ?? user.stripe_customer_id ?? null,
    chatEnabled: true,
  });

  let finalBalanceCredits = 0;

  await withPgClient(async (client) => {
    await client.beginTransaction?.();
    try {
      const existing = await client.query<{ id: number; credits_issued: number }>(
        'SELECT id, credits_issued FROM payments WHERE stripe_session_id = $1',
        [params.sessionId],
      );
      let paymentId: number;
      const alreadyCredited = existing.rowCount > 0 && Number(existing.rows[0].credits_issued ?? 0) > 0;
      if (existing.rowCount > 0) {
        paymentId = Number(existing.rows[0].id);
      } else {
        const insert = await client.query<{ id: number }>(
          'INSERT INTO payments (user_id, stripe_session_id, stripe_payment_intent_id, stripe_customer_id, gross_amount_eur, currency, status, credits_issued) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
          [params.userId, params.sessionId, params.paymentIntentId ?? null, params.stripeCustomerId ?? null, grossAmountEur, 'eur', 'completed', 0],
        );
        paymentId = Number(insert.rows[0].id);
      }

      if (alreadyCredited) {
        const walletRow = await client.query<{ balance_credits: number }>(
          'SELECT balance_credits FROM wallets WHERE user_id = $1',
          [params.userId],
        );
        finalBalanceCredits = Number(walletRow.rows[0]?.balance_credits ?? 0);

        // Ensure allocations exist and contain the (gross->usage/admin) split, without touching customer credits.
        const allocationExists = await client.query<{ id: number }>(
          'SELECT id FROM payment_allocations WHERE payment_id = $1 LIMIT 1',
          [paymentId],
        );
        if (allocationExists.rowCount === 0) {
          await client.query(
            `INSERT INTO payment_allocations
              (payment_id, gross_amount_eur, api_budget_eur, reserve_eur, allocation_rule, gross_amount_cents, usage_budget_cents, admin_share_cents)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [paymentId, grossAmountEur, usageBudgetEur, adminShareEur, 'split_70_30', split.grossAmountCents, split.usageBudgetCents, split.adminShareCents],
          );
        } else {
          await client.query(
            `UPDATE payment_allocations
             SET gross_amount_eur = $2,
                 api_budget_eur = $3,
                 reserve_eur = $4,
                 allocation_rule = $5,
                 gross_amount_cents = $6,
                 usage_budget_cents = $7,
                 admin_share_cents = $8
             WHERE payment_id = $1`,
            [paymentId, grossAmountEur, usageBudgetEur, adminShareEur, 'split_70_30', split.grossAmountCents, split.usageBudgetCents, split.adminShareCents],
          );
        }

        await client.query(
          'UPDATE users SET chat_enabled = true, stripe_customer_id = COALESCE($2, stripe_customer_id), updated_at = NOW() WHERE id = $1',
          [params.userId, params.stripeCustomerId ?? null],
        );

        await client.commit?.();
        return;
      }

      const walletRow = await client.query<{ id: number; balance_credits: number }>(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1',
        [params.userId],
      );
      let walletId: number;
      let balanceAfter = creditsIssued;
      if (walletRow.rowCount === 0) {
        const created = await client.query<{ id: number; balance_credits: number }>(
          'INSERT INTO wallets (user_id, balance_credits) VALUES ($1, $2) RETURNING id, balance_credits',
          [params.userId, creditsIssued],
        );
        walletId = Number(created.rows[0].id);
        balanceAfter = Number(created.rows[0].balance_credits);
      } else {
        walletId = Number(walletRow.rows[0].id);
        const newBalance = Number(walletRow.rows[0].balance_credits) + creditsIssued;
        await client.query('UPDATE wallets SET balance_credits = $1, updated_at = NOW() WHERE id = $2', [newBalance, walletId]);
        balanceAfter = newBalance;
      }
      finalBalanceCredits = balanceAfter;

      const ledgerExists = await client.query<{ id: number }>(
        'SELECT id FROM wallet_ledger WHERE reference_type = $1 AND reference_id = $2 LIMIT 1',
        ['payment', String(paymentId)],
      );
      if (ledgerExists.rowCount === 0) {
        const entryType = checkoutType === 'activation' ? 'activation' : 'topup';
        await client.query(
          'INSERT INTO wallet_ledger (user_id, wallet_id, entry_type, credits_delta, balance_after, reference_type, reference_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            params.userId,
            walletId,
            entryType,
            creditsIssued,
            balanceAfter,
            'payment',
            String(paymentId),
            `${entryType === 'activation' ? 'Activation' : 'Top-up'} via ${params.source || 'payment'} ${params.sessionId}`,
          ],
        );
      }

      await client.query('UPDATE payments SET credits_issued = $1 WHERE id = $2', [creditsIssued, paymentId]);

      const allocationExists = await client.query<{ id: number }>(
        'SELECT id FROM payment_allocations WHERE payment_id = $1 LIMIT 1',
        [paymentId],
      );
      if (allocationExists.rowCount === 0) {
        await client.query(
          `INSERT INTO payment_allocations
            (payment_id, gross_amount_eur, api_budget_eur, reserve_eur, allocation_rule, gross_amount_cents, usage_budget_cents, admin_share_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [paymentId, grossAmountEur, usageBudgetEur, adminShareEur, 'split_70_30', split.grossAmountCents, split.usageBudgetCents, split.adminShareCents],
        );
      } else {
        // Idempotent: keep allocations aligned with stored payment amounts.
        await client.query(
          `UPDATE payment_allocations
           SET gross_amount_eur = $2,
               api_budget_eur = $3,
               reserve_eur = $4,
               allocation_rule = $5,
               gross_amount_cents = $6,
               usage_budget_cents = $7,
               admin_share_cents = $8
           WHERE payment_id = $1`,
          [paymentId, grossAmountEur, usageBudgetEur, adminShareEur, 'split_70_30', split.grossAmountCents, split.usageBudgetCents, split.adminShareCents],
        );
      }

      await client.query(
        'UPDATE users SET chat_enabled = true, stripe_customer_id = COALESCE($2, stripe_customer_id), updated_at = NOW() WHERE id = $1',
        [params.userId, params.stripeCustomerId ?? null],
      );

      await client.commit?.();
    } catch (error) {
      await client.rollback?.();
      throw error;
    }
  });

  updateStripeCustomer(params.userId, params.stripeCustomerId ?? null, params.sessionId);
  activateCustomerPaymentAccess(
    params.userId,
    params.sessionId,
    params.stripeCustomerId ?? null,
    checkoutType === 'activation' ? effectiveCreditCents : undefined,
  );

  // SQLite is a UI/cache mirror only. After Billing-DB crediting, mirror from the final Billing balance.
  setUserWalletBalanceCents(params.userId, creditsToCents(finalBalanceCredits));

  // Record the payment locally (SQLite) to keep UI flows compatible and to provide a single idempotency anchor
  // for "one-time" side effects like counters, discount flip, and Telegram alerts.
  let firstLocalProcessing = false;
  try {
    ensureBillingTables();
    const result = getDb()
      .prepare(
        'INSERT OR IGNORE INTO billing_events (session_id, user_id, checkout_type, amount_cents, credit_amount_cents, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(params.sessionId, params.userId, checkoutType, grossAmountCents, effectiveCreditCents, discountPercent);
    firstLocalProcessing = result.changes > 0;

    // Keep "completed payments count" consistent and idempotent via the local billing_events log.
    const row = getDb().prepare('SELECT COUNT(*) AS cnt FROM billing_events WHERE user_id = ?').get(params.userId) as { cnt?: number } | undefined;
    const completedPayments = Math.max(0, Math.round(Number(row?.cnt ?? 0)));
    getDb().prepare('UPDATE users SET completed_payments_count = ? WHERE id = ?').run(completedPayments, params.userId);

    // Discounts are idempotent; apply them based on actual payment history.
    if (checkoutType === 'topup' && discountPercent > 0) {
      setNextTopupDiscountPercent(params.userId, 0);
    }
    if (completedPayments <= 1) {
      setNextTopupDiscountPercent(params.userId, FIRST_TOPUP_DISCOUNT_PERCENT);
    }
  } catch {
    // ignore local idempotency record failures (Billing-DB remains source of truth)
  }

  const refreshed = getUserById(params.userId);
  const displayName = refreshed?.first_name || refreshed?.last_name
    ? `${(refreshed?.first_name || '').trim()} ${(refreshed?.last_name || '').trim()}`.trim()
    : refreshed?.username || user.username;
  const amountLine = `€${(effectiveCreditCents / 100).toFixed(2)}`;
  const grossLine = grossAmountCents > 0 ? `€${(grossAmountCents / 100).toFixed(2)}` : amountLine;
  const kindLabel = checkoutType === 'activation' ? 'Aktivierung' : 'Top-up';
  const telegramMessage = [
    `Stripe Zahlung bestaetigt ✅`,
    ``,
    `Typ: ${kindLabel}`,
    `Kunde: ${displayName} (@${refreshed?.username || user.username})`,
    refreshed?.company ? `Firma: ${refreshed.company}` : null,
    refreshed?.email ? `E-Mail: ${refreshed.email}` : null,
    `Gutschrift: ${amountLine}`,
    `Zahlung: ${grossLine}`,
    refreshed?.stripe_customer_id ? `Stripe Customer: ${refreshed.stripe_customer_id}` : null,
    `Session: ${params.sessionId}`,
    ``,
    `Dashboard: /customers/${params.userId}`,
  ].filter(Boolean).join('\n');

  if (firstLocalProcessing) {
    sendTelegramAlert(telegramMessage).catch(() => {});
  }
}

export default {
  createCheckoutSession,
  getTopupOffers,
  getSessionStatus,
  getUiMessages,
  getPaymentInvoices,
  getWalletPayload,
  getWalletHistoryPayload,
  recordSuccessfulPayment,
};
