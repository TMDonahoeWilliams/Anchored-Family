// lib/stripe.ts
// Shared client-side helpers for subscription plans and formatting.

export type PlanKey = 'BASIC' | 'PLUS' | 'PREMIUM';

export type SubscriptionPlan = {
  name: string;
  price: number;       // numeric price in dollars (e.g. 4.99)
  interval: 'month' | 'year';
  priceId: string;     // Stripe Price ID (public env var expected)
  description?: string;
};

/**
 * Public price IDs read from NEXT_PUBLIC_* env vars so the client can submit
 * the correct price_id to your checkout endpoint. Make sure you set these in Vercel:
 * - NEXT_PUBLIC_PRICE_BASIC_ID
 * - NEXT_PUBLIC_PRICE_PLUS_ID
 * - NEXT_PUBLIC_PRICE_PREMIUM_ID
 *
 * Note: In production the server should be the authoritative source of price IDs.
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
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export function getPriceIdForPlan(key: PlanKey): string {
  return SUBSCRIPTION_PLANS[key].priceId;
}

export default {
  SUBSCRIPTION_PLANS,
  formatPrice,
  getPriceIdForPlan,
};
