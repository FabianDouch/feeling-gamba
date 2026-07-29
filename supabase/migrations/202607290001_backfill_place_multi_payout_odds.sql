with place_leg_prices as (
  select
    leg.id as leg_id,
    round((price_row.price -> 'odds' ->> 'decimal')::numeric, 2) as fixed_place_price
  from public.multi_bet_recommendation_legs leg
  join public.multi_bet_recommendations recommendation
    on recommendation.id = leg.recommendation_id
  join public.races race
    on race.source_race_card_id = leg.source_race_card_id
  join public.runners runner
    on runner.race_id = race.id
   and runner.runner_number = leg.predicted_runner_number
  cross join lateral jsonb_array_elements(coalesce(runner.raw -> 'prices', '[]'::jsonb)) as price_row(price)
  where recommendation.prediction_model = 'multi_place_percentage_v1'
    and (
      leg.predicted_fixed_place_price is null
      or leg.predicted_fixed_place_price <= 0
    )
    and (
      price_row.price ->> 'id' like '%:e0a6d9b2-de5b-46ef-9bea-a4064f6bbc4a:%'
      or price_row.price ->> 'id' like '%:a95f59f0-9605-472a-9578-a61677705b75:18ba60da-abd2-463c-a34a-dc6368377ac8%'
    )
    and nullif(price_row.price -> 'odds' ->> 'decimal', '')::numeric > 0
)
update public.multi_bet_recommendation_legs leg
set
  predicted_fixed_place_price = place_leg_prices.fixed_place_price,
  updated_at = now()
from place_leg_prices
where leg.id = place_leg_prices.leg_id;

update public.multi_bet_recommendation_legs leg
set
  outcome_win_return = case
    when leg.outcome_status = 'settled'
      and leg.outcome_result_position is not null
      and leg.outcome_result_position <= coalesce(
        nullif(leg.raw #>> '{placingCandidate,placePayoutDepth}', '')::int,
        nullif(leg.raw ->> 'placePayoutDepth', '')::int,
        0
      )
      and leg.predicted_fixed_place_price > 0
      then round(leg.predicted_fixed_place_price, 2)
    else 0
  end,
  outcome_updated_at = now(),
  updated_at = now()
from public.multi_bet_recommendations recommendation
where recommendation.id = leg.recommendation_id
  and recommendation.prediction_model = 'multi_place_percentage_v1'
  and leg.outcome_status = 'settled';

with leg_rollup as (
  select
    recommendation.id,
    count(*)::int as leg_count,
    count(*) filter (where leg.outcome_status = 'settled')::int as settled_leg_count,
    count(*) filter (
      where leg.outcome_status = 'settled'
        and leg.outcome_result_position is not null
        and leg.outcome_result_position <= coalesce(
          nullif(leg.raw #>> '{placingCandidate,placePayoutDepth}', '')::int,
          nullif(leg.raw ->> 'placePayoutDepth', '')::int,
          0
        )
    )::int as placed_leg_count,
    count(*) filter (where leg.outcome_status = 'pending')::int as pending_leg_count,
    count(*) filter (where leg.outcome_status = 'missing_runner')::int as missing_runner_count,
    count(*) filter (where leg.outcome_status in ('missing_result', 'race_not_found'))::int as source_missing_result_count,
    count(*) filter (
      where leg.outcome_status = 'settled'
        and leg.outcome_result_position is not null
        and leg.outcome_result_position <= coalesce(
          nullif(leg.raw #>> '{placingCandidate,placePayoutDepth}', '')::int,
          nullif(leg.raw ->> 'placePayoutDepth', '')::int,
          0
        )
        and (
          leg.predicted_fixed_place_price is null
          or leg.predicted_fixed_place_price <= 0
        )
    )::int as placed_missing_price_count,
    count(*) filter (
      where leg.predicted_fixed_place_price is not null
        and leg.predicted_fixed_place_price > 0
    )::int as priced_leg_count,
    round(exp(sum(
      case
        when leg.predicted_fixed_place_price > 0 then ln(leg.predicted_fixed_place_price::double precision)
        else null
      end
    ))::numeric, 2) as combined_fixed_place_price
  from public.multi_bet_recommendations recommendation
  join public.multi_bet_recommendation_legs leg
    on leg.recommendation_id = recommendation.id
  where recommendation.prediction_model = 'multi_place_percentage_v1'
  group by recommendation.id
)
update public.multi_bet_recommendations recommendation
set
  combined_fixed_place_price = case
    when leg_rollup.priced_leg_count = leg_rollup.leg_count
      then leg_rollup.combined_fixed_place_price
    else null
  end,
  outcome_settled_leg_count = leg_rollup.settled_leg_count,
  outcome_winning_leg_count = leg_rollup.placed_leg_count,
  outcome_missing_runner_count = leg_rollup.missing_runner_count,
  outcome_missing_result_count = leg_rollup.source_missing_result_count
    + case
      when leg_rollup.placed_leg_count = leg_rollup.leg_count
        then leg_rollup.placed_missing_price_count
      else 0
    end,
  outcome_status = case
    when leg_rollup.pending_leg_count > 0 then 'pending'
    when leg_rollup.missing_runner_count > 0 then 'missing_runner'
    when leg_rollup.source_missing_result_count > 0 then 'missing_result'
    when leg_rollup.placed_leg_count = leg_rollup.leg_count
      and leg_rollup.placed_missing_price_count > 0 then 'missing_result'
    else 'settled'
  end,
  outcome_win_return = case
    when leg_rollup.pending_leg_count = 0
      and leg_rollup.missing_runner_count = 0
      and leg_rollup.source_missing_result_count = 0
      and leg_rollup.placed_leg_count = leg_rollup.leg_count
      and leg_rollup.priced_leg_count = leg_rollup.leg_count
      then leg_rollup.combined_fixed_place_price
    else 0
  end,
  outcome_updated_at = now(),
  updated_at = now()
from leg_rollup
where recommendation.id = leg_rollup.id;

notify pgrst, 'reload schema';
