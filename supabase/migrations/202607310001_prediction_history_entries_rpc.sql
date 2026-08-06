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

notify pgrst, 'reload schema';
