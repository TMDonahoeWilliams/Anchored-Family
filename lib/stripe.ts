// lib/stripe.ts
// Shared client-side helpers for subscription plans and formatting.
// Exported for use by subscription UI components.

export type PlanKey = 'BASIC' | 'PLUS' | 'PREMIUM';

export type SubscriptionPlan = {
  name: string;
  price: number;       // numeric price in dollars (e.g. 4.99)
  interval: 'month' | 'year';
  priceId: string;     // Stripe Price ID (public env var expected)
  description?: string;
};

/**
 * Read public price IDs from NEXT_PUBLIC_ env vars so the client can submit the
 * correct price_id to your checkout endpoint. Make sure you set these in Vercel:
 * - NEXT_PUBLIC_PRICE_BASIC_ID
 * - NEXT_PUBLIC_PRICE_PLUS_ID
 * - NEXT_PUBLIC_PRICE_PREMIUM_ID
 *
 * If you use different env var names on the server, ensure your server-side mapping
 * uses the same IDs for creating Checkout Sessions. The client should not be the
 * authoritative source for price config in production, but providing priceId here
 * makes the quick form POST approach used in the UI work.
 */
const BASIC_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_BASIC_ID || '';
const PLUS_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_PLUS_ID || '';
const PREMIUM_PRICE_ID = process.env.NEXT_PUBLIC_PRICE_PREMIUM_ID || '';

export const SUBSCRIPTION_PLANS: Record<PlanKey, SubscriptionPlan> = {
  BASIC: {
    name: 'Basic',
    price: 4.99,
    interval: 'month',
    priceId: BASIC_PRICE_ID,
    description: 'Essential family tools: meal planning, recipes, calendar, and shopping lists',
  },
  PLUS: {
    name: 'Plus',
    price: 7.99,
    interval: 'month',
    priceId: PLUS_PRICE_ID,
    description: 'Everything in Basic plus budgeting features, shared roles, and advanced planner tools',
  },
  PREMIUM: {
    name: 'Premium',
    price: 9.99,
    interval: 'month',
    priceId: PREMIUM_PRICE_ID,
    description: 'Complete family suite: all Plus features plus devotions, vault, advanced sharing, and priority support',
  },
};

/**
 * Format a numeric price to a currency string.
 * Accepts number (e.g. 4.99) or a string/number-like value.
 */
export function formatPrice(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '$0.00';
  // Use toLocaleString for proper formatting; force en-US and USD for now.
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

/**
 * Helper to get priceId for a plan key.
 * Throws if plan not found. Returns empty string if a priceId isn't configured.
 */
export function getPriceIdForPlan(key: PlanKey): string {
  const p = SUBSCRIPTION_PLANS[key];
  return p?.priceId ?? '';
}

export default {
  SUBSCRIPTION_PLANS,
  formatPrice,
  getPriceIdForPlan,
};
