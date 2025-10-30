# Production Pantry Setup for Logged-in Users

## The UUID Error Fix

The error `invalid input syntax for type uuid: "demo-household-id"` occurred because UUID fields require proper UUID format. I've updated the code to use a valid UUID: `550e8400-e29b-41d4-a716-446655440000`.

## Current Status

✅ **Fixed Files:**
- `schema.sql` - Updated to use proper UUID format
- `app/table/pantry/page.tsx` - Updated household_id references
- `app/table/pantry/ocr/route.ts` - Updated household_id references
- `quick_pantry_fix.sql` - Updated for proper UUID format

## For Production with Real Users

To make this work with actual logged-in users, you'll want to enhance the system:

### 1. User-Specific Households

```sql
-- Add user relationship to households
ALTER TABLE households ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create household for each user automatically
CREATE OR REPLACE FUNCTION create_user_household()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.households (user_id, name, owner)
  VALUES (NEW.id, 'My Household', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create household when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_household();
```

### 2. Updated Pantry Page for Real Users

```tsx
// In your pantry page, replace the hardcoded household_id with:
const [user, setUser] = useState(null);
const [householdId, setHouseholdId] = useState(null);

useEffect(() => {
  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      // Get user's household
      const { data: household } = await supabase
        .from('households')
        .select('id')
        .eq('user_id', user.id)
        .single();
      setHouseholdId(household?.id);
    }
  };
  getUser();
}, []);

// Then use householdId instead of hardcoded value in addManual()
```

### 3. Proper RLS Policies

```sql
-- Replace demo policies with user-based ones
DROP POLICY IF EXISTS "read_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "write_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "update_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "delete_all_demo" ON pantry_items;

-- User can only access their household's items
CREATE POLICY "user_pantry_access" ON pantry_items
FOR ALL USING (
  household_id IN (
    SELECT id FROM households WHERE user_id = auth.uid()
  )
);
```

## Immediate Fix for Current Error

**Run this in your Supabase SQL Editor:**

```sql
-- Your updated schema.sql should now work without the UUID error
-- Just copy and paste the entire schema.sql file contents
```

The pantry functionality should now work correctly with the proper UUID format. For production, consider implementing the user-specific household system above.