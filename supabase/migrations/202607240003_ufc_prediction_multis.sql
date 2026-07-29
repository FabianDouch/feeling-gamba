create table if not exists public.ufc_multi_recommendations (
  id uuid primary key default gen_random_uuid(),
  prediction_model text not null,
  source text not null default 'betcha',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  source_card_id text not null,
  source_card_name text not null,
  source_card_slug text,
  predicted_at timestamptz not null,
  prediction_signature text not null,
  recommendation_type text not null default 'positive'
    check (recommendation_type in ('neutral', 'positive')),
  leg_count int not null check (leg_count >= 3),
  first_fight_start timestamptz,
  lock_cutoff_at timestamptz,
  combined_fixed_win_price numeric(12, 2),
  average_win_score numeric(12, 4),
  scope_type text not null check (
    scope_type in (
      'favourite_price_bucket',
      'other_fighter_price_bucket',
      'price_difference_bucket'
    )
  ),
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'settled', 'missing_result')),
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_settled_leg_count int not null default 0,
  outcome_winning_leg_count int not null default 0,
  outcome_missing_result_count int not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_model, source, source_date, source_card_id, recommendation_type)
);

create table if not exists public.ufc_multi_recommendation_legs (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.ufc_multi_recommendations(id) on delete cascade,
  leg_index int not null,
  source_event_id text not null,
  source_market_id text,
  advertised_start timestamptz,
  predicted_fighter_name text not null,
  predicted_entrant_id text,
  predicted_fixed_win_price numeric(12, 2),
  other_fighter_name text,
  other_entrant_id text,
  other_fighter_fixed_win_price numeric(12, 2),
  price_difference numeric(12, 2),
  prediction_rank int,
  win_score numeric(12, 4),
  signal_label text,
  signal_tone text,
  bucket_label text,
  bucket_win_percentage numeric(12, 4),
  bucket_sample_size int,
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'settled', 'missing_result')),
  outcome_fight_id uuid references public.ufc_fight_entries(id) on delete set null,
  outcome_winner_name text,
  outcome_favourite_won boolean,
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recommendation_id, leg_index)
);

create table if not exists public.user_locked_ufc_multi_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null default 'betcha',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  source_card_id text not null,
  source_card_name text not null,
  source_card_slug text,
  prediction_model text not null,
  recommendation_type text not null default 'positive'
    check (recommendation_type in ('neutral', 'positive')),
  locked_at timestamptz not null default now(),
  lock_cutoff_at timestamptz not null,
  generated_at timestamptz,
  generated_at_nz text,
  leg_count int not null check (leg_count >= 3),
  combined_fixed_win_price numeric(12, 2),
  average_win_score numeric(12, 4),
  legs jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_date, source_card_id, prediction_model)
);

drop trigger if exists set_ufc_multi_recommendations_updated_at
  on public.ufc_multi_recommendations;
create trigger set_ufc_multi_recommendations_updated_at
  before update on public.ufc_multi_recommendations
  for each row execute function public.set_updated_at();

drop trigger if exists set_ufc_multi_recommendation_legs_updated_at
  on public.ufc_multi_recommendation_legs;
create trigger set_ufc_multi_recommendation_legs_updated_at
  before update on public.ufc_multi_recommendation_legs
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_locked_ufc_multi_recommendations_updated_at
  on public.user_locked_ufc_multi_recommendations;
create trigger set_user_locked_ufc_multi_recommendations_updated_at
  before update on public.user_locked_ufc_multi_recommendations
  for each row execute function public.set_updated_at();

create index if not exists ufc_multi_recommendations_history_idx
  on public.ufc_multi_recommendations (prediction_model, source_date desc, source_card_id, outcome_status);

create index if not exists ufc_multi_recommendation_legs_lookup_idx
  on public.ufc_multi_recommendation_legs (recommendation_id, prediction_rank, outcome_status);

create index if not exists user_locked_ufc_multi_recommendations_lookup_idx
  on public.user_locked_ufc_multi_recommendations (user_id, source_date desc, prediction_model, source_card_id);

alter table public.ufc_multi_recommendations enable row level security;
alter table public.ufc_multi_recommendation_legs enable row level security;
alter table public.user_locked_ufc_multi_recommendations enable row level security;

drop policy if exists "UFC multi recommendations are readable"
  on public.ufc_multi_recommendations;
create policy "UFC multi recommendations are readable"
  on public.ufc_multi_recommendations
  for select
  using (true);

drop policy if exists "UFC multi recommendation legs are readable"
  on public.ufc_multi_recommendation_legs;
create policy "UFC multi recommendation legs are readable"
  on public.ufc_multi_recommendation_legs
  for select
  using (true);

drop policy if exists "Users can read own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations;
drop policy if exists "Users can insert own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations;
drop policy if exists "Users can delete own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations;

create policy "Users can read own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and now() < lock_cutoff_at
  );

create policy "Users can delete own locked UFC multi recommendations"
  on public.user_locked_ufc_multi_recommendations
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_ufc_multi_recommendation_summary(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_max_leg_rank int default null
)
returns table (
  prediction_model text,
  date_from date,
  date_to date,
  prediction_count int,
  recommendation_type text,
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
    from public.ufc_multi_recommendations recommendation
    where recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (
        p_max_leg_rank is null
        or exists (
          select 1
          from public.ufc_multi_recommendation_legs leg
          where leg.recommendation_id = recommendation.id
            and leg.prediction_rank <= p_max_leg_rank
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
      coalesce(sum(outcome_missing_result_count), 0)::int as missing_result_count,
      count(*) filter (where outcome_status = 'settled')::numeric as total_stake,
      coalesce(sum(outcome_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      count(*) filter (where outcome_status = 'settled' and outcome_win_return > 0)::int as wins
    from filtered
  )
  select
    p_prediction_model as prediction_model,
    summary.date_from,
    summary.date_to,
    summary.prediction_count,
    null::text as recommendation_type,
    summary.settled_count,
    summary.pending_count,
    summary.missing_result_count,
    0::int as missing_runner_count,
    summary.total_stake,
    summary.total_return,
    summary.total_return - summary.total_stake as net_return,
    case when summary.total_stake > 0 then round(summary.total_return / summary.total_stake, 4) else 0 end,
    case when summary.total_stake > 0 then round(((summary.total_return - summary.total_stake) / summary.total_stake) * 100, 2) else 0 end,
    summary.wins,
    case when summary.settled_count > 0 then round((summary.wins::numeric / summary.settled_count::numeric) * 100, 2) else 0 end
  from summary;
$$;

grant execute on function public.get_ufc_multi_recommendation_summary(text, date, date, int)
  to anon, authenticated;

create or replace function public.get_ufc_multi_recommendation_entries(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_max_leg_rank int default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  prediction_model text,
  source_date date,
  source_card_name text,
  predicted_at timestamptz,
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
    from public.ufc_multi_recommendations recommendation
    where recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (
        p_max_leg_rank is null
        or exists (
          select 1
          from public.ufc_multi_recommendation_legs leg
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
    counted.prediction_model,
    counted.source_date,
    counted.source_card_name,
    counted.predicted_at,
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
        'sourceEventId', leg.source_event_id,
        'sourceMarketId', leg.source_market_id,
        'advertisedStart', leg.advertised_start,
        'predictedFighterName', leg.predicted_fighter_name,
        'predictedEntrantId', leg.predicted_entrant_id,
        'predictedFixedWinPrice', leg.predicted_fixed_win_price,
        'otherFighterName', leg.other_fighter_name,
        'otherFighterFixedWinPrice', leg.other_fighter_fixed_win_price,
        'priceDifference', leg.price_difference,
        'predictionRank', leg.prediction_rank,
        'winScore', leg.win_score,
        'signalLabel', leg.signal_label,
        'signalTone', leg.signal_tone,
        'bucketLabel', leg.bucket_label,
        'bucketWinPercentage', leg.bucket_win_percentage,
        'bucketSampleSize', leg.bucket_sample_size,
        'outcomeStatus', leg.outcome_status,
        'outcomeWinnerName', leg.outcome_winner_name,
        'outcomeFavouriteWon', leg.outcome_favourite_won,
        'outcomeWinReturn', leg.outcome_win_return
      )
      order by leg.leg_index
    ) filter (
      where leg.id is not null
        and (p_max_leg_rank is null or leg.prediction_rank <= p_max_leg_rank)
    ), '[]'::jsonb) as legs,
    counted.total_count
  from counted
  left join public.ufc_multi_recommendation_legs leg
    on leg.recommendation_id = counted.id
  group by
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.source_card_name,
    counted.predicted_at,
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
  order by
    case counted.outcome_status
      when 'settled' then 0
      when 'missing_result' then 1
      else 2
    end,
    counted.source_date desc,
    counted.predicted_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_ufc_multi_recommendation_entries(text, date, date, int, int, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
