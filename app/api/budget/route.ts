/**
 * app/api/budget/route.ts
 *
 * Family Budget API route with Supabase session verification.
 * - GET  /api/budget?householdId=...        -> list budgets for a household
 * - POST /api/budget                        -> create a budget (JSON body)
 * - PUT  /api/budget                        -> update a budget (JSON body, must include id)
 * - DELETE /api/budget?id=...               -> delete a budget by id
 *
 * Auth:
 * - Verifies incoming requests using Supabase by checking an access token.
 * - Accepts:
 *    1) Authorization: Bearer <access_token>
 *    2) A session/access token stored in a cookie (several common cookie names are checked)
 *
 * Requirements (set these in Vercel environment variables):
 *   SUPABASE_URL (or the default below will be used)
 *   SUPABASE_SERVICE_ROLE_KEY  (required — service role key must NOT be exposed to clients)
 *
 * Notes:
 * - The route contains a robust cookie parser for common Supabase cookie shapes (JSON string, plain token).
 * - Replace the DB table names/columns as needed to match your schema.
 * - Do NOT commit your SUPABASE_SERVICE_ROLE_KEY — put it in Vercel env vars and redeploy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs'; // server runtime for Supabase admin client

// If SUPABASE_URL env var is not set, fall back to the URL you provided.
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kkhlgemlrgqgfybsrpya.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[api/budget] Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Set it in Vercel project settings.');
}

// Create Supabase admin client (server-only)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Cookie names the route will check for tokens (adjust if your app uses different names)
const COOKIE_NAMES = ['sb:token', 'sb-access-token', 'supabase-auth-token', 'session'];

// Utilities and types
type BudgetItem = { id?: string; name: string; amount: number };
type Budget = { id: string; household_id: string; name: string; budget_items?: BudgetItem[]; created_at?: string; updated_at?: string };

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}
function unauthorized() {
  return jsonResponse({ error: 'Unauthorized' }, 401);
}
function badRequest(msg = 'Bad request') {
  return jsonResponse({ error: msg }, 400);
}
function serverError(msg = 'Internal server error') {
  return jsonResponse({ error: msg }, 500);
}

// Generate a short id (only used if you need it; DB will usually supply IDs)
function genId(prefix = 'b') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Parse possible Supabase cookie values and try to extract an access token.
 * Supabase clients may store session objects or raw tokens in cookies depending on setup.
 * This function attempts several heuristics:
 *  - If cookie value is JSON: try to read access_token or currentSession.access_token
 *  - If value is a URL-encoded JSON or contains access_token substring: extract via regex
 *  - Otherwise return the raw value as a candidate token
 */
function extractTokenFromCookieValue(value: string | undefined | null): string | null {
  if (!value) return null;

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(value);
    // common shapes:
    // { access_token: '...' }
    if (parsed?.access_token) return String(parsed.access_token);
    // supabase-auth-token sometimes stores an array/object; look for nested fields
    if (parsed?.currentSession?.access_token) return String(parsed.currentSession.access_token);
    if (parsed?.session?.access_token) return String(parsed.session.access_token);
    // Some setups store an array where index 0 is provider, index 1 is token (rare)
    if (Array.isArray(parsed) && typeof parsed[1] === 'string') return parsed[1];
  } catch (e) {
    // not JSON — continue
  }

  // If it's URL-encoded JSON (starts with %7B), try decode + parse
  try {
    if (value.startsWith('%7B') || value.includes('%22access_token%22')) {
      const decoded = decodeURIComponent(value);
      const parsed = JSON.parse(decoded);
      if (parsed?.access_token) return String(parsed.access_token);
    }
  } catch (e) {
    // ignore
  }

  // Try regex to find access_token pattern inside the string
  const m = value.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (m && m[1]) return m[1];

  // Fallback: if the cookie value looks like a JWT (three dot-separated parts), return it
  if (value.split('.').length === 3) return value;

  // Otherwise return the raw value (could be a Bearer token or other token format)
  return value || null;
}

/**
 * Extract a candidate access token from the incoming request.
 * Checks:
 *  - Authorization: Bearer <token>
 *  - Cookies with common names (attempts JSON parsing)
 */
function extractTokenCandidate(request: NextRequest): string | null {
  // Authorization header
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookies
  for (const name of COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (!cookie) continue;
    // cookie.value may contain JSON or a raw token
    const token = extractTokenFromCookieValue(cookie.value);
    if (token) return token;
  }

  return null;
}

/**
 * Validate a candidate token via Supabase admin client.
 * Returns user id string on success, otherwise null.
 */
async function verifySessionToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
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

/**
 * Membership check: verify that userId is a member of householdId.
 * Assumes a table household_memberships with columns: id, household_id, user_id, role.
 */
async function isHouseholdMember(userId: string, householdId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('household_memberships')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('[api/budget] membership check error:', error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('[api/budget] membership unexpected error:', err);
    return false;
  }
}

/**
 * Helper to fetch budgets (with items) for a household.
 * Expects DB tables:
 *  - budgets: id (pk), household_id, name, created_at, updated_at
 *  - budget_items: id (pk), budget_id (fk), name, amount
 */
async function fetchBudgetsForHousehold(householdId: string) {
  const { data, error } = await supabaseAdmin
    .from('budgets')
    .select(`
      id,
      household_id,
      name,
      created_at,
      updated_at,
      budget_items ( id, name, amount )
    `)
    .eq('household_id', householdId);

  if (error) {
    console.error('[api/budget] fetchBudgetsForHousehold error:', error);
    throw new Error('DB error');
  }
  return data as any[];
}

/**
 * GET /api/budget?householdId=...
 * returns budgets for a household (only if caller is a member)
 */
export async function GET(request: NextRequest) {
  try {
    const tokenCandidate = extractTokenCandidate(request);
    const userId = await verifySessionToken(tokenCandidate);
    console.log('[api/budget] GET path=', request.nextUrl.pathname, 'tokenPresent=', !!tokenCandidate, 'userId=', userId);

    if (!userId) return unauthorized();

    const householdId = new URL(request.url).searchParams.get('householdId');
    if (!householdId) return badRequest('householdId query parameter is required');

    const member = await isHouseholdMember(userId, householdId);
    if (!member) return jsonResponse({ error: 'Forbidden: user is not a member of household' }, 403);

    const budgets = await fetchBudgetsForHousehold(householdId);
    return jsonResponse({ budgets });
  } catch (err) {
    console.error('[api/budget] GET error:', err);
    return serverError('Unable to list budgets');
  }
}

/**
 * POST /api/budget
 * Body: { householdId: string, name: string, items?: [{ name, amount }] }
 * Creates a budget and its items. Caller must be household member.
 */
export async function POST(request: NextRequest) {
  try {
    const tokenCandidate = extractTokenCandidate(request);
    const userId = await verifySessionToken(tokenCandidate);
    console.log('[api/budget] POST tokenPresent=', !!tokenCandidate, 'userId=', userId);

    if (!userId) return unauthorized();

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return badRequest('Content-Type must be application/json');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Missing or invalid JSON body');

    const { householdId, name, items } = body;
    if (!householdId || !name) return badRequest('householdId and name are required');

    const member = await isHouseholdMember(userId, householdId);
    if (!member) return jsonResponse({ error: 'Forbidden: user is not a member of household' }, 403);

    // Insert budget
    const insertBudget = await supabaseAdmin
      .from('budgets')
      .insert([{ household_id: householdId, name }])
      .select('id, household_id, name, created_at')
      .single();

    if (insertBudget.error || !insertBudget.data) {
      console.error('[api/budget] insert budget error:', insertBudget.error);
      return serverError('Unable to create budget');
    }

    const budgetCreated = insertBudget.data as any;
    const budgetId = budgetCreated.id as string;

    // Insert items if provided
    let itemsCreated: any[] = [];
    if (Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((it: any) => ({
        budget_id: budgetId,
        name: String(it.name || ''),
        amount: Number(it.amount || 0),
      }));
      const { data: insData, error: insErr } = await supabaseAdmin.from('budget_items').insert(itemsToInsert).select('id, budget_id, name, amount');
      if (insErr) {
        console.error('[api/budget] insert items error:', insErr);
        // Not fatal: continue, but report to client
      } else {
        itemsCreated = insData ?? [];
      }
    }

    const result = { budget: { ...budgetCreated, budget_items: itemsCreated } };
    return jsonResponse(result, 201);
  } catch (err) {
    console.error('[api/budget] POST error:', err);
    return serverError('Unable to create budget');
  }
}

/**
 * PUT /api/budget
 * Body: { id: string, name?: string, items?: [{ id?, name, amount }] }
 * Updates budget and upserts items. Caller must be household member.
 */
export async function PUT(request: NextRequest) {
  try {
    const tokenCandidate = extractTokenCandidate(request);
    const userId = await verifySessionToken(tokenCandidate);
    console.log('[api/budget] PUT tokenPresent=', !!tokenCandidate, 'userId=', userId);

    if (!userId) return unauthorized();

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return badRequest('Content-Type must be application/json');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Missing or invalid JSON body');

    const { id, name, items } = body;
    if (!id) return badRequest('Budget id is required');

    // Fetch budget to verify household and membership
    const { data: budgetRow, error: bErr } = await supabaseAdmin.from('budgets').select('id, household_id').eq('id', id).maybeSingle();
    if (bErr) {
      console.error('[api/budget] fetch budget error:', bErr);
      return serverError('Unable to update budget');
    }
    if (!budgetRow) return jsonResponse({ error: 'Budget not found' }, 404);

    const householdId = budgetRow.household_id as string;
    const member = await isHouseholdMember(userId, householdId);
    if (!member) return jsonResponse({ error: 'Forbidden: user is not a member of household' }, 403);

    // Update budget name if provided
    if (typeof name === 'string') {
      const { error: upErr } = await supabaseAdmin.from('budgets').update({ name }).eq('id', id);
      if (upErr) {
        console.error('[api/budget] update budget error:', upErr);
        return serverError('Unable to update budget');
      }
    }

    // Upsert items: create new items, update existing ones, remove deleted ones if client provided items array
    if (Array.isArray(items)) {
      // Collect incoming item IDs
      const incomingIds = items.filter((it: any) => it.id).map((it: any) => it.id);

      // Delete items that are NOT in incomingIds (client intends them removed)
      try {
        if (incomingIds.length > 0) {
          await supabaseAdmin
            .from('budget_items')
            .delete()
            .eq('budget_id', id)
            .not('id', 'in', `(${incomingIds.map((i: string) => `'${i}'`).join(',')})`);
        } else {
          // If no incoming ids, delete all items for this budget (client removed all)
          await supabaseAdmin.from('budget_items').delete().eq('budget_id', id);
        }
      } catch (delErr) {
        console.log('[api/budget] delete items error (non-fatal):', delErr);
      }

      // Upsert incoming items: for items with id -> update; without -> insert
      const toUpdate = items.filter((it: any) => it.id);
      const toInsert = items.filter((it: any) => !it.id);

      if (toUpdate.length > 0) {
        // perform updates iteratively (could be batched)
        for (const it of toUpdate) {
          const { error: itUpErr } = await supabaseAdmin
            .from('budget_items')
            .update({ name: String(it.name || ''), amount: Number(it.amount || 0) })
            .eq('id', it.id)
            .eq('budget_id', id);
          if (itUpErr) console.log('[api/budget] item update error (non-fatal):', itUpErr);
        }
      }

      if (toInsert.length > 0) {
        const insData = toInsert.map((it: any) => ({ budget_id: id, name: String(it.name || ''), amount: Number(it.amount || 0) }));
        const { data: insRes, error: insErr } = await supabaseAdmin.from('budget_items').insert(insData).select('id, budget_id, name, amount');
        if (insErr) console.log('[api/budget] insert items error (non-fatal):', insErr);
      }
    }

    // Return updated budget with items
    const { data: updatedBudget } = await supabaseAdmin
      .from('budgets')
      .select('id, household_id, name, created_at, updated_at, budget_items ( id, name, amount )')
      .eq('id', id)
      .maybeSingle();

    return jsonResponse({ budget: updatedBudget });
  } catch (err) {
    console.error('[api/budget] PUT error:', err);
    return serverError('Unable to update budget');
  }
}

/**
 * DELETE /api/budget?id=...
 * Deletes budget and its items (caller must be household member).
 */
export async function DELETE(request: NextRequest) {
  try {
    const tokenCandidate = extractTokenCandidate(request);
    const userId = await verifySessionToken(tokenCandidate);
    console.log('[api/budget] DELETE tokenPresent=', !!tokenCandidate, 'userId=', userId);

    if (!userId) return unauthorized();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return badRequest('id query parameter is required');

    // Fetch to verify ownership/household and membership
    const { data: budgetRow, error: bErr } = await supabaseAdmin.from('budgets').select('id, household_id').eq('id', id).maybeSingle();
    if (bErr) {
      console.error('[api/budget] fetch budget error:', bErr);
      return serverError('Unable to delete budget');
    }
    if (!budgetRow) return jsonResponse({ error: 'Budget not found' }, 404);

    const householdId = budgetRow.household_id as string;
    const member = await isHouseholdMember(userId, householdId);
    if (!member) return jsonResponse({ error: 'Forbidden: user is not a member of household' }, 403);

    // Delete budget items then budget
    const { error: delItemsErr } = await supabaseAdmin.from('budget_items').delete().eq('budget_id', id);
    if (delItemsErr) console.error('[api/budget] delete budget_items error (non-fatal):', delItemsErr);

    const { error: delBudgetErr } = await supabaseAdmin.from('budgets').delete().eq('id', id);
    if (delBudgetErr) {
      console.error('[api/budget] delete budget error:', delBudgetErr);
      return serverError('Unable to delete budget');
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[api/budget] DELETE error:', err);
    return serverError('Unable to delete budget');
  }
}
