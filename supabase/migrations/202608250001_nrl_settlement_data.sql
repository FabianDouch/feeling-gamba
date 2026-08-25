create table if not exists public.nrl_teams (
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

drop trigger if exists set_nrl_teams_updated_at on public.nrl_teams;

create trigger set_nrl_teams_updated_at
  before update on public.nrl_teams
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_teams_team_key_idx
  on public.nrl_teams (team_key);

create table if not exists public.nrl_players (
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

drop trigger if exists set_nrl_players_updated_at on public.nrl_players;

create trigger set_nrl_players_updated_at
  before update on public.nrl_players
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_players_player_key_idx
  on public.nrl_players (player_key);

create index if not exists nrl_players_latest_team_idx
  on public.nrl_players (source, latest_team_source_id);

create table if not exists public.nrl_matches (
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

drop trigger if exists set_nrl_matches_updated_at on public.nrl_matches;

create trigger set_nrl_matches_updated_at
  before update on public.nrl_matches
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_matches_kickoff_idx
  on public.nrl_matches (kickoff_at desc);

create index if not exists nrl_matches_round_idx
  on public.nrl_matches (season, round_number);

create index if not exists nrl_matches_team_time_idx
  on public.nrl_matches (
    home_team_source_id,
    away_team_source_id,
    kickoff_at
  );

create table if not exists public.nrl_try_scorers (
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

drop trigger if exists set_nrl_try_scorers_updated_at on public.nrl_try_scorers;

create trigger set_nrl_try_scorers_updated_at
  before update on public.nrl_try_scorers
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_try_scorers_match_idx
  on public.nrl_try_scorers (source, source_match_id, game_seconds);

create index if not exists nrl_try_scorers_player_idx
  on public.nrl_try_scorers (source, source_player_id);

create table if not exists public.nrl_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('tab', 'betcha')),
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
  home_fixed_win_price numeric,
  away_fixed_win_price numeric,
  favourite_team_name text,
  favourite_fixed_win_price numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_nrl_market_snapshots_updated_at
  on public.nrl_market_snapshots;

create trigger set_nrl_market_snapshots_updated_at
  before update on public.nrl_market_snapshots
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_market_snapshots_event_idx
  on public.nrl_market_snapshots (source, source_event_id, snapshot_at desc);

create index if not exists nrl_market_snapshots_matched_match_idx
  on public.nrl_market_snapshots (matched_nrl_match_id);

alter table public.nrl_teams enable row level security;
alter table public.nrl_players enable row level security;
alter table public.nrl_matches enable row level security;
alter table public.nrl_try_scorers enable row level security;
alter table public.nrl_market_snapshots enable row level security;

drop policy if exists "NRL teams are readable" on public.nrl_teams;
drop policy if exists "NRL players are readable" on public.nrl_players;
drop policy if exists "NRL matches are readable" on public.nrl_matches;
drop policy if exists "NRL try scorers are readable" on public.nrl_try_scorers;
drop policy if exists "NRL market snapshots are readable"
  on public.nrl_market_snapshots;

create policy "NRL teams are readable" on public.nrl_teams
  for select to anon, authenticated using (true);

create policy "NRL players are readable" on public.nrl_players
  for select to anon, authenticated using (true);

create policy "NRL matches are readable" on public.nrl_matches
  for select to anon, authenticated using (true);

create policy "NRL try scorers are readable" on public.nrl_try_scorers
  for select to anon, authenticated using (true);

create policy "NRL market snapshots are readable" on public.nrl_market_snapshots
  for select to anon, authenticated using (true);
