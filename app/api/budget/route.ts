import { NextRequest, NextResponse } from 'next/server';

// Example family budget route (app router)
// - GET: list budgets for household (query ?householdId=...)
// - POST: create a new budget (expects JSON body)
// Adjust auth/db client calls to your stack.

export const runtime = 'nodejs'; // remove if you must run on Edge

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const householdId = url.searchParams.get('householdId');
    if (!householdId) return jsonResponse({ error: 'householdId is required' }, 400);

    // TODO: replace with DB call returning budgets for householdId
    const budgets = [
      { id: 'b1', householdId, name: 'Monthly', total: 1200 },
    ];

    return jsonResponse({ budgets });
  } catch (err) {
    console.error('GET /api/family-budget error', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return jsonResponse({ error: 'Unsupported content type, expected application/json' }, 415);
    }

    const body = await request.json().catch(() => null);
    if (!body) return jsonResponse({ error: 'Missing or invalid JSON body' }, 400);

    // Basic validation
    const { householdId, name, items } = body;
    if (!householdId || !name) return jsonResponse({ error: 'householdId and name required' }, 400);

    // TODO: auth check (server-side session) e.g., verify user belongs to household
    // const user = await getSessionUser(request);
    // if (!user || !user.isMemberOf(householdId)) return jsonResponse({ error: 'Unauthorized' }, 401);

    // TODO: create budget in DB. Example placeholder:
    const newBudget = { id: 'generated-id', householdId, name, items: items ?? [], createdAt: new Date().toISOString() };

    // Return created resource
    return jsonResponse({ budget: newBudget }, 201);
  } catch (err) {
    console.error('POST /api/family-budget error', err);
    return jsonResponse({ error: 'Unable to create budget' }, 500);
  }
}
