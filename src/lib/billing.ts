import Stripe from 'stripe';
import { addUserWalletBalance, getUserById, incrementCompletedPayments, markUserPaid, setNextTopupDiscountPercent, updateStripeCustomer } from './auth';
import { CHECKOUT_PRESET_OPTIONS, MIN_CUSTOM_TOPUP_CENTS } from './checkout-options';
import { getDb } from './db';

export const ACTIVATION_AMOUNT_CENTS = 2000;
export const TOP_UP_OPTIONS = CHECKOUT_PRESET_OPTIONS;
export type CheckoutType = 'activation' | 'topup';
export const FIRST_TOPUP_DISCOUNT_PERCENT = 30;
const MAX_CUSTOM_TOPUP_CENTS = 100_000;

export function ensureBillingTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_events (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      checkout_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      credit_amount_cents INTEGER NOT NULL DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    db.exec('ALTER TABLE billing_events ADD COLUMN credit_amount_cents INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  try {
    db.exec('ALTER TABLE billing_events ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0');
  } catch { /* column exists */ }
  db.exec('UPDATE billing_events SET credit_amount_cents = CASE WHEN COALESCE(credit_amount_cents, 0) <= 0 THEN amount_cents ELSE credit_amount_cents END');
}

export function isCheckoutType(value: string | null | undefined): value is CheckoutType {
  return value === 'activation' || value === 'topup';
}

export function normalizeCheckoutAmount(checkoutType: CheckoutType, rawAmount: unknown): number {
  const amount = Math.round(Number(rawAmount));
  if (!Number.isFinite(amount)) return checkoutType === 'activation' ? ACTIVATION_AMOUNT_CENTS : TOP_UP_OPTIONS[0];
  return Math.min(MAX_CUSTOM_TOPUP_CENTS, Math.max(MIN_CUSTOM_TOPUP_CENTS, amount));
}

export function calculateDiscountedAmount(amountCents: number, discountPercent: number): number {
  const percent = Math.max(0, Math.min(100, Math.round(discountPercent)));
  if (percent <= 0) return amountCents;
  return Math.max(MIN_CUSTOM_TOPUP_CENTS, Math.round((amountCents * (100 - percent)) / 100));
}

export function getNextTopupDiscountPercent(user: { next_topup_discount_percent?: number | null } | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(user?.next_topup_discount_percent ?? 0)));
}

export function getCheckoutCopy(checkoutType: CheckoutType, amountCents: number): { name: string; description: string } {
  if (checkoutType === 'topup') {
    return {
      name: `KitzChat Guthaben ${formatEuro(amountCents)}`,
      description: 'Guthaben fuer laufende Agenten-Nutzung im Kundenkonto aufladen.',
    };
  }

  return {
    name: `KitzChat Startguthaben ${formatEuro(amountCents)}`,
    description: 'Die erste Einzahlung schaltet den Kundenzugang frei und bucht dein Startguthaben direkt ins Wallet.',
  };
}

export function formatEuro(amountCents: number): string {
  return `EUR ${(amountCents / 100).toFixed(2)}`;
}

function applyCheckoutToUser(userId: number, checkoutType: CheckoutType, chargedAmountCents: number, creditAmountCents: number, discountPercent: number, checkoutSessionId: string, stripeCustomerId: string | null): void {
  const user = getUserById(userId);
  const previousPayments = user?.completed_payments_count ?? 0;

  updateStripeCustomer(userId, stripeCustomerId, checkoutSessionId);

  if (checkoutType === 'topup') {
    addUserWalletBalance(userId, creditAmountCents, checkoutSessionId);
    if (discountPercent > 0) {
      setNextTopupDiscountPercent(userId, 0);
    }
  } else {
    markUserPaid(userId, creditAmountCents, checkoutSessionId);
  }

  incrementCompletedPayments(userId);

  if (previousPayments <= 0) {
    setNextTopupDiscountPercent(userId, FIRST_TOPUP_DISCOUNT_PERCENT);
  }
}

export function applySuccessfulCheckout(session: Stripe.Checkout.Session): boolean {
  const userId = Number(session.metadata?.user_id || 0);
  const checkoutType = isCheckoutType(session.metadata?.checkout_type) ? session.metadata.checkout_type : 'activation';
  const amountCents = normalizeCheckoutAmount(checkoutType, session.metadata?.amount_cents);
  const creditAmountCents = normalizeCheckoutAmount(checkoutType, session.metadata?.credit_amount_cents ?? session.metadata?.amount_cents);
  const discountPercent = Math.max(0, Math.min(100, Math.round(Number(session.metadata?.discount_percent || 0))));

  if (!Number.isInteger(userId) || userId <= 0) return false;

  ensureBillingTables();
  const db = getDb();
  const result = db.prepare(
    'INSERT OR IGNORE INTO billing_events (session_id, user_id, checkout_type, amount_cents, credit_amount_cents, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(session.id, userId, checkoutType, amountCents, creditAmountCents, discountPercent);

  if (result.changes === 0) {
    return false;
  }

  applyCheckoutToUser(userId, checkoutType, amountCents, creditAmountCents, discountPercent, session.id, session.customer ? String(session.customer) : null);
  return true;
}

export function applySimulatedCheckout(userId: number, checkoutType: CheckoutType, chargedAmountCents: number, creditAmountCents: number, discountPercent: number, checkoutSessionId = 'dev-simulated-checkout'): void {
  ensureBillingTables();
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO billing_events (session_id, user_id, checkout_type, amount_cents, credit_amount_cents, discount_percent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(checkoutSessionId, userId, checkoutType, chargedAmountCents, creditAmountCents, discountPercent);
  applyCheckoutToUser(userId, checkoutType, chargedAmountCents, creditAmountCents, discountPercent, checkoutSessionId, null);
}