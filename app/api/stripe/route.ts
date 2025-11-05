import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ensure Node runtime, not edge, if you prefer Node stripe SDK

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30',
});

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature') ?? '';
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });

  // IMPORTANT: use arrayBuffer() to preserve raw bytes, then convert to Buffer
  const buf = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // handle event
  // ...
  return NextResponse.json({ received: true });
}
