// app/api/devotion/start-plan/route.ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'; // or use @supabase/supabase-js directly

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId; // ensure you validate/auth this
    const planKey = body.planKey ?? 'one-year-standard';

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // Example using direct Supabase client
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role needed server-side
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('bible_year_selection')
      .insert([{ user_id: userId, plan_key: planKey }])
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, selection: data });
  } catch (err: any) {
    console.error('[start-plan] error', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
