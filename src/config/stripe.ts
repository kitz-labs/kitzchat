import Stripe from 'stripe';
import { hasStripeConfig } from './env';
import { createStripeClient } from '@/lib/stripe-client';

let stripe: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!hasStripeConfig()) return null;
  if (!stripe) {
    stripe = createStripeClient();
  }
  return stripe;
}
