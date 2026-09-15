create table if not exists public.nfl_teams (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'official_nfl'),
  source_team_id text not null,
  team_key text not null,
  name text,
  display_name text not null,
  abbreviation text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_team_id)
);

drop trigger if exists set_nfl_teams_updated_at on public.nfl_teams;

create trigger set_nfl_teams_updated_at
  before update on public.nfl_teams
  for each row
  execute function public.set_updated_at();

create index if not exists nfl_teams_team_key_idx
  on public.nfl_teams (team_key);

create table if not exists public.nfl_matches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'official_nfl'),
  source_match_id text not null,
  source_url text,
  season int not null,
  season_type int,
  round_number int,
  round_title text,
  kickoff_at timestamptz,
  venue_name text,
  venue_city text,
  match_state text,
  result_status text not null default 'pending' check (
    result_status in ('pending', 'settled', 'abandoned', 'unknown')
  ),
  home_team_source_id text,
  home_team_name text,
  home_score int,
  away_team_source_id text,
  away_team_name text,
  away_score int,
  winner_team_source_id text,
  winner_team_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_match_id)
);

drop trigger if exists set_nfl_matches_updated_at on public.nfl_matches;

create trigger set_nfl_matches_updated_at
  before update on public.nfl_matches
  for each row
  execute function public.set_updated_at();

create index if not exists nfl_matches_kickoff_idx
  on public.nfl_matches (kickoff_at desc);

create index if not exists nfl_matches_round_idx
  on public.nfl_matches (season, season_type, round_number);

create table if not exists public.nfl_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  matched_nfl_match_id uuid references public.nfl_matches(id) on delete set null,
  market_name text not null,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  home_fixed_win_price numeric(12, 3),
  away_fixed_win_price numeric(12, 3),
  favourite_team_name text,
  favourite_fixed_win_price numeric(12, 3),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nfl_market_snapshots_updated_at
  on public.nfl_market_snapshots;

create trigger set_nfl_market_snapshots_updated_at
  before update on public.nfl_market_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists nfl_market_snapshots_event_idx
  on public.nfl_market_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists nfl_market_snapshots_match_idx
  on public.nfl_market_snapshots (matched_nfl_match_id);

create table if not exists public.nfl_fixed_win_snapshot_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  market_snapshot_id uuid references public.nfl_market_snapshots(id) on delete cascade,
  matched_nfl_match_id uuid references public.nfl_matches(id) on delete set null,
  source_event_id text not null,
  source_market_id text,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  winner_team_name text,
  winner_team_source_id text,
  home_fixed_win_price numeric(12, 3),
  away_fixed_win_price numeric(12, 3),
  favourite_team_name text,
  favourite_fixed_win_price numeric(12, 3),
  home_team_won boolean,
  away_team_won boolean,
  favourite_won boolean,
  home_win_return numeric(12, 3),
  away_win_return numeric(12, 3),
  favourite_win_return numeric(12, 3),
  outcome_status text not null check (
    outcome_status in (
      'pending',
      'settled',
      'draw',
      'unmatched',
      'missing_result',
      'non_standard'
    )
  ),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nfl_fixed_win_snapshot_results_updated_at
  on public.nfl_fixed_win_snapshot_results;

create trigger set_nfl_fixed_win_snapshot_results_updated_at
  before update on public.nfl_fixed_win_snapshot_results
  for each row
  execute function public.set_updated_at();

create index if not exists nfl_fixed_win_snapshot_results_status_idx
  on public.nfl_fixed_win_snapshot_results (outcome_status, snapshot_at desc);

create index if not exists nfl_fixed_win_snapshot_results_match_idx
  on public.nfl_fixed_win_snapshot_results (matched_nfl_match_id, source);

create table if not exists public.nfl_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  insight_type text not null check (insight_type = 'fixed_win_single'),
  scope_type text not null check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'team',
      'season',
      'season_round',
      'price_bucket',
      'price_bucket_plus',
      'other_team_price_bucket',
      'other_team_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus'
    )
  ),
  source text,
  selection_type text check (
    selection_type is null or selection_type in ('home', 'away', 'favourite', 'favourite_home', 'favourite_away')
  ),
  season int,
  round_number int,
  team_source_id text,
  team_name text,
  player_source_id text,
  player_name text,
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
  total_tries int not null default 0,
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

create index if not exists nfl_insight_aggregates_lookup_idx
  on public.nfl_insight_aggregates (
    insight_type,
    scope_type,
    source,
    selection_type,
    season,
    round_number,
    bucket_size,
    price_bucket_start
  );

create index if not exists nfl_insight_aggregates_team_idx
  on public.nfl_insight_aggregates (insight_type, team_source_id);

alter table public.nfl_teams enable row level security;
alter table public.nfl_matches enable row level security;
alter table public.nfl_market_snapshots enable row level security;
alter table public.nfl_fixed_win_snapshot_results enable row level security;
alter table public.nfl_insight_aggregates enable row level security;

create policy "NFL teams are readable" on public.nfl_teams
  for select to anon, authenticated using (true);
create policy "NFL matches are readable" on public.nfl_matches
  for select to anon, authenticated using (true);
create policy "NFL market snapshots are readable" on public.nfl_market_snapshots
  for select to anon, authenticated using (true);
create policy "NFL fixed win snapshot results are readable" on public.nfl_fixed_win_snapshot_results
  for select to anon, authenticated using (true);
create policy "NFL insight aggregates are readable" on public.nfl_insight_aggregates
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
