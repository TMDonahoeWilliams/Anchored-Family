import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'No URL provided' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Fetch the calendar data from URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Anchored Family Calendar Import'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch calendar: ${response.statusText}` },
        { status: response.status }
      );
    }

    const content = await response.text();
    
    // Determine content type and parse accordingly
    const contentType = response.headers.get('content-type') || '';
    let events: any[] = [];

    if (contentType.includes('text/calendar') || url.includes('.ics') || content.includes('BEGIN:VCALENDAR')) {
      // iCal format
      events = parseICalContent(content);
    } else if (contentType.includes('text/csv') || url.includes('.csv')) {
      // CSV format
      events = parseCSVContent(content);
    } else {
      // Try to detect format from content
      if (content.includes('BEGIN:VCALENDAR')) {
        events = parseICalContent(content);
      } else {
        return NextResponse.json(
          { error: 'Unsupported calendar format. Expected iCal (.ics) or CSV format.' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      events,
      message: `Successfully imported ${events.length} events from URL`
    });

  } catch (error) {
    console.error('URL import error:', error);
    return NextResponse.json(
      { error: 'Failed to import calendar from URL' },
      { status: 500 }
    );
  }
}

function parseICalContent(content: string) {
  const events: any[] = [];
  const lines = content.split('\n');
  let currentEvent: any = null;
  
  for (let line of lines) {
    line = line.trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.title && currentEvent.start) {
        events.push({
          title: currentEvent.title,
          start: currentEvent.start,
          end: currentEvent.end || currentEvent.start,
          description: currentEvent.description || '',
          location: currentEvent.location || ''
        });
      }
      currentEvent = null;
    } else if (currentEvent && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':');
      
      switch (key) {
        case 'SUMMARY':
          currentEvent.title = value;
          break;
        case 'DTSTART':
          currentEvent.start = parseICalDate(value);
          break;
        case 'DTEND':
          currentEvent.end = parseICalDate(value);
          break;
        case 'DESCRIPTION':
          currentEvent.description = value.replace(/\\n/g, '\n');
          break;
        case 'LOCATION':
          currentEvent.location = value;
          break;
      }
    }
  }
  
  return events;
}

function parseICalDate(dateString: string): string {
  // Handle different iCal date formats
  if (dateString.includes('T')) {
    // DateTime format: 20231225T143000Z
    const year = dateString.substr(0, 4);
    const month = dateString.substr(4, 2);
    const day = dateString.substr(6, 2);
    const hour = dateString.substr(9, 2);
    const minute = dateString.substr(11, 2);
    const second = dateString.substr(13, 2);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
  } else {
    // Date only format: 20231225
    const year = dateString.substr(0, 4);
    const month = dateString.substr(4, 2);
    const day = dateString.substr(6, 2);
    
    return new Date(`${year}-${month}-${day}`).toISOString();
  }
}

function parseCSVContent(content: string) {
  const events: any[] = [];
  const lines = content.split('\n');
  
  if (lines.length < 2) {
    return events;
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    
    if (values.length < headers.length) continue;
    
    const event: any = {};
    
    headers.forEach((header, index) => {
      const value = values[index]?.trim().replace(/"/g, '');
      
      switch (header) {
        case 'title':
        case 'subject':
        case 'summary':
          event.title = value;
          break;
        case 'start':
        case 'start date':
        case 'start time':
          event.start = new Date(value).toISOString();
          break;
        case 'end':
        case 'end date':
        case 'end time':
          event.end = new Date(value).toISOString();
          break;
        case 'description':
        case 'notes':
          event.description = value;
          break;
        case 'location':
          event.location = value;
          break;
      }
    });
    
    if (event.title && event.start) {
      if (!event.end) {
        event.end = event.start;
      }
      events.push(event);
    }
  }
  
  return events;
}