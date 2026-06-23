create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(profiles.display_name, excluded.display_name),
    avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

create table if not exists public.user_favourite_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  country text not null,
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  course_slug text not null,
  course_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, country, race_code, course_slug)
);

drop trigger if exists set_user_favourite_tracks_updated_at on public.user_favourite_tracks;

create trigger set_user_favourite_tracks_updated_at
  before update on public.user_favourite_tracks
  for each row
  execute function public.set_updated_at();

create index if not exists user_favourite_tracks_lookup_idx
  on public.user_favourite_tracks (user_id, country, race_code, course_slug);

alter table public.profiles enable row level security;
alter table public.user_favourite_tracks enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read own favourite tracks" on public.user_favourite_tracks;
drop policy if exists "Users can insert own favourite tracks" on public.user_favourite_tracks;
drop policy if exists "Users can update own favourite tracks" on public.user_favourite_tracks;
drop policy if exists "Users can delete own favourite tracks" on public.user_favourite_tracks;

create policy "Users can read own favourite tracks"
  on public.user_favourite_tracks
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own favourite tracks"
  on public.user_favourite_tracks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own favourite tracks"
  on public.user_favourite_tracks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own favourite tracks"
  on public.user_favourite_tracks
  for delete
  to authenticated
  using (auth.uid() = user_id);
