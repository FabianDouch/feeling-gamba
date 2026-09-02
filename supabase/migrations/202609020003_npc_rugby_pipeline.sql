create table if not exists public.npc_teams (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_team_id text not null,
  team_key text not null,
  name text,
  nick_name text,
  display_name text not null,
  abbreviation text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_team_id)
);

alter table public.user_locked_current_predictions
  drop constraint if exists user_locked_current_predictions_prediction_sport_check;
alter table public.user_locked_current_predictions
  add constraint user_locked_current_predictions_prediction_sport_check
  check (prediction_sport in ('racing', 'ufc', 'pfl', 'nrl', 'npc'));

alter table public.user_favourite_prediction_models
  drop constraint if exists user_favourite_prediction_models_sport_check;
alter table public.user_favourite_prediction_models
  add constraint user_favourite_prediction_models_sport_check
  check (sport in ('racing', 'ufc', 'pfl', 'nrl', 'npc'));

alter table public.prediction_notification_events
  drop constraint if exists prediction_notification_events_sport_check;
alter table public.prediction_notification_events
  add constraint prediction_notification_events_sport_check
  check (sport in ('racing', 'ufc', 'pfl', 'nrl', 'npc'));

drop trigger if exists set_npc_teams_updated_at on public.npc_teams;

create trigger set_npc_teams_updated_at
  before update on public.npc_teams
  for each row
  execute function public.set_updated_at();

create index if not exists npc_teams_team_key_idx
  on public.npc_teams (team_key);

create table if not exists public.npc_players (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_player_id text not null,
  player_key text not null,
  first_name text,
  last_name text,
  display_name text not null,
  position text,
  jersey_number int,
  latest_team_source_id text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_player_id)
);

drop trigger if exists set_npc_players_updated_at on public.npc_players;

create trigger set_npc_players_updated_at
  before update on public.npc_players
  for each row
  execute function public.set_updated_at();

create index if not exists npc_players_player_key_idx
  on public.npc_players (player_key);

create table if not exists public.npc_matches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_match_id text not null,
  source_url text,
  competition_id int,
  season int not null,
  round_number int,
  round_title text,
  kickoff_at timestamptz,
  venue_name text,
  venue_city text,
  match_state text,
  match_mode text,
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

drop trigger if exists set_npc_matches_updated_at on public.npc_matches;

create trigger set_npc_matches_updated_at
  before update on public.npc_matches
  for each row
  execute function public.set_updated_at();

create index if not exists npc_matches_kickoff_idx
  on public.npc_matches (kickoff_at desc);

create index if not exists npc_matches_round_idx
  on public.npc_matches (season, round_number);

create table if not exists public.npc_try_scorers (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_try_key text not null unique,
  source_match_id text not null,
  source_player_id text not null,
  player_name text not null,
  source_team_id text not null,
  team_name text not null,
  game_seconds int not null,
  display_minute text,
  home_score int,
  away_score int,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists npc_try_scorers_match_idx
  on public.npc_try_scorers (source, source_match_id, game_seconds);

create table if not exists public.npc_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  market_name text not null,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  home_fixed_win_price numeric,
  away_fixed_win_price numeric,
  favourite_team_name text,
  favourite_fixed_win_price numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_npc_market_snapshots_updated_at
  on public.npc_market_snapshots;

create trigger set_npc_market_snapshots_updated_at
  before update on public.npc_market_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists npc_market_snapshots_event_idx
  on public.npc_market_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists npc_market_snapshots_matched_match_idx
  on public.npc_market_snapshots (matched_npc_match_id);

create table if not exists public.npc_fixed_win_snapshot_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  market_snapshot_id uuid references public.npc_market_snapshots(id) on delete cascade,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  source_event_id text not null,
  source_market_id text,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  winner_team_name text,
  winner_team_source_id text,
  home_fixed_win_price numeric,
  away_fixed_win_price numeric,
  favourite_team_name text,
  favourite_fixed_win_price numeric,
  home_team_won boolean,
  away_team_won boolean,
  favourite_won boolean,
  home_win_return numeric,
  away_win_return numeric,
  favourite_win_return numeric,
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

create index if not exists npc_fixed_win_snapshot_results_status_idx
  on public.npc_fixed_win_snapshot_results (outcome_status, snapshot_at desc);

create index if not exists npc_fixed_win_snapshot_results_match_idx
  on public.npc_fixed_win_snapshot_results (matched_npc_match_id, source);

create table if not exists public.npc_player_match_appearances (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_appearance_key text not null unique,
  source_match_id text not null,
  source_player_id text not null,
  player_name text not null,
  source_team_id text not null,
  team_name text not null,
  position text,
  jersey_number int,
  is_on_field boolean,
  result_status text not null default 'unknown' check (
    result_status in ('pending', 'settled', 'abandoned', 'unknown')
  ),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists npc_player_match_appearances_match_idx
  on public.npc_player_match_appearances (source, source_match_id);

create table if not exists public.npc_try_scorer_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  source_selection_key text not null unique,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  market_name text not null,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  player_source_id text,
  player_name text not null,
  team_source_id text,
  team_name text,
  fixed_win_price numeric(12, 3),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.npc_same_game_multi_results (
  id uuid primary key default gen_random_uuid(),
  model_key text not null check (
    model_key in (
      'npc_favourite_top2_try_scorers_same_game_percentage_v1'
    )
  ),
  source text not null check (source = 'tab'),
  source_result_key text not null unique,
  fixed_win_snapshot_result_id uuid references public.npc_fixed_win_snapshot_results(id) on delete cascade,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  source_event_id text,
  source_match_id text,
  season int,
  round_number int,
  snapshot_at timestamptz,
  advertised_start_at timestamptz,
  match_label text,
  selected_team_source_id text,
  selected_team_name text,
  selected_team_fixed_win_price numeric(12, 3),
  selected_team_won boolean,
  try_scorer_1_snapshot_id uuid references public.npc_try_scorer_market_snapshots(id) on delete set null,
  try_scorer_1_player_source_id text,
  try_scorer_1_name text,
  try_scorer_1_price numeric(12, 3),
  try_scorer_1_try_count int,
  try_scorer_1_scored boolean,
  try_scorer_2_snapshot_id uuid references public.npc_try_scorer_market_snapshots(id) on delete set null,
  try_scorer_2_player_source_id text,
  try_scorer_2_name text,
  try_scorer_2_price numeric(12, 3),
  try_scorer_2_try_count int,
  try_scorer_2_scored boolean,
  combined_estimated_price numeric(12, 3),
  outcome_status text not null default 'pending' check (
    outcome_status in (
      'pending',
      'settled',
      'missing_price',
      'missing_result',
      'unmatched',
      'non_standard'
    )
  ),
  outcome_win_return numeric(12, 3) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.npc_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  insight_type text not null check (
    insight_type in (
      'fixed_win_single',
      'try_scorer_percentage',
      'same_game_multi_percentage'
    )
  ),
  scope_type text not null check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'team',
      'season',
      'season_round',
      'player',
      'player_team',
      'price_bucket',
      'other_team_price_bucket',
      'price_difference_bucket'
    )
  ),
  source text,
  selection_type text check (
    selection_type is null
    or selection_type in (
      'home',
      'away',
      'favourite',
      'favourite_home',
      'favourite_away'
    )
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

create index if not exists npc_insight_aggregates_lookup_idx
  on public.npc_insight_aggregates (
    insight_type,
    scope_type,
    source,
    selection_type,
    season,
    round_number
  );

create table if not exists public.npc_single_predictions (
  id uuid primary key default gen_random_uuid(),
  prediction_model text not null check (
    prediction_model in (
      'npc_fixed_win_percentage_single_v1',
      'npc_try_scorer_percentage_single_v1'
    )
  ),
  source text not null,
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  source_prediction_key text not null unique,
  source_event_id text,
  source_market_id text,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  source_match_id text,
  advertised_start_at timestamptz,
  predicted_at timestamptz not null,
  prediction_signature text not null,
  match_label text,
  home_team_name text,
  away_team_name text,
  predicted_team_source_id text,
  predicted_team_name text not null,
  predicted_player_source_id text,
  predicted_player_name text,
  predicted_fixed_win_price numeric(12, 2),
  other_team_name text,
  other_team_fixed_win_price numeric(12, 2),
  prediction_rank int,
  win_score numeric(12, 4),
  signal_label text,
  signal_tone text,
  signal_detail text,
  bucket_sample_size int,
  lineup_status text not null default 'not_applicable' check (
    lineup_status in (
      'not_applicable',
      'official_lineup',
      'historical_team_roster'
    )
  ),
  outcome_status text not null default 'pending' check (
    outcome_status in (
      'pending',
      'settled',
      'missing_result',
      'missing_player',
      'non_standard'
    )
  ),
  outcome_match_id uuid references public.npc_matches(id) on delete set null,
  outcome_winner_team_name text,
  outcome_team_won boolean,
  outcome_player_scored boolean,
  outcome_try_count int,
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists npc_single_predictions_current_idx
  on public.npc_single_predictions (
    prediction_model,
    source_date desc,
    prediction_rank
  );

create index if not exists npc_single_predictions_match_idx
  on public.npc_single_predictions (
    matched_npc_match_id,
    source_match_id,
    outcome_status
  );

alter table public.npc_teams enable row level security;
alter table public.npc_players enable row level security;
alter table public.npc_matches enable row level security;
alter table public.npc_try_scorers enable row level security;
alter table public.npc_market_snapshots enable row level security;
alter table public.npc_fixed_win_snapshot_results enable row level security;
alter table public.npc_player_match_appearances enable row level security;
alter table public.npc_try_scorer_market_snapshots enable row level security;
alter table public.npc_same_game_multi_results enable row level security;
alter table public.npc_insight_aggregates enable row level security;
alter table public.npc_single_predictions enable row level security;

create policy "NPC teams are readable" on public.npc_teams
  for select to anon, authenticated using (true);
create policy "NPC players are readable" on public.npc_players
  for select to anon, authenticated using (true);
create policy "NPC matches are readable" on public.npc_matches
  for select to anon, authenticated using (true);
create policy "NPC try scorers are readable" on public.npc_try_scorers
  for select to anon, authenticated using (true);
create policy "NPC market snapshots are readable" on public.npc_market_snapshots
  for select to anon, authenticated using (true);
create policy "NPC fixed win snapshot results are readable" on public.npc_fixed_win_snapshot_results
  for select to anon, authenticated using (true);
create policy "NPC player match appearances are readable" on public.npc_player_match_appearances
  for select to anon, authenticated using (true);
create policy "NPC try scorer market snapshots are readable" on public.npc_try_scorer_market_snapshots
  for select to anon, authenticated using (true);
create policy "NPC same game multi results are readable" on public.npc_same_game_multi_results
  for select to anon, authenticated using (true);
create policy "NPC insight aggregates are readable" on public.npc_insight_aggregates
  for select to anon, authenticated using (true);
create policy "NPC single predictions are readable" on public.npc_single_predictions
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
