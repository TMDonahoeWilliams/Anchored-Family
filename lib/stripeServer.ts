import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2022-11-15';

/**
 * Return a configured Stripe instance or null if STRIPE_SECRET_KEY is not set.
 * This file is server-only. Do not import it from client-side code.
 */
export function getStripeInstance(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET;
  if (!key) {
    // Be explicit in logs so deploy errors are easy to spot
    console.error('[stripeServer] STRIPE_SECRET_KEY is not set in environment');
    return null;
  }

  try {
    return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  } catch (err) {
    console.error('[stripeServer] failed to create Stripe client', err);
    return null;
  }
}
