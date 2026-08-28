create table if not exists public.nrl_try_scorer_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  source_selection_key text not null unique,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
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

drop trigger if exists set_nrl_try_scorer_market_snapshots_updated_at
  on public.nrl_try_scorer_market_snapshots;

create trigger set_nrl_try_scorer_market_snapshots_updated_at
  before update on public.nrl_try_scorer_market_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_try_scorer_market_snapshots_match_idx
  on public.nrl_try_scorer_market_snapshots (
    matched_nrl_match_id,
    source,
    snapshot_at desc
  );

create index if not exists nrl_try_scorer_market_snapshots_team_price_idx
  on public.nrl_try_scorer_market_snapshots (
    matched_nrl_match_id,
    team_source_id,
    fixed_win_price
  );

create table if not exists public.nrl_same_game_multi_results (
  id uuid primary key default gen_random_uuid(),
  model_key text not null check (
    model_key in (
      'nrl_favourite_top2_try_scorers_same_game_percentage_v1'
    )
  ),
  source text not null check (source = 'tab'),
  source_result_key text not null unique,
  fixed_win_snapshot_result_id uuid references public.nrl_fixed_win_snapshot_results(id) on delete cascade,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
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
  try_scorer_1_snapshot_id uuid references public.nrl_try_scorer_market_snapshots(id) on delete set null,
  try_scorer_1_player_source_id text,
  try_scorer_1_name text,
  try_scorer_1_price numeric(12, 3),
  try_scorer_1_try_count int,
  try_scorer_1_scored boolean,
  try_scorer_2_snapshot_id uuid references public.nrl_try_scorer_market_snapshots(id) on delete set null,
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

drop trigger if exists set_nrl_same_game_multi_results_updated_at
  on public.nrl_same_game_multi_results;

create trigger set_nrl_same_game_multi_results_updated_at
  before update on public.nrl_same_game_multi_results
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_same_game_multi_results_model_idx
  on public.nrl_same_game_multi_results (
    model_key,
    outcome_status,
    advertised_start_at desc
  );

create index if not exists nrl_same_game_multi_results_match_idx
  on public.nrl_same_game_multi_results (
    matched_nrl_match_id,
    model_key
  );

alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_insight_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_insight_type_check
  check (
    insight_type in (
      'fixed_win_single',
      'try_scorer_percentage',
      'same_game_multi_percentage'
    )
  );

alter table public.nrl_try_scorer_market_snapshots enable row level security;
alter table public.nrl_same_game_multi_results enable row level security;

drop policy if exists "NRL try scorer market snapshots are readable"
  on public.nrl_try_scorer_market_snapshots;

drop policy if exists "NRL same game multi results are readable"
  on public.nrl_same_game_multi_results;

create policy "NRL try scorer market snapshots are readable"
  on public.nrl_try_scorer_market_snapshots
  for select to anon, authenticated using (true);

create policy "NRL same game multi results are readable"
  on public.nrl_same_game_multi_results
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
