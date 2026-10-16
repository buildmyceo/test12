-- ==============================================================================
-- L'AURA RESTAURANT - USER DETAILS & GUEST PROFILE SCHEMA
-- Supabase Postgres Best Practices Compliant:
--   - UUID Primary Key with gen_random_uuid()
--   - Proper constraints and data types (TIMESTAMPTZ, NUMERIC for coordinates)
--   - B-tree Indexes for foreign keys and queries
--   - Automatic updated_at trigger (SECURITY INVOKER, fixed search_path)
--   - Strict Row Level Security (RLS) with cached subquery auth checks
--   - Least-privilege role permissions (authenticated & anon)
-- ==============================================================================

-- 1. Create the user_details table
create table if not exists public.user_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  location text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_accuracy numeric(8, 2),
  about_me text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure user_id is unique per registered user (allows 1 profile per auth user)
alter table public.user_details drop constraint if exists user_details_user_id_key;
alter table public.user_details add constraint user_details_user_id_key unique (user_id);

-- 2. Indexes for fast lookups & high-performance RLS policy checks
create index if not exists user_details_user_id_idx on public.user_details (user_id);
create index if not exists user_details_email_idx on public.user_details (email);
create index if not exists user_details_created_at_idx on public.user_details (created_at desc);

-- 3. Automatic updated_at timestamp trigger
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_user_details_updated_at on public.user_details;
create trigger trigger_user_details_updated_at
before update on public.user_details
for each row
execute function public.set_updated_at_timestamp();

-- 4. Enable and enforce Row Level Security (RLS)
alter table public.user_details enable row level security;
alter table public.user_details force row level security;

-- 5. Row Level Security Policies
-- Best practice: Wrap auth.uid() in (select auth.uid()) so Postgres calls it once per statement, not per row

-- SELECT Policy: Authenticated users can only read their own profile details
drop policy if exists "Users can view their own profile details" on public.user_details;
create policy "Users can view their own profile details"
on public.user_details
for select
to authenticated
using ((select auth.uid()) = user_id);

-- INSERT Policy: Authenticated users can insert their own profile details
drop policy if exists "Users can insert their own profile details" on public.user_details;
create policy "Users can insert their own profile details"
on public.user_details
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- UPDATE Policy: Authenticated users can update their own profile details (requires both USING and WITH CHECK)
drop policy if exists "Users can update their own profile details" on public.user_details;
create policy "Users can update their own profile details"
on public.user_details
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- INSERT Policy for Anonymous Guests: Allows visitors to record details if guest entry is enabled without sign-in
drop policy if exists "Anonymous guests can insert their details" on public.user_details;
create policy "Anonymous guests can insert their details"
on public.user_details
for insert
to anon
with check (user_id is null);

-- 6. Grant API access to PostgREST / Supabase Data API roles
grant select, insert, update on public.user_details to authenticated;
grant insert on public.user_details to anon;
