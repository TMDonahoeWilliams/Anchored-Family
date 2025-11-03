import Stripe from 'stripe';

/**
 * Server-only helper to create a Stripe client.
 * Keep this file server-only (do not import from client-side code).
 */

export function getStripeInstance(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET;
  if (!key) {
    console.error('[stripeServer] STRIPE_SECRET_KEY is not set in environment');
    return null;
  }

  try {
    // Do not force a hard-coded apiVersion here to avoid TS literal-type mismatches
    // with the Stripe typings used in different SDK releases.
    return new Stripe(key);
  } catch (err) {
    console.error('[stripeServer] failed to create Stripe client', err);
    return null;
  }
}
