alter table if exists public.multi_bet_recommendations
  drop constraint if exists multi_bet_recommendations_leg_count_check;

alter table if exists public.multi_bet_recommendations
  add constraint multi_bet_recommendations_leg_count_check check (leg_count >= 2);

alter table if exists public.user_locked_multi_recommendations
  drop constraint if exists user_locked_multi_recommendations_leg_count_check;

alter table if exists public.user_locked_multi_recommendations
  add constraint user_locked_multi_recommendations_leg_count_check check (leg_count >= 2);

alter table if exists public.ufc_multi_recommendations
  drop constraint if exists ufc_multi_recommendations_leg_count_check;

alter table if exists public.ufc_multi_recommendations
  add constraint ufc_multi_recommendations_leg_count_check check (leg_count >= 2);

alter table if exists public.user_locked_ufc_multi_recommendations
  drop constraint if exists user_locked_ufc_multi_recommendations_leg_count_check;

alter table if exists public.user_locked_ufc_multi_recommendations
  add constraint user_locked_ufc_multi_recommendations_leg_count_check check (leg_count >= 2);

alter table if exists public.historical_multi_backtest_recommendations
  drop constraint if exists historical_multi_backtest_recommendations_leg_count_check;

alter table if exists public.historical_multi_backtest_recommendations
  add constraint historical_multi_backtest_recommendations_leg_count_check check (leg_count >= 2);

create or replace function public.get_historical_multi_backtest_summary(
  p_sport text,
  p_prediction_model text,
  p_max_leg_rank int default null
)
returns table (
  sport text,
  prediction_model text,
  prediction_count int,
  settled_count int,
  pending_count int,
  missing_result_count int,
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
  with leg_sets as (
    select
      recommendation.id,
      recommendation.sport,
      recommendation.prediction_model,
      count(leg.id)::int as leg_count,
      count(leg.id) filter (where leg.outcome_status = 'settled')::int as settled_leg_count,
      bool_and(leg.outcome_status = 'settled') as all_legs_settled,
      bool_and(leg.outcome_status = 'settled' and coalesce(leg.outcome_win_return, 0) > 0) as all_legs_won,
      case
        when count(leg.id) >= 2
          and bool_and(leg.outcome_status = 'settled')
          and bool_and(coalesce(leg.fixed_win_price, 0) > 0)
        then exp(sum(
          case
            when coalesce(leg.fixed_win_price, 0) > 0 then ln(leg.fixed_win_price)
            else null
          end
        ))::numeric
        else 0::numeric
      end as combined_fixed_win_price
    from public.historical_multi_backtest_recommendations recommendation
    join public.historical_multi_backtest_legs leg
      on leg.recommendation_id = recommendation.id
    where recommendation.sport = p_sport
      and recommendation.prediction_model = p_prediction_model
      and (p_max_leg_rank is null or leg.prediction_rank <= p_max_leg_rank)
    group by recommendation.id, recommendation.sport, recommendation.prediction_model
    having count(leg.id) >= 2
  ),
  scored as (
    select
      leg_sets.*,
      case
        when leg_sets.all_legs_settled and leg_sets.all_legs_won
        then leg_sets.combined_fixed_win_price
        else 0::numeric
      end as outcome_win_return
    from leg_sets
  ),
  summary as (
    select
      count(*)::int as prediction_count,
      count(*) filter (where all_legs_settled)::int as settled_count,
      count(*) filter (where not all_legs_settled)::int as missing_result_count,
      count(*) filter (where all_legs_settled and outcome_win_return > 0)::int as wins,
      coalesce(sum(outcome_win_return) filter (where all_legs_settled), 0)::numeric as total_return
    from scored
  )
  select
    p_sport as sport,
    p_prediction_model as prediction_model,
    summary.prediction_count,
    summary.settled_count,
    0::int as pending_count,
    summary.missing_result_count,
    summary.settled_count::numeric as total_stake,
    summary.total_return,
    summary.total_return - summary.settled_count::numeric as net_return,
    case
      when summary.settled_count > 0
      then round(summary.total_return / summary.settled_count::numeric, 4)
      else 0::numeric
    end as average_return_per_dollar,
    case
      when summary.settled_count > 0
      then round(((summary.total_return - summary.settled_count::numeric) / summary.settled_count::numeric) * 100, 2)
      else 0::numeric
    end as roi_percentage,
    summary.wins,
    case
      when summary.settled_count > 0
      then round((summary.wins::numeric / summary.settled_count::numeric) * 100, 2)
      else 0::numeric
    end as win_percentage
  from summary;
$$;

grant execute on function public.get_historical_multi_backtest_summary(text, text, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
