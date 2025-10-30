-- Enable Row Level Security for household_members table
alter table household_members enable row level security;

-- Policy to allow users to read household members from households they own
create policy "read own household members"
on household_members
for select
using (
  exists (
    select 1
    from households h
    where h.id = household_members.household_id
      and h.owner_id = auth.uid()  -- Only household owners can read members
  )
);

-- Optional: Add additional policies for insert, update, delete
-- create policy "insert own household members"
-- on household_members
-- for insert
-- with check (
--   exists (
--     select 1
--     from households h
--     where h.id = household_members.household_id
--       and h.owner_id = auth.uid()
--   )
-- );