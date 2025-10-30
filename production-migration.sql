-- Production Database Migration for Anchored Family
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard

-- Create households table
CREATE TABLE IF NOT EXISTS households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now()
);

-- Create pantry_items table (THIS IS THE MISSING TABLE CAUSING YOUR ERROR)
CREATE TABLE IF NOT EXISTS pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  updated_at timestamptz DEFAULT now()
);

-- Create grocery_lists table
CREATE TABLE IF NOT EXISTS grocery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  title text DEFAULT 'Main List',
  is_active boolean DEFAULT true
);

-- Create grocery_list_items table
CREATE TABLE IF NOT EXISTS grocery_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid,
  name text NOT NULL,
  qty numeric,
  unit text,
  is_checked boolean DEFAULT false
);

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  ingredients text[],
  instructions text,
  cover_url text,
  source text CHECK (source IN ('manual', 'ocr', 'spoonacular')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bible_studies table
CREATE TABLE IF NOT EXISTS bible_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  plan_days integer NOT NULL,
  book text,
  audience text CHECK (audience IN ('family', 'child', 'teen', 'adult')),
  availability text CHECK (availability IN ('in-app', 'purchase')),
  emoji text,
  description text,
  popularity integer DEFAULT 0,
  content text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create demo household (with the exact UUID your app expects)
INSERT INTO households (id, name) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Demo Household') 
ON CONFLICT (id) DO NOTHING;

-- Create default grocery list
INSERT INTO grocery_lists (household_id, title) 
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Main List') 
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bible_studies ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for demo (IMPORTANT: These allow all operations)
-- Pantry items policies
DROP POLICY IF EXISTS "read_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "write_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "update_all_demo" ON pantry_items;
DROP POLICY IF EXISTS "delete_all_demo" ON pantry_items;

CREATE POLICY "read_all_demo" ON pantry_items FOR SELECT USING (true);
CREATE POLICY "write_all_demo" ON pantry_items FOR INSERT WITH CHECK (true);
CREATE POLICY "update_all_demo" ON pantry_items FOR UPDATE USING (true);
CREATE POLICY "delete_all_demo" ON pantry_items FOR DELETE USING (true);

-- Grocery list items policies
DROP POLICY IF EXISTS "read_all_demo_gl" ON grocery_list_items;
DROP POLICY IF EXISTS "write_all_demo_gl" ON grocery_list_items;
DROP POLICY IF EXISTS "update_all_demo_gl" ON grocery_list_items;
DROP POLICY IF EXISTS "delete_all_demo_gl" ON grocery_list_items;

CREATE POLICY "read_all_demo_gl" ON grocery_list_items FOR SELECT USING (true);
CREATE POLICY "write_all_demo_gl" ON grocery_list_items FOR INSERT WITH CHECK (true);
CREATE POLICY "update_all_demo_gl" ON grocery_list_items FOR UPDATE USING (true);
CREATE POLICY "delete_all_demo_gl" ON grocery_list_items FOR DELETE USING (true);

-- Recipes policies
DROP POLICY IF EXISTS "read_all_demo_recipes" ON recipes;
DROP POLICY IF EXISTS "write_all_demo_recipes" ON recipes;
DROP POLICY IF EXISTS "update_all_demo_recipes" ON recipes;
DROP POLICY IF EXISTS "delete_all_demo_recipes" ON recipes;

CREATE POLICY "read_all_demo_recipes" ON recipes FOR SELECT USING (true);
CREATE POLICY "write_all_demo_recipes" ON recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "update_all_demo_recipes" ON recipes FOR UPDATE USING (true);
CREATE POLICY "delete_all_demo_recipes" ON recipes FOR DELETE USING (true);

-- Bible studies policies
DROP POLICY IF EXISTS "read_all_demo_bible_studies" ON bible_studies;
DROP POLICY IF EXISTS "write_all_demo_bible_studies" ON bible_studies;
DROP POLICY IF EXISTS "update_all_demo_bible_studies" ON bible_studies;
DROP POLICY IF EXISTS "delete_all_demo_bible_studies" ON bible_studies;

CREATE POLICY "read_all_demo_bible_studies" ON bible_studies FOR SELECT USING (true);
CREATE POLICY "write_all_demo_bible_studies" ON bible_studies FOR INSERT WITH CHECK (true);
CREATE POLICY "update_all_demo_bible_studies" ON bible_studies FOR UPDATE USING (true);
CREATE POLICY "delete_all_demo_bible_studies" ON bible_studies FOR DELETE USING (true);

-- Seed Bible studies data
INSERT INTO bible_studies (title, plan_days, book, audience, availability, emoji, description, popularity)
VALUES 
  ('Gospel of John (30 days)', 30, 'John', 'family', 'in-app', '📖', 'A 30-day journey through John.', 98),
  ('Proverbs (31 days)', 31, 'Proverbs', 'family', 'in-app', '🧠', 'Daily wisdom practice.', 90),
  ('Romans for Teens (16 days)', 16, 'Romans', 'teen', 'purchase', '✉️', 'Paul''s letter explained.', 84),
  ('James: Faith in Action (5)', 5, 'James', 'adult', 'in-app', '🔧', 'Practical faith lessons.', 76),
  ('Psalms of Praise (14)', 14, 'Psalms', 'child', 'in-app', '🎵', 'Songs and prayers for kids.', 70),
  ('Acts (28 days)', 28, 'Acts', 'family', 'purchase', '🔥', 'The early church story.', 72),
  ('Genesis: In the Beginning (21 days)', 21, 'Genesis', 'family', 'in-app', '🌟', 'Creation and early stories.', 85),
  ('Matthew for Kids (14 days)', 14, 'Matthew', 'child', 'in-app', '👶', 'Jesus'' life for children.', 78),
  ('Ephesians: Our Identity (12 days)', 12, 'Ephesians', 'teen', 'in-app', '🆔', 'Who we are in Christ.', 82),
  ('1 Peter: Living Hope (8 days)', 8, '1 Peter', 'adult', 'in-app', '🛡️', 'Hope in difficult times.', 74)
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'Database migration completed successfully! All tables created and pantry_items table is now available.' AS result;