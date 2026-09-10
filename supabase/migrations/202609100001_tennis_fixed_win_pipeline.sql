create table if not exists public.tennis_matches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'odds_api'),
  source_match_id text not null,
  source_sport_key text not null,
  competition_key text not null,
  competition_name text not null,
  tour text not null check (tour in ('atp', 'wta')),
  commence_time timestamptz,
  result_status text not null default 'pending' check (
    result_status in ('pending', 'settled', 'abandoned', 'unknown')
  ),
  player_1_name text,
  player_1_sets int,
  player_2_name text,
  player_2_sets int,
  winner_player_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_match_id)
);

drop trigger if exists set_tennis_matches_updated_at on public.tennis_matches;

create trigger set_tennis_matches_updated_at
  before update on public.tennis_matches
  for each row
  execute function public.set_updated_at();

create index if not exists tennis_matches_commence_idx
  on public.tennis_matches (commence_time desc);

create index if not exists tennis_matches_competition_idx
  on public.tennis_matches (competition_key, commence_time desc);

create table if not exists public.tennis_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  matched_tennis_match_id uuid references public.tennis_matches(id) on delete set null,
  market_name text not null,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  competition_name text,
  competition_slug text,
  odds_api_sport_key text,
  tour text check (tour is null or tour in ('atp', 'wta')),
  player_1_name text,
  player_1_fixed_win_price numeric(12, 3),
  player_2_name text,
  player_2_fixed_win_price numeric(12, 3),
  favourite_player_name text,
  favourite_fixed_win_price numeric(12, 3),
  other_player_name text,
  other_player_fixed_win_price numeric(12, 3),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_tennis_market_snapshots_updated_at
  on public.tennis_market_snapshots;

create trigger set_tennis_market_snapshots_updated_at
  before update on public.tennis_market_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists tennis_market_snapshots_event_idx
  on public.tennis_market_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists tennis_market_snapshots_match_idx
  on public.tennis_market_snapshots (matched_tennis_match_id);

create table if not exists public.tennis_fixed_win_snapshot_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  market_snapshot_id uuid references public.tennis_market_snapshots(id) on delete cascade,
  matched_tennis_match_id uuid references public.tennis_matches(id) on delete set null,
  source_event_id text not null,
  source_market_id text,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  competition_name text,
  competition_slug text,
  odds_api_sport_key text,
  tour text check (tour is null or tour in ('atp', 'wta')),
  player_1_name text,
  player_1_fixed_win_price numeric(12, 3),
  player_2_name text,
  player_2_fixed_win_price numeric(12, 3),
  winner_player_name text,
  favourite_player_name text,
  favourite_fixed_win_price numeric(12, 3),
  other_player_name text,
  other_player_fixed_win_price numeric(12, 3),
  favourite_won boolean,
  favourite_win_return numeric(12, 3),
  outcome_status text not null check (
    outcome_status in (
      'pending',
      'settled',
      'unmatched',
      'missing_result',
      'non_standard'
    )
  ),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tennis_fixed_win_snapshot_results_status_idx
  on public.tennis_fixed_win_snapshot_results (outcome_status, snapshot_at desc);

create index if not exists tennis_fixed_win_snapshot_results_match_idx
  on public.tennis_fixed_win_snapshot_results (matched_tennis_match_id, source);

create table if not exists public.tennis_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  insight_type text not null check (insight_type = 'fixed_win_single'),
  scope_type text not null check (
    scope_type in (
      'overall',
      'tour',
      'competition',
      'price_bucket',
      'price_bucket_plus',
      'other_player_price_bucket',
      'other_player_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus'
    )
  ),
  source text,
  selection_type text check (selection_type is null or selection_type = 'favourite'),
  tour text check (tour is null or tour in ('atp', 'wta')),
  competition_key text,
  competition_name text,
  price_bucket_label text,
  price_bucket_start numeric,
  price_bucket_end numeric,
  bucket_size numeric not null default 0.50 check (
    bucket_size in (0.25, 0.50)
  ),
  date_from date,
  date_to date,
  event_count int not null default 0,
  selection_count int not null default 0,
  win_count int not null default 0,
  win_percentage numeric not null default 0,
  total_stake numeric not null default 0,
  total_return numeric not null default 0,
  net_return numeric not null default 0,
  average_return_per_dollar numeric not null default 0,
  roi_percentage numeric not null default 0,
  missing_price_count int not null default 0,
  pending_count int not null default 0,
  unmatched_count int not null default 0,
  missing_result_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists tennis_insight_aggregates_lookup_idx
  on public.tennis_insight_aggregates (
    insight_type,
    scope_type,
    source,
    selection_type,
    tour,
    competition_key,
    bucket_size,
    price_bucket_start
  );

alter table public.tennis_matches enable row level security;
alter table public.tennis_market_snapshots enable row level security;
alter table public.tennis_fixed_win_snapshot_results enable row level security;
alter table public.tennis_insight_aggregates enable row level security;

create policy "Tennis matches are readable" on public.tennis_matches
  for select to anon, authenticated using (true);
create policy "Tennis market snapshots are readable" on public.tennis_market_snapshots
  for select to anon, authenticated using (true);
create policy "Tennis fixed win snapshot results are readable" on public.tennis_fixed_win_snapshot_results
  for select to anon, authenticated using (true);
create policy "Tennis insight aggregates are readable" on public.tennis_insight_aggregates
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
