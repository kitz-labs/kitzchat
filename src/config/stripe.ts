import Stripe from 'stripe';
import { env, hasStripeConfig } from './env';

let stripe: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!hasStripeConfig()) return null;
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripe;
}
