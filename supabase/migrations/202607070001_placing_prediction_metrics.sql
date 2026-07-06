alter table public.insight_aggregates
  add column if not exists place_eligible_selections int not null default 0,
  add column if not exists place_hits int not null default 0,
  add column if not exists place_percentage numeric not null default 0;

drop function if exists public.get_prediction_performance_summary(text, text, int, text);

create or replace function public.get_prediction_performance_summary(
  p_prediction_model text,
  p_race_code text default null,
  p_max_rank int default null,
  p_signal_filter text default 'all'
)
returns table (
  prediction_model text,
  race_code text,
  rank_filter int,
  signal_filter text,
  prediction_count int,
  settled_count int,
  pending_count int,
  wins int,
  seconds int,
  thirds int,
  place_eligible_count int,
  places int,
  win_percentage numeric,
  second_percentage numeric,
  third_percentage numeric,
  place_percentage numeric,
  total_stake numeric,
  total_return numeric,
  net_return numeric,
  average_return_per_dollar numeric,
  roi_percentage numeric,
  total_bonus_credit numeric,
  total_value_with_bonus_credit numeric,
  average_value_per_dollar_with_bonus_credit numeric,
  bonus_credit_percentage numeric,
  missing_result_count int,
  missing_runner_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_predictions as (
    select *
    from public.promotion_predictions
    where prediction_model = p_prediction_model
      and (p_race_code is null or race_code = p_race_code)
      and (p_max_rank is null or rank <= p_max_rank)
      and (
        coalesce(p_signal_filter, 'all') = 'all'
        or (
          p_signal_filter = 'positive_only'
          and signal_label = 'Positive candidate'
        )
        or (
          p_signal_filter = 'neutral_or_better'
          and signal_label in ('Positive candidate', 'Neutral candidate')
        )
      )
  ),
  place_scored_predictions as (
    select
      *,
      coalesce(outcome_starter_count, predicted_starter_count, 0) as place_starter_count,
      case
        when country = 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 7 then 3
        when country = 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 4 then 2
        when coalesce(country, '') <> 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 8 then 3
        when coalesce(country, '') <> 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 5 then 2
        else 0
      end as place_payout_depth
    from filtered_predictions
  ),
  aggregate_values as (
    select
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 1)::int as wins,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 2)::int as seconds,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 3)::int as thirds,
      count(*) filter (
        where outcome_status = 'settled'
          and place_payout_depth > 0
      )::int as place_eligible_count,
      count(*) filter (
        where outcome_status = 'settled'
          and place_payout_depth > 0
          and outcome_result_position between 1 and place_payout_depth
      )::int as places,
      count(*) filter (
        where outcome_status in ('missing_result', 'race_not_found')
      )::int as missing_result_count,
      count(*) filter (where outcome_status = 'missing_runner')::int as missing_runner_count,
      coalesce(sum(1) filter (where outcome_status = 'settled'), 0)::numeric as total_stake,
      coalesce(sum(outcome_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      coalesce(sum(outcome_bonus_credit) filter (where outcome_status = 'settled'), 0)::numeric as total_bonus_credit,
      coalesce(sum(outcome_total_value_with_bonus_credit) filter (where outcome_status = 'settled'), 0)::numeric as total_value_with_bonus_credit,
      count(*) filter (
        where outcome_status = 'settled'
          and coalesce(outcome_bonus_credit, 0) > 0
      )::int as bonus_credit_hits
    from place_scored_predictions
  )
  select
    p_prediction_model as prediction_model,
    p_race_code as race_code,
    p_max_rank as rank_filter,
    coalesce(p_signal_filter, 'all') as signal_filter,
    prediction_count,
    settled_count,
    pending_count,
    wins,
    seconds,
    thirds,
    place_eligible_count,
    places,
    case when settled_count > 0 then round((wins::numeric / settled_count::numeric) * 100, 2) else 0 end as win_percentage,
    case when settled_count > 0 then round((seconds::numeric / settled_count::numeric) * 100, 2) else 0 end as second_percentage,
    case when settled_count > 0 then round((thirds::numeric / settled_count::numeric) * 100, 2) else 0 end as third_percentage,
    case when place_eligible_count > 0 then round((places::numeric / place_eligible_count::numeric) * 100, 2) else 0 end as place_percentage,
    round(total_stake, 2) as total_stake,
    round(total_return, 2) as total_return,
    round(total_return - total_stake, 2) as net_return,
    case when total_stake > 0 then round(total_return / total_stake, 3) else 0 end as average_return_per_dollar,
    case when total_stake > 0 then round(((total_return - total_stake) / total_stake) * 100, 2) else 0 end as roi_percentage,
    round(total_bonus_credit, 2) as total_bonus_credit,
    round(total_value_with_bonus_credit, 2) as total_value_with_bonus_credit,
    case when total_stake > 0 then round(total_value_with_bonus_credit / total_stake, 3) else 0 end as average_value_per_dollar_with_bonus_credit,
    case when settled_count > 0 then round((bonus_credit_hits::numeric / settled_count::numeric) * 100, 2) else 0 end as bonus_credit_percentage,
    missing_result_count,
    missing_runner_count
  from aggregate_values;
$$;

grant execute on function public.get_prediction_performance_summary(text, text, int, text)
  to anon, authenticated;

drop function if exists public.get_prediction_history_summary(text, date, date, text, text, text);

create or replace function public.get_prediction_history_summary(
  p_prediction_model text,
  p_from_date date default null,
  p_to_date date default null,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null
)
returns table (
  prediction_model text,
  date_from date,
  date_to date,
  country text,
  race_code text,
  course_slug text,
  prediction_count int,
  settled_count int,
  pending_count int,
  wins int,
  seconds int,
  thirds int,
  place_eligible_count int,
  places int,
  win_percentage numeric,
  second_percentage numeric,
  third_percentage numeric,
  place_percentage numeric,
  total_stake numeric,
  total_return numeric,
  net_return numeric,
  average_return_per_dollar numeric,
  roi_percentage numeric,
  total_bonus_credit numeric,
  total_value_with_bonus_credit numeric,
  average_value_per_dollar_with_bonus_credit numeric,
  bonus_credit_percentage numeric,
  missing_result_count int,
  missing_runner_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_predictions as (
    select *
    from public.promotion_predictions
    where prediction_model = p_prediction_model
      and (p_from_date is null or source_date >= p_from_date)
      and (p_to_date is null or source_date <= p_to_date)
      and (p_country is null or country = p_country)
      and (p_race_code is null or race_code = p_race_code)
      and (p_course_slug is null or course_slug = p_course_slug)
  ),
  place_scored_predictions as (
    select
      *,
      case
        when country = 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 7 then 3
        when country = 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 4 then 2
        when coalesce(country, '') <> 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 8 then 3
        when coalesce(country, '') <> 'HK' and coalesce(outcome_starter_count, predicted_starter_count, 0) >= 5 then 2
        else 0
      end as place_payout_depth
    from filtered_predictions
  ),
  aggregate_values as (
    select
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 1)::int as wins,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 2)::int as seconds,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 3)::int as thirds,
      count(*) filter (
        where outcome_status = 'settled'
          and place_payout_depth > 0
      )::int as place_eligible_count,
      count(*) filter (
        where outcome_status = 'settled'
          and place_payout_depth > 0
          and outcome_result_position between 1 and place_payout_depth
      )::int as places,
      count(*) filter (
        where outcome_status in ('missing_result', 'race_not_found')
      )::int as missing_result_count,
      count(*) filter (where outcome_status = 'missing_runner')::int as missing_runner_count,
      coalesce(sum(1) filter (where outcome_status = 'settled'), 0)::numeric as total_stake,
      coalesce(sum(outcome_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      coalesce(sum(outcome_bonus_credit) filter (where outcome_status = 'settled'), 0)::numeric as total_bonus_credit,
      coalesce(sum(outcome_total_value_with_bonus_credit) filter (where outcome_status = 'settled'), 0)::numeric as total_value_with_bonus_credit,
      count(*) filter (
        where outcome_status = 'settled'
          and coalesce(outcome_bonus_credit, 0) > 0
      )::int as bonus_credit_hits
    from place_scored_predictions
  )
  select
    p_prediction_model as prediction_model,
    p_from_date as date_from,
    p_to_date as date_to,
    p_country as country,
    p_race_code as race_code,
    p_course_slug as course_slug,
    prediction_count,
    settled_count,
    pending_count,
    wins,
    seconds,
    thirds,
    place_eligible_count,
    places,
    case when settled_count > 0 then round((wins::numeric / settled_count::numeric) * 100, 2) else 0 end as win_percentage,
    case when settled_count > 0 then round((seconds::numeric / settled_count::numeric) * 100, 2) else 0 end as second_percentage,
    case when settled_count > 0 then round((thirds::numeric / settled_count::numeric) * 100, 2) else 0 end as third_percentage,
    case when place_eligible_count > 0 then round((places::numeric / place_eligible_count::numeric) * 100, 2) else 0 end as place_percentage,
    round(total_stake, 2) as total_stake,
    round(total_return, 2) as total_return,
    round(total_return - total_stake, 2) as net_return,
    case when total_stake > 0 then round(total_return / total_stake, 3) else 0 end as average_return_per_dollar,
    case when total_stake > 0 then round(((total_return - total_stake) / total_stake) * 100, 2) else 0 end as roi_percentage,
    round(total_bonus_credit, 2) as total_bonus_credit,
    round(total_value_with_bonus_credit, 2) as total_value_with_bonus_credit,
    case when total_stake > 0 then round(total_value_with_bonus_credit / total_stake, 3) else 0 end as average_value_per_dollar_with_bonus_credit,
    case when settled_count > 0 then round((bonus_credit_hits::numeric / settled_count::numeric) * 100, 2) else 0 end as bonus_credit_percentage,
    missing_result_count,
    missing_runner_count
  from aggregate_values;
$$;

grant execute on function public.get_prediction_history_summary(text, date, date, text, text, text)
  to anon, authenticated;
