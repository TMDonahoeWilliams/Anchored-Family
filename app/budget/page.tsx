import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import BudgetApp from '@/components/budget/BudgetApp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://kkhlgemlrgqgfybsrpya.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[app/budget/page] SUPABASE_SERVICE_ROLE_KEY not configured');
}

const COOKIE_NAMES = ['sb:token', 'sb-access-token', 'supabase-auth-token', 'supabase-auth', 'sb-session', 'session'];

function mask(s?: string | null) {
  if (!s) return null;
  if (s.length <= 8) return '******';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function extractTokenFromCookieValue(value?: string | null): string | null {
  if (!value) return null;
  // try parse JSON shapes first
  try {
    const parsed = JSON.parse(value);
    if (parsed?.access_token) return String(parsed.access_token);
    if (parsed?.currentSession?.access_token) return String(parsed.currentSession.access_token);
    if (parsed?.session?.access_token) return String(parsed.session.access_token);
    if (Array.isArray(parsed) && typeof parsed[1] === 'string') return parsed[1];
  } catch (e) {}
  // url-encoded JSON
  try {
    if (value.startsWith('%7B') || value.includes('%22access_token%22')) {
      const decoded = decodeURIComponent(value);
      const parsed = JSON.parse(decoded);
      if (parsed?.access_token) return String(parsed.access_token);
    }
  } catch (e) {}
  // jwt-like
  if (value.split('.').length === 3) return value;
  // fallback raw value
  return value || null;
}

/**
 * Note: cookies() may be Promise-typed in some Next.js versions/environments,
 * so await it before using .get() or .getAll().
 */
async function extractTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  // First try common names
  for (const name of COOKIE_NAMES) {
    const c = cookieStore.get(name);
    if (!c) continue;
    const token = extractTokenFromCookieValue(c.value);
    if (token) return token;
  }
  // Fallback: scan all cookies for any value that looks like a JWT or contains access_token
  for (const c of cookieStore.getAll()) {
    const maybe = extractTokenFromCookieValue(c.value);
    if (maybe) return maybe;
  }
  return null;
}

async function verifyTokenGetUser(supabaseAdmin: ReturnType<typeof createClient>, token: string | null): Promise<{ id: string } | null> {
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      console.log('[app/budget/page] supabase getUser error', error.message ?? error);
      return null;
    }
    if (!data?.user) return null;
    return { id: data.user.id };
  } catch (err) {
    console.error('[app/budget/page] verify token error', err);
    return null;
  }
}

async function fetchFirstHouseholdId(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('household_memberships')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[app/budget/page] fetchFirstHouseholdId error', error);
    return null;
  }
  if (!data) return null;
  return (data as any).household_id ?? null;
}

async function fetchBudgetsForHousehold(supabaseAdmin: ReturnType<typeof createClient>, householdId: string) {
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
    console.error('[app/budget/page] fetchBudgetsForHousehold error:', error);
    return [];
  }
  return data ?? [];
}

export default async function Page() {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // extract token and log a masked preview so we can verify server sees it
  const token = await extractTokenFromCookies();
  console.log('[app/budget/page] tokenPresent=', !!token, 'tokenPreview=', mask(token));

  const user = await verifyTokenGetUser(supabaseAdmin, token);

  if (!user) {
    const next = encodeURIComponent('/budget');
    redirect(`/login?next=${next}`);
  }

  const householdId = await fetchFirstHouseholdId(supabaseAdmin, user.id);

  if (!householdId) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Family Budget</h1>
        <p>You don't have a household yet. Create one to start budgeting.</p>
      </div>
    );
  }

  const budgets = await fetchBudgetsForHousehold(supabaseAdmin, householdId);

  return (
    <div style={{ padding: 24 }}>
      <h1>Family Budget</h1>
      <BudgetApp initialBudgets={budgets} householdId={householdId} />
    </div>
  );
}
