import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';
import Stripe from 'stripe';

// Ensure Node runtime for Stripe Node SDK usage
export const runtime = 'nodejs';

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  // Read raw body as text (required for signature verification)
  const body = await request.text();

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    console.error('[webhook] Missing stripe-signature header');
    return jsonError('Missing stripe signature', 400);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Fail fast with clear log (do NOT return secret to client)
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured in environment');
    return jsonError('Webhook not configured', 500);
  }

  // create Stripe client (throws if STRIPE_SECRET_KEY missing when using getStripeInstance implementation that throws)
  let stripe;
  try {
    stripe = getStripeInstance();
  } catch (err: any) {
    console.error('[webhook] getStripeInstance error:', err?.message ?? err);
    return jsonError('Payment provider not configured', 500);
  }

  let event: Stripe.Event;
  try {
    // constructEvent expects the raw payload (string or Buffer) and the signature header
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    // Signature verification failed or payload malformed
    console.error('[webhook] Webhook signature verification failed:', err?.message ?? err);
    return jsonError('Webhook signature verification failed', 400);
  }

  try {
    // Log event type and id for observability
    console.log(`[webhook] Received Stripe event: type=${event.type} id=${event.id}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[webhook] checkout.session.completed', { id: session.id, customer: session.customer });

        // TODO: process the session (create/update user, store subscription, send welcome email)
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] customer.subscription.created', { id: subscription.id });
        // TODO: handle subscription creation
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] customer.subscription.updated', { id: subscription.id });
        // TODO: handle subscription updates
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] customer.subscription.deleted', { id: subscription.id });
        // TODO: handle cancellation
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[webhook] invoice.payment_succeeded', { id: invoice.id });
        // TODO: handle successful invoice
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[webhook] invoice.payment_failed', { id: invoice.id });
        // TODO: handle failed payment
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[webhook] trial_will_end', { id: subscription.id });
        // TODO: handle trial ending
        break;
      }

      default: {
        console.log('[webhook] Unhandled event type:', event.type);
      }
    }
  } catch (err: any) {
    console.error('[webhook] Error processing event:', err?.message ?? err);
    return NextResponse.json({ error: 'Error processing webhook' }, { status: 500 });
  }

  // Respond 200 to acknowledge receipt
  return NextResponse.json({ received: true }, { status: 200 });
}

// Reject other methods explicitly
export function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
