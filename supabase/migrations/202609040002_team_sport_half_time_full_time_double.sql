alter table public.nrl_matches
  add column if not exists home_half_time_score int,
  add column if not exists away_half_time_score int;

alter table public.npc_matches
  add column if not exists home_half_time_score int,
  add column if not exists away_half_time_score int;

create table if not exists public.nrl_half_time_full_time_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  source_event_id text not null,
  source_event_url text,
  source_market_id text,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
  market_name text not null,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  home_home_fixed_win_price numeric,
  away_away_fixed_win_price numeric,
  favourite_team_name text,
  favourite_fixed_win_price numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nrl_half_time_full_time_snapshots_updated_at
  on public.nrl_half_time_full_time_snapshots;

create trigger set_nrl_half_time_full_time_snapshots_updated_at
  before update on public.nrl_half_time_full_time_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_half_time_full_time_snapshots_event_idx
  on public.nrl_half_time_full_time_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists nrl_half_time_full_time_snapshots_matched_match_idx
  on public.nrl_half_time_full_time_snapshots (matched_nrl_match_id);

create table if not exists public.nrl_half_time_full_time_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  half_time_full_time_snapshot_id uuid references public.nrl_half_time_full_time_snapshots(id) on delete cascade,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
  source_event_id text not null,
  source_market_id text,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  home_half_time_score int,
  away_half_time_score int,
  home_score int,
  away_score int,
  half_time_winner_team_name text,
  half_time_winner_team_source_id text,
  full_time_winner_team_name text,
  full_time_winner_team_source_id text,
  home_home_fixed_win_price numeric,
  away_away_fixed_win_price numeric,
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
      'missing_price',
      'non_standard'
    )
  ),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nrl_half_time_full_time_results_updated_at
  on public.nrl_half_time_full_time_results;

create trigger set_nrl_half_time_full_time_results_updated_at
  before update on public.nrl_half_time_full_time_results
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_half_time_full_time_results_status_idx
  on public.nrl_half_time_full_time_results (outcome_status, snapshot_at desc);

create index if not exists nrl_half_time_full_time_results_match_idx
  on public.nrl_half_time_full_time_results (matched_nrl_match_id, source);

create unique index if not exists nrl_half_time_full_time_results_source_event_unique_idx
  on public.nrl_half_time_full_time_results (source, source_event_id);

create table if not exists public.npc_half_time_full_time_snapshots (
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
  home_home_fixed_win_price numeric,
  away_away_fixed_win_price numeric,
  favourite_team_name text,
  favourite_fixed_win_price numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_npc_half_time_full_time_snapshots_updated_at
  on public.npc_half_time_full_time_snapshots;

create trigger set_npc_half_time_full_time_snapshots_updated_at
  before update on public.npc_half_time_full_time_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists npc_half_time_full_time_snapshots_event_idx
  on public.npc_half_time_full_time_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists npc_half_time_full_time_snapshots_matched_match_idx
  on public.npc_half_time_full_time_snapshots (matched_npc_match_id);

create table if not exists public.npc_half_time_full_time_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'tab'),
  source_snapshot_key text not null unique,
  half_time_full_time_snapshot_id uuid references public.npc_half_time_full_time_snapshots(id) on delete cascade,
  matched_npc_match_id uuid references public.npc_matches(id) on delete set null,
  source_event_id text not null,
  source_market_id text,
  snapshot_at timestamptz not null,
  advertised_start_at timestamptz,
  home_team_name text,
  away_team_name text,
  home_half_time_score int,
  away_half_time_score int,
  home_score int,
  away_score int,
  half_time_winner_team_name text,
  half_time_winner_team_source_id text,
  full_time_winner_team_name text,
  full_time_winner_team_source_id text,
  home_home_fixed_win_price numeric,
  away_away_fixed_win_price numeric,
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
      'missing_price',
      'non_standard'
    )
  ),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_npc_half_time_full_time_results_updated_at
  on public.npc_half_time_full_time_results;

create trigger set_npc_half_time_full_time_results_updated_at
  before update on public.npc_half_time_full_time_results
  for each row
  execute function public.set_updated_at();

create index if not exists npc_half_time_full_time_results_status_idx
  on public.npc_half_time_full_time_results (outcome_status, snapshot_at desc);

create index if not exists npc_half_time_full_time_results_match_idx
  on public.npc_half_time_full_time_results (matched_npc_match_id, source);

create unique index if not exists npc_half_time_full_time_results_source_event_unique_idx
  on public.npc_half_time_full_time_results (source, source_event_id);

alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_insight_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_insight_type_check
  check (
    insight_type in (
      'fixed_win_single',
      'try_scorer_percentage',
      'same_game_multi_percentage',
      'half_time_full_time_double'
    )
  );

alter table public.npc_insight_aggregates
  drop constraint if exists npc_insight_aggregates_insight_type_check;

alter table public.npc_insight_aggregates
  add constraint npc_insight_aggregates_insight_type_check
  check (
    insight_type in (
      'fixed_win_single',
      'try_scorer_percentage',
      'same_game_multi_percentage',
      'half_time_full_time_double'
    )
  );

alter table public.nrl_half_time_full_time_snapshots enable row level security;
alter table public.nrl_half_time_full_time_results enable row level security;
alter table public.npc_half_time_full_time_snapshots enable row level security;
alter table public.npc_half_time_full_time_results enable row level security;

drop policy if exists "NRL half time full time snapshots are readable"
  on public.nrl_half_time_full_time_snapshots;

create policy "NRL half time full time snapshots are readable"
  on public.nrl_half_time_full_time_snapshots
  for select to anon, authenticated using (true);

drop policy if exists "NRL half time full time results are readable"
  on public.nrl_half_time_full_time_results;

create policy "NRL half time full time results are readable"
  on public.nrl_half_time_full_time_results
  for select to anon, authenticated using (true);

drop policy if exists "NPC half time full time snapshots are readable"
  on public.npc_half_time_full_time_snapshots;

create policy "NPC half time full time snapshots are readable"
  on public.npc_half_time_full_time_snapshots
  for select to anon, authenticated using (true);

drop policy if exists "NPC half time full time results are readable"
  on public.npc_half_time_full_time_results;

create policy "NPC half time full time results are readable"
  on public.npc_half_time_full_time_results
  for select to anon, authenticated using (true);
