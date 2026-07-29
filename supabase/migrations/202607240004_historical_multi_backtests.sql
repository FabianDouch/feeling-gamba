create table if not exists public.historical_multi_backtest_recommendations (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('racing', 'ufc')),
  prediction_model text not null,
  source text not null default 'historical_backtest',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  group_key text not null,
  group_name text not null,
  model_data_cutoff_date date,
  recommendation_type text not null default 'positive'
    check (recommendation_type in ('neutral', 'positive')),
  leg_count int not null check (leg_count >= 3),
  combined_fixed_win_price numeric(14, 4),
  average_win_score numeric(12, 4),
  outcome_status text not null default 'settled'
    check (outcome_status in ('settled', 'missing_result')),
  outcome_win_return numeric(14, 4) not null default 0,
  outcome_settled_leg_count int not null default 0,
  outcome_winning_leg_count int not null default 0,
  outcome_missing_result_count int not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport, prediction_model, source, source_date, group_key, recommendation_type)
);

create table if not exists public.historical_multi_backtest_legs (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.historical_multi_backtest_recommendations(id) on delete cascade,
  leg_index int not null,
  source_entry_id text not null,
  advertised_start timestamptz,
  title text not null,
  participant_name text not null,
  participant_number int,
  fixed_win_price numeric(12, 2),
  other_participant_name text,
  other_fixed_win_price numeric(12, 2),
  price_difference numeric(12, 2),
  prediction_rank int,
  win_score numeric(12, 4),
  signal_label text,
  signal_tone text,
  bucket_label text,
  bucket_win_percentage numeric(12, 4),
  bucket_sample_size int,
  outcome_status text not null default 'settled'
    check (outcome_status in ('settled', 'missing_result')),
  outcome_result_position int,
  outcome_win_return numeric(12, 2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recommendation_id, leg_index)
);

drop trigger if exists set_historical_multi_backtest_recommendations_updated_at
  on public.historical_multi_backtest_recommendations;
create trigger set_historical_multi_backtest_recommendations_updated_at
  before update on public.historical_multi_backtest_recommendations
  for each row execute function public.set_updated_at();

drop trigger if exists set_historical_multi_backtest_legs_updated_at
  on public.historical_multi_backtest_legs;
create trigger set_historical_multi_backtest_legs_updated_at
  before update on public.historical_multi_backtest_legs
  for each row execute function public.set_updated_at();

create index if not exists historical_multi_backtest_recommendations_lookup_idx
  on public.historical_multi_backtest_recommendations (sport, prediction_model, source_date desc, outcome_status);

create index if not exists historical_multi_backtest_legs_lookup_idx
  on public.historical_multi_backtest_legs (recommendation_id, prediction_rank, outcome_status);

alter table public.historical_multi_backtest_recommendations enable row level security;
alter table public.historical_multi_backtest_legs enable row level security;

drop policy if exists "Historical multi backtest recommendations are readable"
  on public.historical_multi_backtest_recommendations;
create policy "Historical multi backtest recommendations are readable"
  on public.historical_multi_backtest_recommendations
  for select
  using (true);

drop policy if exists "Historical multi backtest legs are readable"
  on public.historical_multi_backtest_legs;
create policy "Historical multi backtest legs are readable"
  on public.historical_multi_backtest_legs
  for select
  using (true);

create or replace function public.get_historical_multi_backtest_entries(
  p_sport text,
  p_from_date date,
  p_to_date date,
  p_prediction_model text default null,
  p_max_leg_rank int default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  sport text,
  prediction_model text,
  source_date date,
  group_name text,
  model_data_cutoff_date date,
  recommendation_type text,
  leg_count int,
  combined_fixed_win_price numeric,
  average_win_score numeric,
  outcome_status text,
  outcome_win_return numeric,
  outcome_settled_leg_count int,
  outcome_winning_leg_count int,
  outcome_missing_result_count int,
  legs jsonb,
  total_count int
)
language sql
stable
as $$
  with filtered as (
    select recommendation.*
    from public.historical_multi_backtest_recommendations recommendation
    where recommendation.sport = p_sport
      and (p_prediction_model is null or recommendation.prediction_model = p_prediction_model)
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (
        p_max_leg_rank is null
        or exists (
          select 1
          from public.historical_multi_backtest_legs leg
          where leg.recommendation_id = recommendation.id
            and leg.prediction_rank <= p_max_leg_rank
        )
      )
  ),
  counted as (
    select filtered.*, count(*) over ()::int as total_count
    from filtered
  )
  select
    counted.id,
    counted.sport,
    counted.prediction_model,
    counted.source_date,
    counted.group_name,
    counted.model_data_cutoff_date,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.average_win_score,
    counted.outcome_status,
    counted.outcome_win_return,
    counted.outcome_settled_leg_count,
    counted.outcome_winning_leg_count,
    counted.outcome_missing_result_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'legIndex', leg.leg_index,
        'sourceEntryId', leg.source_entry_id,
        'advertisedStart', leg.advertised_start,
        'title', leg.title,
        'participantName', leg.participant_name,
        'participantNumber', leg.participant_number,
        'fixedWinPrice', leg.fixed_win_price,
        'otherParticipantName', leg.other_participant_name,
        'otherFixedWinPrice', leg.other_fixed_win_price,
        'priceDifference', leg.price_difference,
        'predictionRank', leg.prediction_rank,
        'winScore', leg.win_score,
        'signalLabel', leg.signal_label,
        'signalTone', leg.signal_tone,
        'bucketLabel', leg.bucket_label,
        'bucketWinPercentage', leg.bucket_win_percentage,
        'bucketSampleSize', leg.bucket_sample_size,
        'outcomeStatus', leg.outcome_status,
        'outcomeResultPosition', leg.outcome_result_position,
        'outcomeWinReturn', leg.outcome_win_return
      )
      order by leg.leg_index
    ) filter (
      where leg.id is not null
        and (p_max_leg_rank is null or leg.prediction_rank <= p_max_leg_rank)
    ), '[]'::jsonb) as legs,
    counted.total_count
  from counted
  left join public.historical_multi_backtest_legs leg
    on leg.recommendation_id = counted.id
  group by
    counted.id,
    counted.sport,
    counted.prediction_model,
    counted.source_date,
    counted.group_name,
    counted.model_data_cutoff_date,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.average_win_score,
    counted.outcome_status,
    counted.outcome_win_return,
    counted.outcome_settled_leg_count,
    counted.outcome_winning_leg_count,
    counted.outcome_missing_result_count,
    counted.total_count
  order by counted.source_date desc, counted.group_name asc, counted.prediction_model asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_historical_multi_backtest_entries(text, date, date, text, int, int, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
