create table if not exists public.nrl_single_predictions (
  id uuid primary key default gen_random_uuid(),
  prediction_model text not null check (
    prediction_model in (
      'nrl_fixed_win_percentage_single_v1',
      'nrl_try_scorer_percentage_single_v1'
    )
  ),
  source text not null,
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  source_prediction_key text not null unique,
  source_event_id text,
  source_market_id text,
  matched_nrl_match_id uuid references public.nrl_matches(id) on delete set null,
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
  outcome_match_id uuid references public.nrl_matches(id) on delete set null,
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

drop trigger if exists set_nrl_single_predictions_updated_at
  on public.nrl_single_predictions;

create trigger set_nrl_single_predictions_updated_at
  before update on public.nrl_single_predictions
  for each row
  execute function public.set_updated_at();

create index if not exists nrl_single_predictions_current_idx
  on public.nrl_single_predictions (
    prediction_model,
    source_date desc,
    prediction_rank
  );

create index if not exists nrl_single_predictions_match_idx
  on public.nrl_single_predictions (
    matched_nrl_match_id,
    source_match_id,
    outcome_status
  );

alter table public.nrl_single_predictions enable row level security;

drop policy if exists "NRL single predictions are readable"
  on public.nrl_single_predictions;

create policy "NRL single predictions are readable"
  on public.nrl_single_predictions
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
