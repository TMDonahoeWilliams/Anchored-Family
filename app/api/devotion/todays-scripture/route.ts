import { NextResponse } from 'next/server';

// Example GET handler: return today's scripture.
// Replace the sample data with DB fetch / supabase call as needed.
export async function GET() {
  const sample = {
    text: "For God so loved the world, that he gave his only Son...",
    reference: "John 3:16",
    version: "ESV",
    date: new Date().toISOString().slice(0, 10),
    source: "Public sample",
  };

  return NextResponse.json(sample, { status: 200 });
}

// Optionally allow POST if you want to support both (e.g. admin refresh)
export async function POST(req: Request) {
  // If you want POST to also return the scripture, reuse same logic
  return GET();
}
