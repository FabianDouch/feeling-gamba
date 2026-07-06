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
  win_percentage numeric,
  second_percentage numeric,
  third_percentage numeric,
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
  aggregate_values as (
    select
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 1)::int as wins,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 2)::int as seconds,
      count(*) filter (where outcome_status = 'settled' and outcome_result_position = 3)::int as thirds,
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
    from filtered_predictions
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
    case when settled_count > 0 then round((wins::numeric / settled_count::numeric) * 100, 2) else 0 end as win_percentage,
    case when settled_count > 0 then round((seconds::numeric / settled_count::numeric) * 100, 2) else 0 end as second_percentage,
    case when settled_count > 0 then round((thirds::numeric / settled_count::numeric) * 100, 2) else 0 end as third_percentage,
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

create or replace function public.get_prediction_history_entries(
  p_prediction_model text,
  p_from_date date default null,
  p_to_date date default null,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  advertised_start timestamptz,
  blended_cash_plus_bonus_average numeric,
  country text,
  course_name text,
  course_slug text,
  historical_sample_size int,
  id uuid,
  outcome_bonus_credit numeric,
  outcome_result_position int,
  outcome_starter_count int,
  outcome_status text,
  outcome_total_value_with_bonus_credit numeric,
  outcome_win_return numeric,
  prediction_model text,
  predicted_at timestamptz,
  predicted_fixed_win_price numeric,
  predicted_runner_name text,
  predicted_runner_number int,
  predicted_starter_count int,
  race_code text,
  race_name text,
  race_number int,
  rank int,
  signal_label text,
  source_date date,
  total_count int
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
  )
  select
    advertised_start,
    blended_cash_plus_bonus_average,
    country,
    course_name,
    course_slug,
    historical_sample_size,
    id,
    outcome_bonus_credit,
    outcome_result_position,
    outcome_starter_count,
    outcome_status,
    outcome_total_value_with_bonus_credit,
    outcome_win_return,
    prediction_model,
    predicted_at,
    predicted_fixed_win_price,
    predicted_runner_name,
    predicted_runner_number,
    predicted_starter_count,
    race_code,
    race_name,
    race_number,
    rank,
    signal_label,
    source_date,
    (count(*) over())::int as total_count
  from filtered_predictions
  order by
    case
      when outcome_status = 'settled' and outcome_result_position = 1 then 0
      when outcome_status = 'settled' and outcome_result_position = 2 then 1
      when outcome_status = 'settled' and outcome_result_position = 3 then 2
      when outcome_status = 'settled' then 3
      when outcome_status = 'pending' then 4
      else 5
    end asc,
    advertised_start desc nulls last,
    predicted_at desc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_prediction_history_entries(text, date, date, text, text, text, int, int)
  to anon, authenticated;

create index if not exists promotion_predictions_history_summary_filter_idx
  on public.promotion_predictions (prediction_model, source_date desc, country, race_code, course_slug);

create index if not exists promotion_predictions_history_outcome_order_idx
  on public.promotion_predictions (prediction_model, source_date desc, outcome_status, outcome_result_position);
