import Stripe from 'stripe';

/**
 * Server-only helper to create a Stripe client.
 * Do NOT import this module from client-side code.
 */
export function getStripeInstance(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET;
  if (!key) {
    console.error('[stripeServer] STRIPE_SECRET_KEY is not set in environment');
    return null;
  }

  try {
    // Construct Stripe client without forcing a hard-coded apiVersion to avoid TS literal mismatch issues.
    return new Stripe(key);
  } catch (err) {
    console.error('[stripeServer] failed to create Stripe client', err);
    return null;
  }
}
