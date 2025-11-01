import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe'; // adjust import path as needed

export async function OPTIONS() {
  // Reply to preflight with 204 No Content (and no empty body)
  return new NextResponse(null, {
    status: 204,
    headers: {
      // If your client is cross-origin you may need these:
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeInstance();
    if (!stripe) {
      console.error('Stripe not configured');
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
    }

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    let payload: any = null;
    if (contentType.includes('application/json')) {
      payload = await request.json().catch(() => null);
    } else {
      payload = Object.fromEntries(await request.formData().catch(() => new Map()));
    }

    // Validate payload shape minimally
    const { plan, orgId, userId } = payload || {};
    if (!plan || !orgId || !userId) {
      return NextResponse.json({ error: 'Missing required fields: plan, orgId, userId' }, { status: 400 });
    }

    // TODO: replace with your real checkout/session creation logic
    // Example (use your existing stripe.checkout.sessions.create call):
    const session = {
      id: 'cs_test_example',
      url: 'https://example.com/stripe-checkout',
    };

    return NextResponse.json({ url: session.url, session_id: session.id }, { status: 200 });
  } catch (err) {
    console.error('/api/billing/checkout POST error', err);
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 });
  }
}

// For any other HTTP methods, return a JSON 405 (this prevents an empty 405 body)
export function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
