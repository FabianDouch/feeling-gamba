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
    p_race_code as race_code,
    p_max_rank as rank_filter,
    coalesce(p_signal_filter, 'all') as signal_filter,
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

grant execute on function public.get_prediction_performance_summary(text, text, int, text)
  to anon, authenticated;

create index if not exists promotion_predictions_performance_filter_idx
  on public.promotion_predictions (prediction_model, race_code, rank, signal_label, outcome_status);
