import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    // Get Stripe instance with error checking
    const stripe = getStripeInstance();

    const body = await request.formData();
    const priceId = body.get('price_id') as string;
    const lookupKey = body.get('lookup_key') as string;

    if (!priceId && !lookupKey) {
      return NextResponse.json(
        { error: 'Price ID or lookup key is required' },
        { status: 400 }
      );
    }

    // Check if price ID is properly configured
    if (priceId && priceId.includes('not_configured')) {
      return NextResponse.json(
        { error: 'Stripe prices are not configured. Please set up your products in Stripe Dashboard and update STRIPE_PRICE_ID_* environment variables.' },
        { status: 500 }
      );
    }

    // Get the origin for redirect URLs
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL!;

    // If using lookup key, retrieve price
    let finalPriceId = priceId;
    if (lookupKey && !priceId) {
      const prices = await stripe.prices.list({
        lookup_keys: [lookupKey],
        expand: ['data.product'],
      });
      
      if (prices.data.length === 0) {
        return NextResponse.json(
          { error: 'Price not found for lookup key' },
          { status: 404 }
        );
      }
      
      finalPriceId = prices.data[0].id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'hosted',
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/account/settings/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/account/settings/subscription?canceled=true`,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_creation: 'always',
      metadata: {
        source: 'anchored_family_app',
      },
      subscription_data: {
        metadata: {
          source: 'anchored_family_app',
        },
      },
    });

    return NextResponse.redirect(session.url!, 303);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}