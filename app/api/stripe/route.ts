import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ensure Node runtime so we can use Buffer/stripe sdk

// Use the exact API version string that matches your Stripe events/types.
// Previously build failed because code used '2025-09-30' while the project expects '2025-09-30.clover'.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error('Missing STRIPE_WEBHOOK_SECRET env var');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature') ?? '';
  if (!sig) {
    console.error('Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Important: preserve raw body bytes for signature verification
  let buf: Buffer;
  try {
    const ab = await req.arrayBuffer();
    buf = Buffer.from(ab);
  } catch (err: any) {
    console.error('Failed to read request body as arrayBuffer', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err?.message ?? err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event types you care about
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        {
          const pi = event.data.object as Stripe.PaymentIntent;
          console.log('PaymentIntent succeeded:', pi.id);
          // TODO: handle success (fulfill order, update DB, etc.)
        }
        break;
      case 'payment_intent.payment_failed':
        {
          const pi = event.data.object as Stripe.PaymentIntent;
          console.log('PaymentIntent failed:', pi.id);
          // TODO: handle failure
        }
        break;
      case 'reporting.report_type.updated':
        {
          console.log('Reporting report_type updated event received');
          // optional: handle reporting events if you need
        }
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error('Error handling webhook event', err);
    // Even if handling fails, return 200 to avoid Stripe retries unless you want retries.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
