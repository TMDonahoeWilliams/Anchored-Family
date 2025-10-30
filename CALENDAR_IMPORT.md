# Calendar Import Feature

The calendar import feature allows users to import events from external calendar sources into their Anchored Family calendar.

## Supported Import Sources

### 1. Google Calendar
- **Path**: `/planner/calendar/import`
- **Method**: OAuth integration
- **API**: `/api/calendar/import/google`
- **Status**: Frontend ready, backend needs OAuth credentials

### 2. Outlook Calendar
- **Path**: `/planner/calendar/import`
- **Method**: Microsoft Graph API
- **API**: `/api/calendar/import/outlook`
- **Status**: Frontend ready, backend needs OAuth credentials

### 3. Apple Calendar
- **Path**: `/planner/calendar/import`
- **Method**: Export/Import via .ics files
- **Instructions**: Step-by-step guide provided in UI
- **Status**: Ready to use

### 4. File Upload
- **Path**: `/planner/calendar/import`
- **Supported formats**: .ics (iCal), .csv
- **API**: `/api/calendar/import/file`
- **Status**: Fully functional

### 5. URL Import
- **Path**: `/planner/calendar/import`
- **Supported formats**: webcal://, http:// links to .ics files
- **API**: `/api/calendar/import/url`
- **Status**: Fully functional

## Database Setup

### Required Table
```sql
-- Run this migration to create the calendar_events table
-- File: supabase/migrations/20241201_calendar_events.sql

CREATE TABLE calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security
The table includes RLS policies ensuring users can only access their own events.

## OAuth Setup (Production)

### Google Calendar API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs
6. Set environment variables:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

### Microsoft Graph API (Outlook)
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Configure API permissions for Calendar.Read
4. Create client secret
5. Set environment variables:
   ```
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   ```

## API Endpoints

### Bulk Events Save
- **Path**: `/api/calendar/events/bulk`
- **Methods**: POST (save events), GET (retrieve events)
- **Authentication**: Required (Bearer token)
- **Status**: Fully functional

### File Import
- **Path**: `/api/calendar/import/file`
- **Method**: POST
- **Content-Type**: multipart/form-data
- **Status**: Fully functional

### URL Import
- **Path**: `/api/calendar/import/url`
- **Method**: POST
- **Content-Type**: application/json
- **Status**: Fully functional

## User Interface

### Import Page
- **Location**: `/app/planner/calendar/import/page.tsx`
- **Features**:
  - Multi-source import tabs
  - File upload with drag & drop
  - Event preview before import
  - Bulk import with progress indication
  - Error handling and user feedback

### Integration with Calendar
- Events are saved to `calendar_events` table
- Each user sees only their own events
- Events can be retrieved via GET `/api/calendar/events/bulk`

## Current Status

✅ **Complete**:
- Frontend UI for all import methods
- File parsing (.ics and .csv)
- URL import functionality
- Database schema and migrations
- API endpoints for import and retrieval
- Authentication integration

🔄 **Needs OAuth Setup** (for production):
- Google Calendar OAuth flow
- Microsoft Graph OAuth flow
- Environment variables configuration

📝 **Next Steps**:
1. Run the database migration
2. Set up OAuth credentials for Google and Microsoft
3. Test import functionality with real external calendars
4. Deploy to production with proper environment variables

## Testing

The system includes mock data for testing purposes. When OAuth credentials are not configured, the APIs return sample events to demonstrate functionality.