import Stripe from 'stripe';
import { loadStripe, Stripe as StripeJS } from '@stripe/stripe-js';

// Initialize Stripe client for server-side operations
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Only initialize Stripe if we have the secret key
export const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover',
      typescript: true,
    })
  : null;

// Helper function to get Stripe instance with error checking
export const getStripeInstance = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables.');
  }
  return stripe;
};

// Initialize Stripe.js for client-side operations
let stripePromise: Promise<StripeJS | null>;
export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

// Helper function to format price for display
export const formatPrice = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
};

// Subscription plan configurations
export const SUBSCRIPTION_PLANS = {
  BASIC: {
    name: 'Basic Plan',
    priceId: process.env.STRIPE_PRICE_ID_BASIC || 'price_not_configured',
    price: 499, // $4.99 in cents
    interval: 'month',
    features: [
      'Access to meal planning',
      'Basic recipe collection',
      'Family calendar',
      'Shopping lists',
    ],
  },
  PREMIUM: {
    name: 'Premium Plan',
    priceId: process.env.STRIPE_PRICE_ID_PREMIUM || 'price_not_configured',
    price: 999, // $9.99 in cents
    interval: 'month',
    features: [
      'All Basic features',
      'Advanced meal planning',
      'Unlimited recipes',
      'Family devotions library',
      'Budget tracking',
      'Priority support',
    ],
  },
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;