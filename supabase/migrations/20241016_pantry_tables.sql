-- Create pantry and grocery tables for Anchored Family app
-- This migration ensures all required tables exist with proper structure

-- Create households table
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pantry_items table
CREATE TABLE IF NOT EXISTS public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC,
    unit TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create grocery_lists table
CREATE TABLE IF NOT EXISTS public.grocery_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Main List',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create grocery_list_items table
CREATE TABLE IF NOT EXISTS public.grocery_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID REFERENCES public.grocery_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    qty NUMERIC,
    unit TEXT,
    is_checked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create people table for household members
CREATE TABLE IF NOT EXISTS public.people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chores table
CREATE TABLE IF NOT EXISTS public.chores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

-- Create chore_assignments table
CREATE TABLE IF NOT EXISTS public.chore_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES public.people(id) ON DELETE CASCADE,
    chore_id UUID REFERENCES public.chores(id) ON DELETE RESTRICT,
    frequency TEXT NOT NULL CHECK (frequency IN ('Daily','Weekly','Monthly','Custom')),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chore_logs table
CREATE TABLE IF NOT EXISTS public.chore_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES public.chore_assignments(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pantry_items_household_id ON public.pantry_items(household_id);
CREATE INDEX IF NOT EXISTS idx_pantry_items_name ON public.pantry_items(name);
CREATE INDEX IF NOT EXISTS idx_grocery_list_items_list_id ON public.grocery_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_people_household_id ON public.people(household_id);
CREATE INDEX IF NOT EXISTS idx_chore_assignments_person_id ON public.chore_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_chore_logs_assignment_id ON public.chore_logs(assignment_id);

-- Enable Row Level Security
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_logs ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for demo/development (tighten for production)
-- Pantry items policies
DROP POLICY IF EXISTS "demo_read_pantry_items" ON public.pantry_items;
CREATE POLICY "demo_read_pantry_items" ON public.pantry_items FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_pantry_items" ON public.pantry_items;
CREATE POLICY "demo_insert_pantry_items" ON public.pantry_items FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "demo_update_pantry_items" ON public.pantry_items;
CREATE POLICY "demo_update_pantry_items" ON public.pantry_items FOR UPDATE USING (TRUE);

DROP POLICY IF EXISTS "demo_delete_pantry_items" ON public.pantry_items;
CREATE POLICY "demo_delete_pantry_items" ON public.pantry_items FOR DELETE USING (TRUE);

-- Grocery list items policies
DROP POLICY IF EXISTS "demo_read_grocery_list_items" ON public.grocery_list_items;
CREATE POLICY "demo_read_grocery_list_items" ON public.grocery_list_items FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_grocery_list_items" ON public.grocery_list_items;
CREATE POLICY "demo_insert_grocery_list_items" ON public.grocery_list_items FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "demo_update_grocery_list_items" ON public.grocery_list_items;
CREATE POLICY "demo_update_grocery_list_items" ON public.grocery_list_items FOR UPDATE USING (TRUE);

DROP POLICY IF EXISTS "demo_delete_grocery_list_items" ON public.grocery_list_items;
CREATE POLICY "demo_delete_grocery_list_items" ON public.grocery_list_items FOR DELETE USING (TRUE);

-- Households policies
DROP POLICY IF EXISTS "demo_read_households" ON public.households;
CREATE POLICY "demo_read_households" ON public.households FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_households" ON public.households;
CREATE POLICY "demo_insert_households" ON public.households FOR INSERT WITH CHECK (TRUE);

-- People policies
DROP POLICY IF EXISTS "demo_read_people" ON public.people;
CREATE POLICY "demo_read_people" ON public.people FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_people" ON public.people;
CREATE POLICY "demo_insert_people" ON public.people FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "demo_update_people" ON public.people;
CREATE POLICY "demo_update_people" ON public.people FOR UPDATE USING (TRUE);

-- Chores policies
DROP POLICY IF EXISTS "demo_read_chores" ON public.chores;
CREATE POLICY "demo_read_chores" ON public.chores FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_chores" ON public.chores;
CREATE POLICY "demo_insert_chores" ON public.chores FOR INSERT WITH CHECK (TRUE);

-- Chore assignments policies
DROP POLICY IF EXISTS "demo_read_chore_assignments" ON public.chore_assignments;
CREATE POLICY "demo_read_chore_assignments" ON public.chore_assignments FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_chore_assignments" ON public.chore_assignments;
CREATE POLICY "demo_insert_chore_assignments" ON public.chore_assignments FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "demo_update_chore_assignments" ON public.chore_assignments;
CREATE POLICY "demo_update_chore_assignments" ON public.chore_assignments FOR UPDATE USING (TRUE);

-- Chore logs policies
DROP POLICY IF EXISTS "demo_read_chore_logs" ON public.chore_logs;
CREATE POLICY "demo_read_chore_logs" ON public.chore_logs FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "demo_insert_chore_logs" ON public.chore_logs;
CREATE POLICY "demo_insert_chore_logs" ON public.chore_logs FOR INSERT WITH CHECK (TRUE);

-- Create a demo household if it doesn't exist
INSERT INTO public.households (id, name, owner)
VALUES ('demo-household-id', 'Demo Household', NULL)
ON CONFLICT (id) DO NOTHING;

-- Create a default grocery list
INSERT INTO public.grocery_lists (household_id, title, is_active)
VALUES ('demo-household-id', 'Main Grocery List', TRUE)
ON CONFLICT DO NOTHING;

-- Seed default chores
INSERT INTO public.chores (name)
VALUES 
    ('Wash dishes'),
    ('Load dishwasher'),
    ('Unload dishwasher'),
    ('Laundry'),
    ('Clean bathroom'),
    ('Sweep floor'),
    ('Take out trash'),
    ('Vacuum'),
    ('Dust furniture'),
    ('Clean kitchen')
ON CONFLICT (name) DO NOTHING;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_pantry_items_updated_at ON public.pantry_items;
CREATE TRIGGER update_pantry_items_updated_at
    BEFORE UPDATE ON public.pantry_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add some sample pantry items for testing
INSERT INTO public.pantry_items (household_id, name, quantity, unit)
VALUES 
    ('demo-household-id', 'Rice', 2, 'lbs'),
    ('demo-household-id', 'Chicken Breast', 1.5, 'lbs'),
    ('demo-household-id', 'Olive Oil', 1, 'bottle'),
    ('demo-household-id', 'Onions', 3, 'pieces'),
    ('demo-household-id', 'Garlic', 1, 'bulb')
ON CONFLICT DO NOTHING;