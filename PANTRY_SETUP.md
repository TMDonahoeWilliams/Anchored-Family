# Pantry Database Setup

The pantry functionality requires several database tables to be created in your Supabase database. 

## Quick Fix for "Could not find table 'public.pantry_items'" Error

### Option 1: Run Migration in Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase/migrations/20241016_pantry_tables.sql`
4. Click "Run" to execute the migration

### Option 2: Use Supabase CLI (if installed)
```bash
# Navigate to your project directory
cd "C:\Users\Tonya\OneDrive\Documents\Anchored Family"

# Run the migration
supabase db push
```

### Option 3: Manual Table Creation
If you prefer to create just the essential table manually:

```sql
-- Create pantry_items table
CREATE TABLE IF NOT EXISTS public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID,
    name TEXT NOT NULL,
    quantity NUMERIC,
    unit TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for demo
CREATE POLICY "demo_pantry_access" ON public.pantry_items 
FOR ALL USING (TRUE) WITH CHECK (TRUE);
```

## What the Migration Creates

### Core Tables
- `households` - Manages family/household groups
- `pantry_items` - Stores pantry inventory items
- `grocery_lists` - Manages grocery shopping lists
- `grocery_list_items` - Individual items on grocery lists
- `people` - Household members
- `chores` - Available chore types
- `chore_assignments` - Assigned chores to people
- `chore_logs` - Completed chore tracking

### Features
- Row Level Security enabled on all tables
- Proper foreign key relationships
- Indexes for performance
- Auto-updating timestamps
- Demo data for testing
- Permissive policies for development

### Sample Data Included
- Demo household
- Default grocery list
- Common chores (wash dishes, laundry, etc.)
- Sample pantry items (rice, chicken, etc.)

## After Running Migration

Your pantry page should work immediately:
- Add items manually ✅
- View existing items ✅
- Update quantities ✅
- Delete items ✅
- Photo OCR functionality ✅

The demo household ID is `'demo-household-id'` which matches what the pantry page expects.

## Production Notes

The current policies are very permissive for development. For production, you should:
1. Replace demo policies with proper user-based authentication
2. Link households to actual user accounts
3. Implement proper household membership checks
4. Add data validation and constraints