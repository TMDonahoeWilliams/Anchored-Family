import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripeInstance() {
  if (stripe) return stripe;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error('Missing STRIPE_SECRET_KEY environment variable');
    return null;
  }

  stripe = new Stripe(secret, {
    apiVersion: '2023-08-16', // pin to the API version your code targets; change to your version
    // optionally set maxNetworkRetries, timeout etc.
  });

  return stripe;
}
