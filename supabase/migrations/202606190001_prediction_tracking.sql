create table if not exists public.promotion_predictions (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'betcha',
  source_race_card_id text not null,
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  predicted_at timestamptz not null,
  prediction_signature text not null,
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  country text,
  course_name text,
  course_slug text,
  race_number int,
  race_name text,
  advertised_start timestamptz,
  source_track text,
  canonical_track text,
  rank int,
  predicted_runner_number int,
  predicted_runner_name text,
  predicted_fixed_win_price numeric,
  predicted_implied_win_percentage numeric,
  predicted_starter_count int,
  signal_label text,
  signal_detail text,
  signal_tone text,
  blended_cash_plus_bonus_average numeric,
  historical_sample_size int,
  price_bucket_label text,
  starter_bucket_label text,
  raw jsonb not null default '{}'::jsonb,
  outcome_status text not null default 'pending' check (
    outcome_status in ('pending', 'settled', 'race_not_found', 'missing_runner', 'missing_result')
  ),
  outcome_race_id uuid references public.races(id) on delete set null,
  outcome_runner_id uuid references public.runners(id) on delete set null,
  outcome_result_position int,
  outcome_starter_count int,
  outcome_win_return numeric,
  outcome_bonus_credit numeric,
  outcome_total_value_with_bonus_credit numeric,
  outcome_missing_result boolean not null default false,
  outcome_missing_runner boolean not null default false,
  outcome_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_race_card_id)
);

drop trigger if exists set_promotion_predictions_updated_at on public.promotion_predictions;

create trigger set_promotion_predictions_updated_at
  before update on public.promotion_predictions
  for each row
  execute function public.set_updated_at();

create index if not exists promotion_predictions_source_date_idx
  on public.promotion_predictions (source_date desc, source, race_code);

create index if not exists promotion_predictions_outcome_idx
  on public.promotion_predictions (outcome_status, advertised_start, race_code);

create table if not exists public.prediction_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  scope_type text not null check (scope_type in ('overall', 'race_code')),
  date_from date,
  date_to date,
  race_code text check (race_code is null or race_code in ('horse', 'harness', 'greyhound')),
  prediction_count int not null default 0,
  settled_count int not null default 0,
  pending_count int not null default 0,
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
  missing_result_count int not null default 0,
  missing_runner_count int not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_prediction_aggregates_updated_at on public.prediction_aggregates;

create trigger set_prediction_aggregates_updated_at
  before update on public.prediction_aggregates
  for each row
  execute function public.set_updated_at();

create index if not exists prediction_aggregates_lookup_idx
  on public.prediction_aggregates (scope_type, race_code);

alter table public.promotion_predictions enable row level security;
alter table public.prediction_aggregates enable row level security;

drop policy if exists "Promotion predictions are readable" on public.promotion_predictions;
drop policy if exists "Prediction aggregates are readable" on public.prediction_aggregates;

create policy "Promotion predictions are readable"
  on public.promotion_predictions
  for select
  to anon, authenticated
  using (true);

create policy "Prediction aggregates are readable"
  on public.prediction_aggregates
  for select
  to anon, authenticated
  using (true);
