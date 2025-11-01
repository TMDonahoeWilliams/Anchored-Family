import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // TODO: Add Stripe logic here
  // For now, return a dummy URL for testing
// ...inside your POST handler, after creating `session`:
console.log('Stripe session returned:', session); // logs entire session object to server logs

if (!session || !session.url) {
  console.error('Stripe session missing url:', session);
  return NextResponse.json({ error: 'Failed to create checkout URL' }, { status: 500 });
}

// Return the Stripe-hosted checkout URL
return NextResponse.json({ url: session.url }, { status: 200 });
