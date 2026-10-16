-- ==============================================================================
-- L'AURA RESTAURANT - SUPABASE STORAGE SYSTEM SETUP & AVATAR MIGRATION
-- Compliant with Supabase Storage best practices:
--   1. Creates public 'avatars' storage bucket with 5MB size limit & image MIME whitelist
--   2. Enables Row Level Security on storage.objects
--   3. Adds SELECT, INSERT, UPDATE (required for upsert: true), and DELETE policies
--   4. Adds avatar_url column to public.user_details table
-- ==============================================================================

-- 1. Create or configure the public 'avatars' storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB max file size
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Add avatar_url column to public.user_details table
alter table public.user_details
add column if not exists avatar_url text;

-- 3. Storage Row Level Security (RLS) Policies on storage.objects
-- Note: Supabase enables RLS on storage.objects by default.

-- A. SELECT Policy: Anyone can view avatars (public bucket)
drop policy if exists "Public avatar access" on storage.objects;
drop policy if exists "Public Access to Avatars" on storage.objects;
create policy "Public Access to Avatars"
on storage.objects
for select
using (bucket_id = 'avatars');

-- B. INSERT Policy: Allow guests and registered members to upload their profile photos
drop policy if exists "Allow avatar uploads" on storage.objects;
create policy "Allow avatar uploads"
on storage.objects
for insert
with check (bucket_id = 'avatars');

-- C. UPDATE Policy: Crucial for Supabase JS client { upsert: true } support
drop policy if exists "Allow avatar updates" on storage.objects;
create policy "Allow avatar updates"
on storage.objects
for update
using (bucket_id = 'avatars')
with check (bucket_id = 'avatars');

-- D. DELETE Policy: Allow avatar cleanup / replacement
drop policy if exists "Allow avatar deletes" on storage.objects;
create policy "Allow avatar deletes"
on storage.objects
for delete
using (bucket_id = 'avatars');
