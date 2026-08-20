
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'User' check (role in ('User','Manager','Admin')),
  status text not null default 'Active' check (status in ('Active','Suspended')),
  created_at timestamptz not null default now()
);

-- ---------- REPORTS ----------
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  species text not null default 'Unidentified species',
  description text not null,
  context text not null,
  symptoms text[] not null default '{}',
  base_level int not null,
  level int not null,
  coords text,
  photo_url text,
  status text not null default 'Pending Review'
    check (status in ('Pending Review','Field Validation','Permit Routed','Resolved')),
  scope text,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  submitted_by_name text not null,
  created_at timestamptz not null default now()
);

-- ---------- HELPER FUNCTIONS (security definer = bypasses RLS,
-- which avoids infinite-recursion when a policy on `profiles`
-- needs to read `profiles` to check the caller's own role) ----------
create or replace function public.is_active()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'Active'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Manager','Admin') and status = 'Active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Admin' and status = 'Active'
  );
$$;

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'User',
    'Active'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.reports enable row level security;

-- profiles: everyone can see their own row; admins can see everyone
-- (needed for the Admin tab's account list)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

-- profiles: only admins can change someone's role/status
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- reports: any signed-in, active account can read (dashboard/queue
-- need to see everything, not just "my own")
drop policy if exists "reports_select_authenticated" on public.reports;
create policy "reports_select_authenticated" on public.reports
  for select using (auth.uid() is not null and public.is_active());

-- reports: a citizen can only file a report as themselves
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = submitted_by and public.is_active());

-- reports: only Manager/Admin can change status or permit scope
drop policy if exists "reports_update_staff" on public.reports;
create policy "reports_update_staff" on public.reports
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------- STORAGE (photo evidence) ----------
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

drop policy if exists "report_photos_public_read" on storage.objects;
create policy "report_photos_public_read" on storage.objects
  for select using (bucket_id = 'report-photos');

drop policy if exists "report_photos_authenticated_upload" on storage.objects;
create policy "report_photos_authenticated_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-photos');


