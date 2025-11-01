import { NextRequest, NextResponse } from 'next/server';

function corsHeaders(origin?: string) {
  const allowedOrigin = origin || process.env.NEXT_PUBLIC_SITE_URL || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin') || undefined),
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint not available. Use POST /api/billing/checkout to create a Stripe Checkout session.' },
    { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) }
  );
}

export async function POST(request: NextRequest) {
  // Keep the top-level /api/billing route intentionally simple.
  // Direct clients to the checkout route.
  return NextResponse.json(
    { error: 'Method not allowed on this endpoint. Use POST /api/billing/checkout' },
    { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) }
  );
}

export async function PUT(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) }
  );
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: corsHeaders(request.headers.get('origin') || undefined) }
  );
}
