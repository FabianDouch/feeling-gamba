create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  triggered_by text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.ingestion_locks (
  lock_key text primary key,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  run_id uuid references public.ingestion_runs(id) on delete set null
);

create table if not exists public.source_fetches (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  source text not null,
  url text,
  method text not null default 'GET',
  request_key text,
  status_code int,
  fetched_at timestamptz not null default now(),
  parser_version text,
  success boolean not null,
  error_message text,
  raw_storage_path text,
  raw jsonb
);

create index if not exists source_fetches_request_key_idx
  on public.source_fetches (source, request_key, fetched_at desc);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  course_name text not null,
  course_slug text not null,
  country text not null,
  region text,
  meeting_date date not null,
  source_primary text,
  source_meeting_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_code, country, course_slug, meeting_date)
);

drop trigger if exists set_meetings_updated_at on public.meetings;

create trigger set_meetings_updated_at
  before update on public.meetings
  for each row
  execute function public.set_updated_at();

create index if not exists meetings_date_idx
  on public.meetings (meeting_date desc, country, race_code, course_slug);

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  race_number int not null,
  race_name text,
  advertised_start timestamptz,
  status text,
  distance_m int,
  track_condition text,
  declared_runner_count int,
  starter_count int,
  scratched_count int,
  source_race_id text,
  source_form_id text,
  source_race_card_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, race_number)
);

drop trigger if exists set_races_updated_at on public.races;

create trigger set_races_updated_at
  before update on public.races
  for each row
  execute function public.set_updated_at();

create index if not exists races_advertised_start_idx
  on public.races (advertised_start desc);

create index if not exists races_source_race_card_id_idx
  on public.races (source_race_card_id);

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  runner_number int,
  runner_name text not null,
  barrier text,
  trainer_name text,
  driver_or_jockey_name text,
  scratched boolean not null default false,
  source_runner_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, runner_number)
);

drop trigger if exists set_runners_updated_at on public.runners;

create trigger set_runners_updated_at
  before update on public.runners
  for each row
  execute function public.set_updated_at();

create index if not exists runners_source_runner_id_idx
  on public.runners (source_runner_id);

create table if not exists public.odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  runner_id uuid not null references public.runners(id) on delete cascade,
  source text not null,
  snapshot_at timestamptz not null,
  win_price numeric,
  place_price numeric,
  is_favourite boolean not null default false,
  is_market_mover boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (race_id, runner_id, source, snapshot_at)
);

create index if not exists odds_snapshots_race_snapshot_idx
  on public.odds_snapshots (race_id, snapshot_at desc);

create index if not exists odds_snapshots_favourite_idx
  on public.odds_snapshots (race_id, is_favourite, snapshot_at desc);

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  runner_id uuid not null references public.runners(id) on delete cascade,
  finish_position int,
  finish_status text,
  margin text,
  result_time text,
  win_dividend numeric,
  place_dividend numeric,
  tote_win_dividend numeric,
  tote_place_dividend numeric,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, runner_id)
);

drop trigger if exists set_race_results_updated_at on public.race_results;

create trigger set_race_results_updated_at
  before update on public.race_results
  for each row
  execute function public.set_updated_at();

create index if not exists race_results_race_finish_idx
  on public.race_results (race_id, finish_position);

create table if not exists public.race_dividends (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  source text not null,
  product text not null,
  combination text,
  amount numeric,
  raw_text text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists race_dividends_unique_idx
  on public.race_dividends (race_id, source, product, coalesce(combination, ''));

create table if not exists public.race_market_state (
  race_id uuid primary key references public.races(id) on delete cascade,
  selected_snapshot_id uuid references public.odds_snapshots(id) on delete set null,
  favourite_runner_id uuid references public.runners(id) on delete set null,
  market_mover_runner_id uuid references public.runners(id) on delete set null,
  snapshot_at timestamptz,
  source text,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_race_market_state_updated_at on public.race_market_state;

create trigger set_race_market_state_updated_at
  before update on public.race_market_state
  for each row
  execute function public.set_updated_at();

create table if not exists public.race_day_entries (
  race_id uuid primary key references public.races(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_date date not null,
  country text not null,
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  course_name text not null,
  course_slug text not null,
  race_number int not null,
  race_name text,
  advertised_start timestamptz,
  status text,
  declared_runner_count int,
  starter_count int,
  scratched_count int,
  favourite_runner_id uuid references public.runners(id) on delete set null,
  favourite_runner_number int,
  favourite_runner_name text,
  favourite_price numeric,
  favourite_result_position int,
  favourite_win_return numeric,
  favourite_bonus_credit numeric,
  favourite_total_value_with_bonus_credit numeric,
  market_mover_runner_id uuid references public.runners(id) on delete set null,
  market_mover_runner_number int,
  market_mover_runner_name text,
  winner_runner_id uuid references public.runners(id) on delete set null,
  winner_runner_number int,
  winner_runner_name text,
  winner_win_dividend numeric,
  source_status text not null default 'pending',
  missing_favourite boolean not null default false,
  missing_price boolean not null default false,
  missing_result boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_race_day_entries_updated_at on public.race_day_entries;

create trigger set_race_day_entries_updated_at
  before update on public.race_day_entries
  for each row
  execute function public.set_updated_at();

create index if not exists race_day_entries_default_idx
  on public.race_day_entries (meeting_date desc, advertised_start, country, race_code, course_slug);

create index if not exists race_day_entries_filter_idx
  on public.race_day_entries (country, race_code, course_slug, meeting_date desc);

create table if not exists public.insight_aggregate_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'scheduled_derivation',
  triggered_by text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_min_date date,
  source_max_date date,
  success boolean,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create table if not exists public.insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  aggregate_run_id uuid references public.insight_aggregate_runs(id) on delete set null,
  scope_key text not null unique,
  scope_type text not null check (
    scope_type in (
      'overall',
      'country',
      'course',
      'race_code',
      'country_race_code',
      'course_race_code',
      'starter_count',
      'price_bucket'
    )
  ),
  date_from date,
  date_to date,
  country text,
  race_code text check (race_code is null or race_code in ('horse', 'harness', 'greyhound')),
  course_name text,
  course_slug text,
  starter_count int,
  price_bucket_start numeric,
  price_bucket_end numeric,
  price_bucket_label text,
  race_count int not null default 0,
  favourite_selections int not null default 0,
  wins int not null default 0,
  seconds int not null default 0,
  thirds int not null default 0,
  win_percentage numeric not null default 0,
  second_percentage numeric not null default 0,
  third_percentage numeric not null default 0,
  total_stake numeric not null default 0,
  total_return numeric not null default 0,
  net_return numeric not null default 0,
  average_return_per_dollar numeric not null default 0,
  roi_percentage numeric not null default 0,
  total_bonus_credit numeric not null default 0,
  total_value_with_bonus_credit numeric not null default 0,
  average_value_per_dollar_with_bonus_credit numeric not null default 0,
  bonus_credit_percentage numeric not null default 0,
  missing_favourite_count int not null default 0,
  missing_price_count int not null default 0,
  missing_result_count int not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_insight_aggregates_updated_at on public.insight_aggregates;

create trigger set_insight_aggregates_updated_at
  before update on public.insight_aggregates
  for each row
  execute function public.set_updated_at();

create index if not exists insight_aggregates_lookup_idx
  on public.insight_aggregates (scope_type, country, race_code, course_slug, starter_count, price_bucket_start);

alter table public.meetings enable row level security;
alter table public.races enable row level security;
alter table public.runners enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.race_results enable row level security;
alter table public.race_dividends enable row level security;
alter table public.race_market_state enable row level security;
alter table public.race_day_entries enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_locks enable row level security;
alter table public.source_fetches enable row level security;
alter table public.insight_aggregate_runs enable row level security;
alter table public.insight_aggregates enable row level security;

drop policy if exists "Race day entries are readable" on public.race_day_entries;
drop policy if exists "Insight aggregates are readable" on public.insight_aggregates;

create policy "Race day entries are readable" on public.race_day_entries
  for select to anon, authenticated using (true);

create policy "Insight aggregates are readable" on public.insight_aggregates
  for select to anon, authenticated using (true);
