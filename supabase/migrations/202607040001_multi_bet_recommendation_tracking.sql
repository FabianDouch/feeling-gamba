create table if not exists public.multi_bet_recommendations (
  id uuid primary key default gen_random_uuid(),
  prediction_model text not null,
  source text not null default 'betcha',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  predicted_at timestamptz not null,
  prediction_signature text not null,
  recommendation_type text not null check (recommendation_type in ('neutral', 'positive')),
  leg_count int not null check (leg_count >= 3),
  combined_fixed_win_price numeric(12, 2),
  average_cash_score numeric(12, 4),
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'settled', 'race_not_found', 'missing_runner', 'missing_result')),
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_settled_leg_count int not null default 0,
  outcome_winning_leg_count int not null default 0,
  outcome_missing_result_count int not null default 0,
  outcome_missing_runner_count int not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_model, source, source_date, recommendation_type)
);

create table if not exists public.multi_bet_recommendation_legs (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.multi_bet_recommendations(id) on delete cascade,
  leg_index int not null,
  source_race_card_id text not null,
  country text,
  race_code text,
  course_name text,
  course_slug text,
  race_number int,
  race_name text,
  advertised_start timestamptz,
  predicted_runner_number int,
  predicted_runner_name text,
  predicted_fixed_win_price numeric(12, 2),
  predicted_starter_count int,
  cash_average_score numeric(12, 4),
  signal_label text,
  signal_tone text,
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'settled', 'race_not_found', 'missing_runner', 'missing_result')),
  outcome_race_id uuid references public.races(id) on delete set null,
  outcome_runner_id uuid references public.runners(id) on delete set null,
  outcome_result_position int,
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recommendation_id, leg_index)
);

drop trigger if exists set_multi_bet_recommendations_updated_at on public.multi_bet_recommendations;
create trigger set_multi_bet_recommendations_updated_at
  before update on public.multi_bet_recommendations
  for each row execute function public.set_updated_at();

drop trigger if exists set_multi_bet_recommendation_legs_updated_at on public.multi_bet_recommendation_legs;
create trigger set_multi_bet_recommendation_legs_updated_at
  before update on public.multi_bet_recommendation_legs
  for each row execute function public.set_updated_at();

alter table public.multi_bet_recommendations enable row level security;
alter table public.multi_bet_recommendation_legs enable row level security;

drop policy if exists "Multi bet recommendations are readable" on public.multi_bet_recommendations;
create policy "Multi bet recommendations are readable"
  on public.multi_bet_recommendations
  for select
  using (true);

drop policy if exists "Multi bet recommendation legs are readable" on public.multi_bet_recommendation_legs;
create policy "Multi bet recommendation legs are readable"
  on public.multi_bet_recommendation_legs
  for select
  using (true);

create index if not exists multi_bet_recommendations_history_idx
  on public.multi_bet_recommendations (prediction_model, source_date desc, recommendation_type, outcome_status);

create index if not exists multi_bet_recommendation_legs_filter_idx
  on public.multi_bet_recommendation_legs (recommendation_id, country, race_code, course_slug);

create or replace function public.get_multi_bet_recommendation_summary(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null,
  p_recommendation_type text default null
)
returns table (
  prediction_model text,
  recommendation_type text,
  date_from date,
  date_to date,
  prediction_count int,
  settled_count int,
  pending_count int,
  missing_result_count int,
  missing_runner_count int,
  total_stake numeric,
  total_return numeric,
  net_return numeric,
  average_return_per_dollar numeric,
  roi_percentage numeric,
  wins int,
  win_percentage numeric
)
language sql
stable
as $$
  with filtered as (
    select recommendation.*
    from public.multi_bet_recommendations recommendation
    where recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (p_recommendation_type is null or recommendation.recommendation_type = p_recommendation_type)
      and (
        (p_country is null and p_race_code is null and p_course_slug is null)
        or exists (
          select 1
          from public.multi_bet_recommendation_legs leg
          where leg.recommendation_id = recommendation.id
            and (p_country is null or leg.country = p_country)
            and (p_race_code is null or leg.race_code = p_race_code)
            and (p_course_slug is null or leg.course_slug = p_course_slug)
        )
      )
  ),
  summary as (
    select
      min(source_date) as date_from,
      max(source_date) as date_to,
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      coalesce(sum(outcome_missing_result_count), 0)::int
        + count(*) filter (where outcome_status = 'race_not_found')::int as missing_result_count,
      coalesce(sum(outcome_missing_runner_count), 0)::int as missing_runner_count,
      count(*) filter (where outcome_status = 'settled')::numeric as total_stake,
      coalesce(sum(outcome_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      count(*) filter (where outcome_status = 'settled' and outcome_win_return > 0)::int as wins
    from filtered
  )
  select
    p_prediction_model as prediction_model,
    coalesce(p_recommendation_type, 'all') as recommendation_type,
    summary.date_from,
    summary.date_to,
    summary.prediction_count,
    summary.settled_count,
    summary.pending_count,
    summary.missing_result_count,
    summary.missing_runner_count,
    summary.total_stake,
    summary.total_return,
    summary.total_return - summary.total_stake as net_return,
    case when summary.total_stake > 0 then round(summary.total_return / summary.total_stake, 4) else 0 end,
    case when summary.total_stake > 0 then round(((summary.total_return - summary.total_stake) / summary.total_stake) * 100, 2) else 0 end,
    summary.wins,
    case when summary.settled_count > 0 then round((summary.wins::numeric / summary.settled_count::numeric) * 100, 2) else 0 end
  from summary;
$$;

grant execute on function public.get_multi_bet_recommendation_summary(text, date, date, text, text, text, text)
  to anon, authenticated;

create or replace function public.get_multi_bet_recommendation_entries(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null,
  p_recommendation_type text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  prediction_model text,
  source_date date,
  predicted_at timestamptz,
  recommendation_type text,
  leg_count int,
  combined_fixed_win_price numeric,
  average_cash_score numeric,
  outcome_status text,
  outcome_win_return numeric,
  outcome_settled_leg_count int,
  outcome_winning_leg_count int,
  outcome_missing_result_count int,
  outcome_missing_runner_count int,
  legs jsonb,
  total_count int
)
language sql
stable
as $$
  with filtered as (
    select recommendation.*
    from public.multi_bet_recommendations recommendation
    where recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (p_recommendation_type is null or recommendation.recommendation_type = p_recommendation_type)
      and (
        (p_country is null and p_race_code is null and p_course_slug is null)
        or exists (
          select 1
          from public.multi_bet_recommendation_legs leg
          where leg.recommendation_id = recommendation.id
            and (p_country is null or leg.country = p_country)
            and (p_race_code is null or leg.race_code = p_race_code)
            and (p_course_slug is null or leg.course_slug = p_course_slug)
        )
      )
  ),
  counted as (
    select filtered.*, count(*) over ()::int as total_count
    from filtered
  )
  select
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.predicted_at,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.average_cash_score,
    counted.outcome_status,
    counted.outcome_win_return,
    counted.outcome_settled_leg_count,
    counted.outcome_winning_leg_count,
    counted.outcome_missing_result_count,
    counted.outcome_missing_runner_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'legIndex', leg.leg_index,
        'sourceRaceCardId', leg.source_race_card_id,
        'country', leg.country,
        'raceCode', leg.race_code,
        'courseName', leg.course_name,
        'courseSlug', leg.course_slug,
        'raceNumber', leg.race_number,
        'raceName', leg.race_name,
        'advertisedStart', leg.advertised_start,
        'predictedRunnerNumber', leg.predicted_runner_number,
        'predictedRunnerName', leg.predicted_runner_name,
        'predictedFixedWinPrice', leg.predicted_fixed_win_price,
        'cashAverageScore', leg.cash_average_score,
        'signalLabel', leg.signal_label,
        'signalTone', leg.signal_tone,
        'outcomeStatus', leg.outcome_status,
        'outcomeResultPosition', leg.outcome_result_position,
        'outcomeWinReturn', leg.outcome_win_return
      )
      order by leg.leg_index
    ) filter (where leg.id is not null), '[]'::jsonb) as legs,
    counted.total_count
  from counted
  left join public.multi_bet_recommendation_legs leg
    on leg.recommendation_id = counted.id
  group by
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.predicted_at,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.average_cash_score,
    counted.outcome_status,
    counted.outcome_win_return,
    counted.outcome_settled_leg_count,
    counted.outcome_winning_leg_count,
    counted.outcome_missing_result_count,
    counted.outcome_missing_runner_count,
    counted.total_count
  order by
    case
      when counted.outcome_status = 'settled' and counted.outcome_win_return > 0 then 0
      when counted.outcome_status = 'settled' then 1
      when counted.outcome_status = 'pending' then 2
      else 3
    end,
    counted.source_date desc,
    counted.predicted_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_multi_bet_recommendation_entries(text, date, date, text, text, text, text, int, int)
  to anon, authenticated;
