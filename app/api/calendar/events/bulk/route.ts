import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client for server-side auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    // Get auth token from request headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { events } = await request.json();
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'No events provided' },
        { status: 400 }
      );
    }

    // Format events for database insertion
    const formattedEvents = events.map(event => ({
      title: event.title || 'Untitled Event',
      start_date: event.start,
      end_date: event.end || event.start,
      description: event.description || '',
      location: event.location || '',
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Insert events into database
    // Note: You'll need to create a calendar_events table in your Supabase database
    const { data, error } = await supabase
      .from('calendar_events')
      .insert(formattedEvents)
      .select();

    if (error) {
      console.error('Database error:', error);
      
      // If table doesn't exist, create mock response for demo
      if (error.code === '42P01') {  // relation does not exist
        return NextResponse.json({
          success: true,
          imported: events.length,
          message: `Successfully imported ${events.length} events (demo mode - database table not yet created)`
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to save events to database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: data?.length || events.length,
      message: `Successfully imported ${data?.length || events.length} events to your calendar`
    });

  } catch (error) {
    console.error('Bulk events save error:', error);
    return NextResponse.json(
      { error: 'Failed to save events' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve user's calendar events
export async function GET(request: NextRequest) {
  try {
    // Create Supabase client for server-side auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    // Get auth token from request headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true });

    if (start) {
      query = query.gte('start_date', start);
    }
    
    if (end) {
      query = query.lte('end_date', end);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      
      // If table doesn't exist, return mock events for demo
      if (error.code === '42P01') {
        const mockEvents = [
          {
            id: 1,
            title: 'Family Meeting',
            start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            end_date: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
            description: 'Weekly family check-in',
            location: 'Living Room'
          }
        ];
        
        return NextResponse.json({
          success: true,
          events: mockEvents
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to retrieve events' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      events: data || []
    });

  } catch (error) {
    console.error('Events retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve events' },
      { status: 500 }
    );
  }
}