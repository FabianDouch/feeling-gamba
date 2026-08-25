create table if not exists public.nrl_fixed_win_snapshot_results (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('tab', 'betcha')),
  source_snapshot_key text not null unique,
  market_snapshot_id uuid references public.nrl_market_snapshots(id) on delete cascade,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
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

drop trigger if exists set_nrl_fixed_win_snapshot_results_updated_at
  on public.nrl_fixed_win_snapshot_results;

create trigger set_nrl_fixed_win_snapshot_results_updated_at
  before update on public.nrl_fixed_win_snapshot_results
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_fixed_win_snapshot_results_status_idx
  on public.nrl_fixed_win_snapshot_results (outcome_status, snapshot_at desc);

create index if not exists nrl_fixed_win_snapshot_results_match_idx
  on public.nrl_fixed_win_snapshot_results (matched_nrl_match_id, source);

create index if not exists nrl_fixed_win_snapshot_results_source_idx
  on public.nrl_fixed_win_snapshot_results (source, snapshot_at desc);

alter table public.nrl_fixed_win_snapshot_results enable row level security;

drop policy if exists "NRL fixed win snapshot results are readable"
  on public.nrl_fixed_win_snapshot_results;

create policy "NRL fixed win snapshot results are readable"
  on public.nrl_fixed_win_snapshot_results
  for select to anon, authenticated using (true);
