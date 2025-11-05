import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripeInstance } from '@/lib/stripeServer';

export const runtime = 'nodejs';

// Helper to parse access token from Bearer header or Supabase cookie (sb:token)
function extractAccessToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.split('Bearer ')[1];
  // Fallback: try Supabase session cookie format (sb:token)
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/sb:token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripeInstance();
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[create-checkout-session] Missing Supabase service role env vars');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Authenticate user via access token from header or cookie
    const token = extractAccessToken(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error('[create-checkout-session] auth.getUser failed', userErr);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = userData.user;
    const userId = user.id;

    // Read body (expect { plan: 'basic'|'plus'|'premium' } or { priceId: 'price_xxx' })
    const body = await req.json().catch(() => ({}));
    const plan = (body?.plan as string | undefined) || null;
    const priceIdFromClient = (body?.priceId as string | undefined) || null;

    // Server-known price ids (server-side trust)
    const PRICE_MAP: Record<string, string> = {
      basic: process.env.STRIPE_PRICE_BASIC_ID || '',
      plus: process.env.STRIPE_PRICE_PLUS_ID || '',
      premium: process.env.STRIPE_PRICE_PREMIUM_ID || '',
    };

    // Build allowlist of valid price IDs
    const ALLOWED_PRICE_IDS = new Set(Object.values(PRICE_MAP).filter(Boolean));

    // Resolve priceId: prefer server mapping, but if client supplied one, validate it against allowlist
    let priceId: string | null = null;
    if (plan) {
      priceId = PRICE_MAP[plan] || null;
    } else if (priceIdFromClient) {
      // Only accept client-supplied priceId if it's in our allowlist
      if (!ALLOWED_PRICE_IDS.has(priceIdFromClient)) {
        return NextResponse.json({ error: 'Invalid price id' }, { status: 400 });
      }
      priceId = priceIdFromClient;
    }

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID or valid plan required' }, { status: 400 });
    }

    // Find or create a Stripe customer for this user. Use upsert to avoid duplicate race conditions
    let customerId: string | null = null;
    const { data: existingCustomer, error: existingCustomerErr } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!existingCustomerErr && existingCustomer?.customer_id) {
      customerId = existingCustomer.customer_id;
    } else {
      // Create a new Stripe Customer and persist mapping to customers table
      const newCustomer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: userId },
      });
      customerId = newCustomer.id;
      const { error: upsertErr } = await supabaseAdmin.from('customers').upsert({
        user_id: userId,
        customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'customer_id' });
      if (upsertErr) {
        console.warn('[create-checkout-session] failed to upsert customers mapping', upsertErr);
        // not fatal for checkout creation
      }
    }

    // Build canonical server-side origin (use server env)
    const origin = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

    // If you want the Checkout Session id included in the redirect, use the literal {CHECKOUT_SESSION_ID}
    const successUrl = `${origin}/account/settings/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/account/settings/subscription?canceled=true`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId || undefined,
      client_reference_id: userId,
      metadata: { user_id: userId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Return the hosted checkout URL to the client
    return NextResponse.json({ url: session.url, id: session.id }, { status: 200 });
  } catch (err: any) {
    console.error('[create-checkout-session] error', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
