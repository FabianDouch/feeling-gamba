create table if not exists public.nrl_player_match_appearances (
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

drop trigger if exists set_nrl_player_match_appearances_updated_at
  on public.nrl_player_match_appearances;

create trigger set_nrl_player_match_appearances_updated_at
  before update on public.nrl_player_match_appearances
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_player_match_appearances_match_idx
  on public.nrl_player_match_appearances (source, source_match_id);

create index if not exists nrl_player_match_appearances_player_idx
  on public.nrl_player_match_appearances (source, source_player_id);

create index if not exists nrl_player_match_appearances_team_idx
  on public.nrl_player_match_appearances (source, source_team_id);

create table if not exists public.nrl_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  insight_type text not null check (
    insight_type in (
      'fixed_win_single',
      'try_scorer_percentage'
    )
  ),
  scope_type text not null check (
    scope_type in (
      'overall',
      'source',
      'selection_type',
      'source_selection_type',
      'team',
      'season',
      'season_round',
      'player',
      'player_team'
    )
  ),
  source text,
  selection_type text check (
    selection_type is null or selection_type in ('home', 'away', 'favourite')
  ),
  season int,
  round_number int,
  team_source_id text,
  team_name text,
  player_source_id text,
  player_name text,
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

drop trigger if exists set_nrl_insight_aggregates_updated_at
  on public.nrl_insight_aggregates;

create trigger set_nrl_insight_aggregates_updated_at
  before update on public.nrl_insight_aggregates
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_insight_aggregates_lookup_idx
  on public.nrl_insight_aggregates (
    insight_type,
    scope_type,
    source,
    selection_type,
    season,
    round_number
  );

create index if not exists nrl_insight_aggregates_team_idx
  on public.nrl_insight_aggregates (insight_type, team_source_id);

create index if not exists nrl_insight_aggregates_player_idx
  on public.nrl_insight_aggregates (insight_type, player_source_id);

alter table public.nrl_player_match_appearances enable row level security;
alter table public.nrl_insight_aggregates enable row level security;

drop policy if exists "NRL player match appearances are readable"
  on public.nrl_player_match_appearances;

drop policy if exists "NRL insight aggregates are readable"
  on public.nrl_insight_aggregates;

create policy "NRL player match appearances are readable"
  on public.nrl_player_match_appearances
  for select to anon, authenticated using (true);

create policy "NRL insight aggregates are readable"
  on public.nrl_insight_aggregates
  for select to anon, authenticated using (true);
