create or replace function public.get_multi_bet_recommendation_summary(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null,
  p_recommendation_type text default null,
  p_max_leg_rank int default null
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
  parent_recommendations as (
    select
      recommendation.source_date,
      recommendation.outcome_status,
      (
        recommendation.outcome_missing_result_count
        + case when recommendation.outcome_status = 'race_not_found' then 1 else 0 end
      )::int as row_missing_result_count,
      recommendation.outcome_missing_runner_count::int as row_missing_runner_count,
      recommendation.outcome_win_return::numeric as row_win_return
    from filtered recommendation
    where p_max_leg_rank is null
  ),
  ranked_base as (
    select
      recommendation.id,
      recommendation.source_date,
      count(*)::int as row_leg_count,
      count(*) filter (where leg.outcome_status = 'settled')::int as row_settled_leg_count,
      count(*) filter (where leg.outcome_status = 'settled' and leg.outcome_result_position = 1)::int as row_winning_leg_count,
      count(*) filter (where leg.outcome_status = 'pending')::int as row_pending_leg_count,
      count(*) filter (where leg.outcome_status in ('missing_result', 'race_not_found'))::int as row_missing_result_count,
      count(*) filter (where leg.outcome_status = 'missing_runner')::int as row_missing_runner_count,
      round(exp(sum(
        case
          when leg.predicted_fixed_win_price > 0 then ln(leg.predicted_fixed_win_price::double precision)
          else null
        end
      ))::numeric, 2) as row_combined_fixed_win_price
    from filtered recommendation
    join public.multi_bet_recommendation_legs leg
      on leg.recommendation_id = recommendation.id
    where p_max_leg_rank is not null
      and coalesce(leg.prediction_rank, leg.leg_index) <= p_max_leg_rank
    group by recommendation.id, recommendation.source_date
    having count(*) = p_max_leg_rank
      and count(*) filter (
        where leg.predicted_fixed_win_price is null
           or leg.predicted_fixed_win_price <= 0
      ) = 0
  ),
  ranked_recommendations as (
    select
      ranked_base.source_date,
      case
        when ranked_base.row_pending_leg_count > 0 then 'pending'
        when ranked_base.row_missing_runner_count > 0 then 'missing_runner'
        when ranked_base.row_missing_result_count > 0 then 'missing_result'
        else 'settled'
      end as outcome_status,
      ranked_base.row_missing_result_count,
      ranked_base.row_missing_runner_count,
      case
        when ranked_base.row_settled_leg_count = ranked_base.row_leg_count
          and ranked_base.row_winning_leg_count = ranked_base.row_leg_count
          then ranked_base.row_combined_fixed_win_price
        else 0
      end as row_win_return
    from ranked_base
  ),
  recommendation_rows as (
    select * from parent_recommendations
    union all
    select * from ranked_recommendations
  ),
  summary as (
    select
      min(recommendation_rows.source_date) as date_from,
      max(recommendation_rows.source_date) as date_to,
      count(*)::int as prediction_count,
      count(*) filter (where recommendation_rows.outcome_status = 'settled')::int as settled_count,
      count(*) filter (where recommendation_rows.outcome_status = 'pending')::int as pending_count,
      coalesce(sum(recommendation_rows.row_missing_result_count), 0)::int as missing_result_count,
      coalesce(sum(recommendation_rows.row_missing_runner_count), 0)::int as missing_runner_count,
      count(*) filter (where recommendation_rows.outcome_status = 'settled')::numeric as total_stake,
      coalesce(sum(recommendation_rows.row_win_return) filter (where recommendation_rows.outcome_status = 'settled'), 0)::numeric as total_return,
      count(*) filter (
        where recommendation_rows.outcome_status = 'settled'
          and recommendation_rows.row_win_return > 0
      )::int as wins
    from recommendation_rows
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

grant execute on function public.get_multi_bet_recommendation_summary(text, date, date, text, text, text, text, int)
  to anon, authenticated;

create or replace function public.get_multi_bet_recommendation_entries(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_country text default null,
  p_race_code text default null,
  p_course_slug text default null,
  p_recommendation_type text default null,
  p_max_leg_rank int default null,
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
  parent_rows as (
    select
      recommendation.id,
      recommendation.prediction_model,
      recommendation.source_date,
      recommendation.predicted_at,
      recommendation.recommendation_type,
      recommendation.leg_count,
      recommendation.combined_fixed_win_price,
      recommendation.average_cash_score,
      recommendation.outcome_status,
      recommendation.outcome_win_return,
      recommendation.outcome_settled_leg_count,
      recommendation.outcome_winning_leg_count,
      (
        recommendation.outcome_missing_result_count
        + case when recommendation.outcome_status = 'race_not_found' then 1 else 0 end
      )::int as outcome_missing_result_count,
      recommendation.outcome_missing_runner_count
    from filtered recommendation
    where p_max_leg_rank is null
  ),
  ranked_base as (
    select
      recommendation.id,
      recommendation.prediction_model,
      recommendation.source_date,
      recommendation.predicted_at,
      recommendation.recommendation_type,
      count(*)::int as leg_count,
      count(*) filter (where leg.outcome_status = 'settled')::int as outcome_settled_leg_count,
      count(*) filter (where leg.outcome_status = 'settled' and leg.outcome_result_position = 1)::int as outcome_winning_leg_count,
      count(*) filter (where leg.outcome_status = 'pending')::int as pending_leg_count,
      count(*) filter (where leg.outcome_status in ('missing_result', 'race_not_found'))::int as outcome_missing_result_count,
      count(*) filter (where leg.outcome_status = 'missing_runner')::int as outcome_missing_runner_count,
      round(exp(sum(
        case
          when leg.predicted_fixed_win_price > 0 then ln(leg.predicted_fixed_win_price::double precision)
          else null
        end
      ))::numeric, 2) as combined_fixed_win_price,
      round(avg(leg.cash_average_score), 4) as average_cash_score
    from filtered recommendation
    join public.multi_bet_recommendation_legs leg
      on leg.recommendation_id = recommendation.id
    where p_max_leg_rank is not null
      and coalesce(leg.prediction_rank, leg.leg_index) <= p_max_leg_rank
    group by
      recommendation.id,
      recommendation.prediction_model,
      recommendation.source_date,
      recommendation.predicted_at,
      recommendation.recommendation_type
    having count(*) = p_max_leg_rank
      and count(*) filter (
        where leg.predicted_fixed_win_price is null
           or leg.predicted_fixed_win_price <= 0
      ) = 0
  ),
  ranked_rows as (
    select
      ranked_base.id,
      ranked_base.prediction_model,
      ranked_base.source_date,
      ranked_base.predicted_at,
      ranked_base.recommendation_type,
      ranked_base.leg_count,
      ranked_base.combined_fixed_win_price,
      ranked_base.average_cash_score,
      case
        when ranked_base.pending_leg_count > 0 then 'pending'
        when ranked_base.outcome_missing_runner_count > 0 then 'missing_runner'
        when ranked_base.outcome_missing_result_count > 0 then 'missing_result'
        else 'settled'
      end as outcome_status,
      case
        when ranked_base.outcome_settled_leg_count = ranked_base.leg_count
          and ranked_base.outcome_winning_leg_count = ranked_base.leg_count
          then ranked_base.combined_fixed_win_price
        else 0
      end as outcome_win_return,
      ranked_base.outcome_settled_leg_count,
      ranked_base.outcome_winning_leg_count,
      ranked_base.outcome_missing_result_count,
      ranked_base.outcome_missing_runner_count
    from ranked_base
  ),
  entry_rows as (
    select * from parent_rows
    union all
    select * from ranked_rows
  ),
  counted as (
    select entry_rows.*, count(*) over ()::int as total_count
    from entry_rows
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
        'predictionRank', coalesce(leg.prediction_rank, leg.leg_index),
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
      order by
        case when p_max_leg_rank is null then leg.leg_index else coalesce(leg.prediction_rank, leg.leg_index) end
    ) filter (where leg.id is not null), '[]'::jsonb) as legs,
    counted.total_count
  from counted
  left join public.multi_bet_recommendation_legs leg
    on leg.recommendation_id = counted.id
   and (
      p_max_leg_rank is null
      or coalesce(leg.prediction_rank, leg.leg_index) <= p_max_leg_rank
   )
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

grant execute on function public.get_multi_bet_recommendation_entries(text, date, date, text, text, text, text, int, int, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
