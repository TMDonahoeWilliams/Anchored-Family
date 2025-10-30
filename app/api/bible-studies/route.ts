import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract query parameters
    const book = searchParams.get('book') || '';
    const audience = searchParams.get('audience') || '';
    const availability = searchParams.get('availability') || '';
    const length = searchParams.get('length') || '';
    const q = searchParams.get('q') || '';
    const popular = searchParams.get('popular') === 'true';

    // Build query
    let query = supabase
      .from('bible_studies')
      .select('*');

    // Apply filters
    if (book) {
      query = query.ilike('book', book);
    }
    
    if (audience) {
      query = query.eq('audience', audience);
    }
    
    if (availability) {
      query = query.eq('availability', availability);
    }
    
    if (length) {
      switch (length) {
        case '<=7':
          query = query.lte('plan_days', 7);
          break;
        case '<=14':
          query = query.lte('plan_days', 14);
          break;
        case '<=30':
          query = query.lte('plan_days', 30);
          break;
        case '>30':
          query = query.gt('plan_days', 30);
          break;
      }
    }
    
    if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    // Order by popularity if requested, otherwise by title
    if (popular) {
      query = query.order('popularity', { ascending: false }).limit(4);
    } else {
      query = query.order('title', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Bible studies query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch Bible studies' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      studies: data || [],
      total: data?.length || 0
    });

  } catch (error) {
    console.error('Bible studies API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST endpoint to create new Bible study (for admin use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      title, 
      plan_days, 
      book, 
      audience, 
      availability, 
      emoji, 
      description, 
      popularity = 0,
      content 
    } = body;

    if (!title || !plan_days || !audience || !availability) {
      return NextResponse.json(
        { error: 'Missing required fields: title, plan_days, audience, availability' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('bible_studies')
      .insert({
        title,
        plan_days: parseInt(plan_days),
        book: book || null,
        audience,
        availability,
        emoji: emoji || null,
        description: description || null,
        popularity: parseInt(popularity) || 0,
        content: content || null
      })
      .select()
      .single();

    if (error) {
      console.error('Bible study creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create Bible study' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      study: data,
      message: 'Bible study created successfully'
    });

  } catch (error) {
    console.error('Bible study creation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}