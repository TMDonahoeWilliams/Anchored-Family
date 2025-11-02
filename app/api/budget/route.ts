/**
 * app/api/budget/route.ts
 *
 * Family Budget API route with Supabase session verification.
 *
 * - GET  /api/budget?householdId=...        -> list budgets for a household
 * - POST /api/budget                        -> create a budget (JSON body)
 * - PUT  /api/budget                        -> update a budget (JSON body, must include id)
 * - DELETE /api/budget?id=...               -> delete a budget by id
 *
 * Auth:
 * - This version verifies the incoming request using Supabase by checking an access token.
 * - It accepts:
 *    1) Authorization: Bearer <access_token>
 *    2) A session/access token stored in a cookie (common cookie names checked below)
 * - The route uses the Supabase service role key (server-only) to call auth.getUser(token).
 *   Make sure you set these env vars in Vercel (Project → Settings → Environment Variables):
 *     SUPABASE_URL
 *     SUPABASE_SERVICE_ROLE_KEY
 *
 * Notes:
 * - Replace the in-memory store and TODOs with your real DB (Supabase tables, Prisma, etc.).
 * - In production you should tighten authorization so the user can only access budgets for households
 *   they belong to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs'; // ensure Node runtime for server SDKs

// === Configuration ===
// Cookie names to try (adjust to whatever your frontend sets)
const COOKIE_NAMES = ['sb:token', 'sb-access-token', 'supabase-auth-token', 'session'];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[api/budget] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment vars.');
}

// Create a Supabase admin client using the service role key (server-only)
const supabaseAdmin = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

// In-memory fallback store (development only)
type BudgetItem = { id?: string; name: string; amount: number };
type Budget = { id: string; householdId: string; name: string; items: BudgetItem[]; createdAt: string; updatedAt?: string };
const _DEV_STORE: Record<string, Budget> = {};

// Helpers
function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}
function unauthorized() {
  return jsonResponse({ error: 'Unauthorized' }, 401);
}
function badRequest(msg = 'Bad request') {
  return jsonResponse({ error: msg }, 400);
}
function genId(prefix = 'b') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Verify a session/access token via Supabase.
 * - Accepts an access token (JWT) issued by Supabase and returns the user's id or null.
 * - The access token can be provided as:
 *    - Authorization: Bearer <token>
 *    - A cookie whose name is in COOKIE_NAMES (check above)
 */
async function verifySessionToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;

  try {
    // supabase.auth.getUser(token) will validate the token and return user data if valid.
    // Using the service-role client is acceptable for server-side verification of arbitrary tokens.
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.log('[api/budget] supabase.auth.getUser error:', error.message ?? error);
      return null;
    }
    const userId = data?.user?.id ?? null;
    return userId;
  } catch (err) {
    console.error('[api/budget] verifySessionToken unexpected error:', err);
    return null;
  }
}

// Extract token from Authorization header or cookies.
function extractTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Try several cookie names (adjust as needed to match your client)
  for (const name of COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (cookie?.value) {
      // Some clients store JSON in a cookie; if so, you may need to parse it.
      // Here we assume cookie.value is a raw access token; if your app stores a JSON
      // session object, parse accordingly.
      return cookie.value;
    }
  }

  return null;
}

// ===== GET =====
// Query: ?householdId=...
export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    const userId = await verifySessionToken(token);
    console.log('[api/budget] GET request path=', request.nextUrl.pathname, 'cookiePresent=', !!token, 'userId=', userId);

    if (!userId) return unauthorized();

    const householdId = new URL(request.url).searchParams.get('householdId');
    if (!householdId) return badRequest('householdId query parameter is required');

    // TODO: Use Supabase DB to fetch budgets for household and verify membership
    // Example placeholder: fetch from in-memory store
    const budgets = Object.values(_DEV_STORE).filter((b) => b.householdId === householdId);

    return jsonResponse({ budgets });
  } catch (err) {
    console.error('[api/budget] GET error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// ===== POST =====
// Body: { householdId, name, items? }
export async function POST(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    const userId = await verifySessionToken(token);
    console.log('[api/budget] POST cookiePresent=', !!token, 'userId=', userId);

    if (!userId) return unauthorized();

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return badRequest('Content-Type must be application/json');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Missing or invalid JSON body');

    const { householdId, name, items } = body;
    if (!householdId || !name) return badRequest('householdId and name are required');

    // TODO: Replace with actual Supabase insert, and ensure userId is authorized for householdId
    const id = genId('budget');
    const now = new Date().toISOString();
    const budget: Budget = {
      id,
      householdId,
      name,
      items: Array.isArray(items) ? items.map((it: any) => ({ id: genId('it'), name: String(it.name || ''), amount: Number(it.amount || 0) })) : [],
      createdAt: now,
    };

    _DEV_STORE[id] = budget;

    return jsonResponse({ budget }, 201);
  } catch (err) {
    console.error('[api/budget] POST error:', err);
    return jsonResponse({ error: 'Unable to create budget' }, 500);
  }
}

// ===== PUT =====
// Body: { id, name?, items? }
export async function PUT(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    const userId = await verifySessionToken(token);
    console.log('[api/budget] PUT cookiePresent=', !!token, 'userId=', userId);

    if (!userId) return unauthorized();

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return badRequest('Content-Type must be application/json');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Missing or invalid JSON body');

    const { id, name, items } = body;
    if (!id) return badRequest('Budget id is required');

    const existing = _DEV_STORE[id];
    if (!existing) return jsonResponse({ error: 'Budget not found' }, 404);

    // TODO: Verify userId is authorized to update this budget (belongs to household)
    const updated: Budget = {
      ...existing,
      name: typeof name === 'string' ? name : existing.name,
      items: Array.isArray(items) ? items.map((it: any) => ({ id: it.id ?? genId('it'), name: String(it.name || ''), amount: Number(it.amount || 0) })) : existing.items,
      updatedAt: new Date().toISOString(),
    };

    _DEV_STORE[id] = updated;
    return jsonResponse({ budget: updated });
  } catch (err) {
    console.error('[api/budget] PUT error:', err);
    return jsonResponse({ error: 'Unable to update budget' }, 500);
  }
}

// ===== DELETE =====
// Query: ?id=...
export async function DELETE(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);
    const userId = await verifySessionToken(token);
    console.log('[api/budget] DELETE cookiePresent=', !!token, 'userId=', userId);

    if (!userId) return unauthorized();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return badRequest('id query parameter is required');

    const existing = _DEV_STORE[id];
    if (!existing) return jsonResponse({ error: 'Budget not found' }, 404);

    // TODO: Verify userId is authorized to delete this budget
    delete _DEV_STORE[id];
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[api/budget] DELETE error:', err);
    return jsonResponse({ error: 'Unable to delete budget' }, 500);
  }
}
