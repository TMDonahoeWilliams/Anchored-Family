-- =========================================================
-- Production schema & RLS for Anchored Family (Households)
-- =========================================================

-- Prereqs
create extension if not exists pgcrypto;

-- -------------------------------------
-- 1) Utility functions for RLS checks
-- -------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_manager(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.role = 'household_manager'
  );
$$;

-- -------------------------------------
-- 2) Profiles (1:1 with auth.users)
-- -------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state char(2) check (state ~ '^[A-Z]{2}$'),
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;

-- A user can read their own profile; managers can read members of their households via a view (below).
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists profiles_self_upsert on public.profiles;
create policy profiles_self_upsert
on public.profiles
for insert with check (auth.uid() = user_id)
, for update using (auth.uid() = user_id);

-- Auto-create profile on user signup (email is in raw_user_meta_data if you pass it)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_email text;
  v_name  text;
begin
  v_email := coalesce(new.email, (new.raw_user_meta_data->>'email'));
  v_name  := coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(v_email,''),'@',1));
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(v_name, 'New User'), coalesce(v_email, 'unknown@example.com'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- -------------------------------------
-- 3) Households (secure)
-- -------------------------------------
-- Ensure FK owner -> auth.users
alter table public.households
  drop constraint if exists households_owner_fk,
  add constraint households_owner_fk
  foreign key (owner) references auth.users(id) on delete set null;

-- Auto-add owner as manager when creating a household
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer
as $$
begin
  -- If creator matches auth.uid(), add as manager
  if new.owner = auth.uid() then
    insert into public.household_members (household_id, user_id, role)
    values (new.id, new.owner, 'household_manager')
    on conflict (household_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_household_creator_manager on public.households;
create trigger trg_household_creator_manager
after insert on public.households
for each row execute procedure public.handle_new_household();

alter table public.households enable row level security;

-- Policies: members can read; only managers can update/delete; anyone can create their own household
drop policy if exists households_select on public.households;
create policy households_select
on public.households
for select
using (public.is_household_member(id) or owner = auth.uid());

drop policy if exists households_insert on public.households;
create policy households_insert
on public.households
for insert
with check (owner = auth.uid());

drop policy if exists households_update on public.households;
create policy households_update
on public.households
for update
using (public.is_household_manager(id) or owner = auth.uid());

drop policy if exists households_delete on public.households;
create policy households_delete
on public.households
for delete
using (public.is_household_manager(id) or owner = auth.uid());

-- -------------------------------------
-- 4) Household members (user ↔ household)
-- -------------------------------------
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('household_manager','household_member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

alter table public.household_members enable row level security;

-- Policies: members can see other members in same household; managers can add/update/remove in their household; users can add themselves if they are the owner or invited (enforce invitations at app layer if needed).
drop policy if exists hh_members_select on public.household_members;
create policy hh_members_select
on public.household_members
for select
using (
  exists (
    select 1
    from public.household_members me
    where me.household_id = household_members.household_id
      and me.user_id = auth.uid()
  )
);

drop policy if exists hh_members_insert on public.household_members;
create policy hh_members_insert
on public.household_members
for insert
with check (
  -- manager of the target household
  public.is_household_manager(household_id)
  -- or self-join allowed if the user is the owner creating first membership (owner inserts self)
  or (auth.uid() = user_id and exists (select 1 from public.households h where h.id = household_id and h.owner = auth.uid()))
);

drop policy if exists hh_members_update on public.household_members;
create policy hh_members_update
on public.household_members
for update
using (public.is_household_manager(household_id));

drop policy if exists hh_members_delete on public.household_members;
create policy hh_members_delete
on public.household_members
for delete
using (public.is_household_manager(household_id));

-- Convenience view for UI/API
create or replace view public.household_member_profiles as
select
  hm.id as membership_id,
  hm.household_id,
  hm.user_id,
  hm.role,
  p.full_name,
  p.email,
  p.phone,
  p.address_line1,
  p.address_line2,
  p.city,
  p.state,
  p.postal_code,
  hm.created_at as joined_at
from public.household_members hm
join public.profiles p on p.user_id = hm.user_id;

-- -------------------------------------
-- 5) Secure existing domain tables with membership-aware RLS
-- -------------------------------------

-- Pantry items
alter table public.pantry_items enable row level security;

drop policy if exists pantry_select on public.pantry_items;
create policy pantry_select
on public.pantry_items
for select
using (public.is_household_member(household_id));

drop policy if exists pantry_mutate on public.pantry_items;
create policy pantry_mutate
on public.pantry_items
for insert with check (public.is_household_member(household_id))
, for update using (public.is_household_member(household_id))
, for delete using (public.is_household_member(household_id));

-- Grocery lists
alter table public.grocery_lists enable row level security;

drop policy if exists gl_select on public.grocery_lists;
create policy gl_select
on public.grocery_lists
for select
using (public.is_household_member(household_id));

drop policy if exists gl_mutate on public.grocery_lists;
create policy gl_mutate
on public.grocery_lists
for insert with check (public.is_household_member(household_id))
, for update using (public.is_household_member(household_id))
, for delete using (public.is_household_member(household_id));

-- Grocery list items (join to list -> household)
alter table public.grocery_list_items enable row level security;

drop policy if exists gli_select on public.grocery_list_items;
create policy gli_select
on public.grocery_list_items
for select
using (
  exists (
    select 1
    from public.grocery_lists gl
    where gl.id = grocery_list_items.list_id
      and public.is_household_member(gl.household_id)
  )
);

drop policy if exists gli_mutate on public.grocery_list_items;
create policy gli_mutate
on public.grocery_list_items
for insert with check (
  exists (
    select 1
    from public.grocery_lists gl
    where gl.id = grocery_list_items.list_id
      and public.is_household_member(gl.household_id)
  )
)
, for update using (
  exists (
    select 1
    from public.grocery_lists gl
    where gl.id = grocery_list_items.list_id
      and public.is_household_member(gl.household_id)
  )
)
, for delete using (
  exists (
    select 1
    from public.grocery_lists gl
    where gl.id = grocery_list_items.list_id
      and public.is_household_member(gl.household_id)
  )
);

-- Recipes (household-scoped)
alter table public.recipes enable row level security;

drop policy if exists recipes_select on public.recipes;
create policy recipes_select
on public.recipes
for select
using (public.is_household_member(household_id));

drop policy if exists recipes_mutate on public.recipes;
create policy recipes_mutate
on public.recipes
for insert with check (public.is_household_member(household_id))
, for update using (public.is_household_member(household_id))
, for delete using (public.is_household_member(household_id));

-- Bible studies (global catalog)
alter table public.bible_studies enable row level security;

-- Readable by everyone (including anon) if you want public catalog:
drop policy if exists bible_studies_read on public.bible_studies;
create policy bible_studies_read
on public.bible_studies
for select
using (true);

-- Writes restricted to service role only (no client key)
drop policy if exists bible_studies_write on public.bible_studies;
create policy bible_studies_write
on public.bible_studies
for insert with check (auth.role() = 'service_role')
, for update using (auth.role() = 'service_role')
, for delete using (auth.role() = 'service_role');

-- Chores (catalog is global, but mutate with service role or admin UI)
alter table public.chores enable row level security;

drop policy if exists chores_read on public.chores;
create policy chores_read
on public.chores
for select using (true);

drop policy if exists chores_write on public.chores;
create policy chores_write
on public.chores
for insert with check (auth.role() = 'service_role')
, for update using (auth.role() = 'service_role')
, for delete using (auth.role() = 'service_role');

-- Chore assignments -> must belong to same household as user
-- Ensure member_id exists and references household_members
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='chore_assignments' and column_name='member_id'
  ) then
    alter table public.chore_assignments add column member_id uuid;
    alter table public.chore_assignments
      add constraint chore_assignments_member_fk
      foreign key (member_id) references public.household_members(id)
      on delete cascade;
    -- make required for new rows
    alter table public.chore_assignments alter column member_id set not null;
  end if;
end$$;

alter table public.chore_assignments enable row level security;

drop policy if exists chores_assign_select on public.chore_assignments;
create policy chores_assign_select
on public.chore_assignments
for select
using (
  exists (
    select 1
    from public.household_members me
    join public.household_members tgt on tgt.id = chore_assignments.member_id
    where me.user_id = auth.uid()
      and me.household_id = tgt.household_id
  )
);

-- Managers of the assignment's household can mutate; also allow the assigned member to update their own assignment (e.g., notes/active)
drop policy if exists chores_assign_mutate on public.chore_assignments;
create policy chores_assign_mutate
on public.chore_assignments
for insert with check (
  public.is_household_manager( (select hm.household_id from public.household_members hm where hm.id = chore_assignments.member_id) )
)
, for update using (
  public.is_household_manager( (select hm.household_id from public.household_members hm where hm.id = chore_assignments.member_id) )
  or exists (
    select 1 from public.household_members hm
    where hm.id = chore_assignments.member_id
      and hm.user_id = auth.uid()
  )
)
, for delete using (
  public.is_household_manager( (select hm.household_id from public.household_members hm where hm.id = chore_assignments.member_id) )
);

-- Chore logs -> household membership of the assignment
alter table public.chore_logs enable row level security;

drop policy if exists chore_logs_read on public.chore_logs;
create policy chore_logs_read
on public.chore_logs
for select
using (
  exists (
    select 1
    from public.chore_assignments ca
    join public.household_members tgt on tgt.id = ca.member_id
    join public.household_members me  on me.household_id = tgt.household_id
    where ca.id = chore_logs.assignment_id
      and me.user_id = auth.uid()
  )
);

drop policy if exists chore_logs_mutate on public.chore_logs;
create policy chore_logs_mutate
on public.chore_logs
for insert with check (
  exists (
    select 1
    from public.chore_assignments ca
    join public.household_members tgt on tgt.id = ca.member_id
    join public.household_members me  on me.household_id = tgt.household_id
    where ca.id = chore_logs.assignment_id
      and ( public.is_household_manager(me.household_id) or me.user_id = auth.uid() )
  )
)
, for delete using (
  exists (
    select 1
    from public.chore_assignments ca
    join public.household_members tgt on tgt.id = ca.member_id
    join public.household_members me  on me.household_id = tgt.household_id
    where ca.id = chore_logs.assignment_id
      and public.is_household_manager(me.household_id)
  )
);

-- -------------------------------------
-- 6) Helpful indexes
-- -------------------------------------
create index if not exists idx_households_owner on public.households(owner);
create index if not exists idx_hh_members_household on public.household_members(household_id);
create index if not exists idx_hh_members_user on public.household_members(user_id);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_pantry_household on public.pantry_items(household_id);
create index if not exists idx_gl_household on public.grocery_lists(household_id);
create index if not exists idx_gli_list on public.grocery_list_items(list_id);
create index if not exists idx_recipes_household on public.recipes(household_id);
create index if not exists idx_chore_assign_member on public.chore_assignments(member_id);
create index if not exists idx_chore_logs_assignment on public.chore_logs(assignment_id);

-- -------------------------------------
-- 7) Optional: tighten access to the deprecated "people" table
-- -------------------------------------
comment on table public.people is 'DEPRECATED: use profiles + household_members.';
alter table public.people enable row level security;
drop policy if exists people_none on public.people;
create policy people_none on public.people for all using (false) with check (false);
