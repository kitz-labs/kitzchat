import Stripe from 'stripe';

export function createStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  const apiVersion = process.env.STRIPE_API_VERSION?.trim();
  if (apiVersion) {
    return new Stripe(key, { apiVersion: apiVersion as any });
  }
  return new Stripe(key);
}

export function requireStripeClient(): Stripe {
  const stripe = createStripeClient();
  if (!stripe) throw new Error('stripe_not_configured');
  return stripe;
}
