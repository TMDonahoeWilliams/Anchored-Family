import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Environment
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kkhlgemlrgqgfybsrpya.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[api/budget] Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Set it in Vercel project settings.');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Cookie names to inspect for token (adjust to match your client)
const COOKIE_NAMES = ['sb:token', 'sb-access-token', 'supabase-auth-token', 'session'];

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
function serverError(msg = 'Internal server error') {
  return jsonResponse({ error: msg }, 500);
}
function genId(prefix = 'b') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Try to pull an access token out of cookie value or header.
 * If cookie has JSON or encoded JSON, attempt to parse out access_token.
 */
function extractTokenFromCookieValue(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.access_token) return String(parsed.access_token);
    if (parsed?.currentSession?.access_token) return String(parsed.currentSession.access_token);
    if (parsed?.session?.access_token) return String(parsed.session.access_token);
    if (Array.isArray(parsed) && typeof parsed[1] === 'string') return parsed[1];
  } catch (e) {
    // not JSON
  }
  try {
    if (value.startsWith('%7B') || value.includes('%22access_token%22')) {
      const decoded = decodeURIComponent(value);
      const parsed = JSON.parse(decoded);
      if (parsed?.access_token) return String(parsed.access_token);
    }
  } catch (e) {
    // ignore
  }
  const m = value.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (m && m[1]) return m[1];
  if (value.split('.').length === 3) return value; // looks like JWT
  return value;
}

function extractTokenCandidate(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  for (const name of COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (!cookie) continue;
    const token = extractTokenFromCookieValue(cookie.value);
    if (token) return token;
  }
  return null;
}

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
      .select('id, role')
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
 *
 * Uses Supabase relation fetch: select('*, budget_items(*)')

