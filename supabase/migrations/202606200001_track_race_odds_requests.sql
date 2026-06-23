create table if not exists public.track_race_odds_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  source text not null default 'betcha_graphql',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  country text not null,
  course_slug text not null,
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  race_numbers int[] not null default array[1, 2],
  status text not null check (status in ('success', 'error')),
  fetched_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists track_race_odds_requests_lookup_idx
  on public.track_race_odds_requests (source_date desc, country, course_slug, race_code);

alter table public.track_race_odds_requests enable row level security;

drop policy if exists "Track race odds requests are readable" on public.track_race_odds_requests;

create policy "Track race odds requests are readable"
  on public.track_race_odds_requests
  for select
  to anon, authenticated
  using (true);
