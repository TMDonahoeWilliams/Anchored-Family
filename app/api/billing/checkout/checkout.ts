import { NextRequest, NextResponse } from 'next/server';

// Respond to preflight requests so CORS preflight doesn't fail.
export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

// Handle POST requests
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    // TODO: replace with your full signup logic
    // Validate body, create household, return JSON
    return NextResponse.json({ household_id: 'example-id' }, { status: 201 });
  } catch (err) {
    console.error('/api/signup POST error', err);
    return NextResponse.json({ error: 'Unable to create household' }, { status: 500 });
  }
}
