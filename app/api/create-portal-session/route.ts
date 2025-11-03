import { NextRequest, NextResponse } from 'next/server';
import { getStripeInstance } from '@/lib/stripeServer';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  try {
    // Get Stripe instance with error checking
    const stripe = getStripeInstance();

    const body = await request.formData();
    const sessionId = body.get('session_id') as string;
    const customerId = body.get('customer_id') as string;

    if (!sessionId && !customerId) {
      return NextResponse.json(
        { error: 'Session ID or Customer ID is required' },
        { status: 400 }
      );
    }

    // Get the origin for return URL
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL!;

    let finalCustomerId = customerId;

    // If we have a session ID, get the customer ID from it
    if (sessionId && !customerId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!checkoutSession.customer) {
        return NextResponse.json(
          { error: 'No customer found for this session' },
          { status: 404 }
        );
      }
      
      finalCustomerId = checkoutSession.customer as string;
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: finalCustomerId,
      return_url: `${origin}/account/settings/subscription`,
    });

    return NextResponse.redirect(portalSession.url, 303);
  } catch (error) {
    console.error('Error creating portal session:', error);
    
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
