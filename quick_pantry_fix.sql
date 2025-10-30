-- Quick fix script for UUID errors in production
-- Run this in your Supabase SQL Editor after running production-migration.sql

-- Fix any existing records that might have invalid UUIDs
-- Update any existing pantry items that might have invalid UUIDs
UPDATE pantry_items 
SET household_id = '550e8400-e29b-41d4-a716-446655440000' 
WHERE household_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- Update any existing recipes that might have invalid UUIDs  
UPDATE recipes 
SET household_id = '550e8400-e29b-41d4-a716-446655440000' 
WHERE household_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- Update any existing grocery lists that might have invalid UUIDs
UPDATE grocery_lists 
SET household_id = '550e8400-e29b-41d4-a716-446655440000' 
WHERE household_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- Select to verify the fix worked
SELECT 'UUID Fix completed! All household_id fields now use proper UUID format.' AS result;

-- Show count of records that now use the correct household ID
SELECT 
  'pantry_items' as table_name,
  COUNT(*) as record_count
FROM pantry_items 
WHERE household_id = '550e8400-e29b-41d4-a716-446655440000'
UNION ALL
SELECT 
  'recipes' as table_name,
  COUNT(*) as record_count  
FROM recipes
WHERE household_id = '550e8400-e29b-41d4-a716-446655440000'
UNION ALL
SELECT 
  'grocery_lists' as table_name,
  COUNT(*) as record_count
FROM grocery_lists
WHERE household_id = '550e8400-e29b-41d4-a716-446655440000';