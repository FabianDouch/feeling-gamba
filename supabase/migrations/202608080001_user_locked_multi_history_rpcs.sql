create or replace function public.get_user_locked_multi_recommendation_summary(
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
security definer
set search_path = public
as $$
  with locked as (
    select recommendation.*
    from public.user_locked_multi_recommendations recommendation
    where recommendation.user_id = auth.uid()
      and recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (p_recommendation_type is null or recommendation.recommendation_type = p_recommendation_type)
  ),
  leg_source as (
    select
      locked.id as recommendation_id,
      locked.prediction_model,
      locked.source_date,
      locked.recommendation_type,
      locked.leg_count as stored_leg_count,
      locked.combined_fixed_win_price,
      locked.average_score,
      leg.value as raw,
      leg.ordinality::int as leg_index
    from locked
    cross join lateral jsonb_array_elements(locked.legs) with ordinality as leg(value, ordinality)
  ),
  leg_rows as (
    select
      leg_source.*,
      (leg_source.raw ->> 'raceCardId') as source_race_card_id,
      nullif(leg_source.raw ->> 'country', '') as country,
      nullif(leg_source.raw ->> 'code', '') as race_code,
      coalesce(nullif(leg_source.raw ->> 'canonicalTrack', ''), nullif(leg_source.raw ->> 'sourceTrack', ''), nullif(leg_source.raw ->> 'track', '')) as course_name,
      regexp_replace(
        regexp_replace(
          lower(coalesce(nullif(leg_source.raw ->> 'canonicalTrack', ''), nullif(leg_source.raw ->> 'sourceTrack', ''), nullif(leg_source.raw ->> 'track', ''))),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '(^-|-$)',
        '',
        'g'
      ) as course_slug,
      nullif(leg_source.raw ->> 'raceNumber', '')::int as race_number,
      nullif(leg_source.raw ->> 'raceName', '') as race_name,
      nullif(leg_source.raw ->> 'advertisedStart', '')::timestamptz as advertised_start,
      coalesce(
        nullif(leg_source.raw ->> 'percentageMultiRank', '')::int,
        nullif(leg_source.raw ->> 'winPercentageMultiRank', '')::int,
        nullif(leg_source.raw ->> 'rank', '')::int,
        leg_source.leg_index
      ) as prediction_rank,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,number}', '')::int,
        nullif(leg_source.raw #>> '{targetRunner,number}', '')::int
      ) as predicted_runner_number,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,name}', ''),
        nullif(leg_source.raw #>> '{targetRunner,name}', '')
      ) as predicted_runner_name,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,fixedWinPrice}', '')::numeric,
        nullif(leg_source.raw #>> '{targetRunner,fixedWinPrice}', '')::numeric
      ) as predicted_fixed_win_price,
      nullif(leg_source.raw #>> '{favourite,fixedPlacePrice}', '')::numeric as predicted_fixed_place_price,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,placeScore}', '')::numeric,
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,winScore}', '')::numeric,
        nullif(leg_source.raw #>> '{candidate,cashAverageScore}', '')::numeric,
        nullif(leg_source.raw #>> '{candidate,blendedCashPlusBonusAverage}', '')::numeric
      ) as cash_average_score,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,placePayoutDepth}', '')::int,
        nullif(leg_source.raw ->> 'placePayoutDepth', '')::int
      ) as place_payout_depth,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,label}', ''),
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,label}', ''),
        nullif(leg_source.raw #>> '{candidate,label}', '')
      ) as signal_label,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,tone}', ''),
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,tone}', ''),
        nullif(leg_source.raw #>> '{candidate,tone}', '')
      ) as signal_tone
    from leg_source
  ),
  filtered_locked as (
    select locked.*
    from locked
    where (
      (p_country is null and p_race_code is null and p_course_slug is null)
      or exists (
        select 1
        from leg_rows leg
        where leg.recommendation_id = locked.id
          and (p_country is null or leg.country = p_country)
          and (p_race_code is null or leg.race_code = p_race_code)
          and (p_course_slug is null or leg.course_slug = p_course_slug)
      )
    )
  ),
  outcome_legs as (
    select
      leg.*,
      result.finish_position as outcome_result_position,
      case
        when race.id is null and (leg.advertised_start is null or now() < leg.advertised_start + interval '24 hours') then 'pending'
        when race.id is null then 'race_not_found'
        when runner.id is null then 'missing_runner'
        when result.runner_id is null and (leg.advertised_start is null or now() < leg.advertised_start + interval '24 hours') then 'pending'
        when result.runner_id is null then 'missing_result'
        else 'settled'
      end as outcome_status,
      case
        when result.finish_position is null then 0
        when leg.prediction_model = 'multi_place_percentage_v1'
          and leg.place_payout_depth is not null
          and result.finish_position <= leg.place_payout_depth
          then coalesce(leg.predicted_fixed_place_price, 0)
        when leg.prediction_model <> 'multi_place_percentage_v1'
          and result.finish_position = 1
          then coalesce(leg.predicted_fixed_win_price, 0)
        else 0
      end as outcome_win_return
    from leg_rows leg
    join filtered_locked locked
      on locked.id = leg.recommendation_id
    left join public.races race
      on race.source_race_card_id = leg.source_race_card_id
    left join public.runners runner
      on runner.race_id = race.id
     and runner.runner_number = leg.predicted_runner_number
    left join public.race_results result
      on result.runner_id = runner.id
  ),
  ranked_legs as (
    select *
    from outcome_legs leg
    where p_max_leg_rank is null
      or leg.prediction_rank <= p_max_leg_rank
  ),
  recommendation_base as (
    select
      locked.id,
      locked.prediction_model,
      locked.source_date,
      locked.recommendation_type,
      count(*)::int as row_leg_count,
      count(*) filter (where leg.outcome_status = 'settled')::int as row_settled_leg_count,
      count(*) filter (
        where public.is_multi_bet_leg_successful(
          locked.prediction_model,
          leg.outcome_status,
          leg.outcome_result_position,
          leg.outcome_win_return,
          leg.raw
        )
      )::int as row_winning_leg_count,
      count(*) filter (where leg.outcome_status = 'pending')::int as row_pending_leg_count,
      count(*) filter (where leg.outcome_status in ('missing_result', 'race_not_found'))::int as row_missing_result_count,
      count(*) filter (where leg.outcome_status = 'missing_runner')::int as row_missing_runner_count,
      case
        when p_max_leg_rank is null then locked.combined_fixed_win_price
        else round(exp(sum(
          case
            when leg.predicted_fixed_win_price > 0 then ln(leg.predicted_fixed_win_price::double precision)
            else null
          end
        ))::numeric, 2)
      end as row_combined_fixed_win_price,
      round(exp(sum(
        case
          when leg.predicted_fixed_place_price > 0 then ln(leg.predicted_fixed_place_price::double precision)
          else null
        end
      ))::numeric, 2) as row_combined_fixed_place_price
    from filtered_locked locked
    join ranked_legs leg
      on leg.recommendation_id = locked.id
    group by locked.id, locked.prediction_model, locked.source_date, locked.recommendation_type, locked.combined_fixed_win_price
    having p_max_leg_rank is null
      or (
        count(*) = p_max_leg_rank
        and count(*) filter (
          where case
            when p_prediction_model = 'multi_place_percentage_v1' then
              leg.predicted_fixed_place_price is null
              or leg.predicted_fixed_place_price <= 0
            else
              leg.predicted_fixed_win_price is null
              or leg.predicted_fixed_win_price <= 0
          end
        ) = 0
      )
  ),
  recommendation_rows as (
    select
      recommendation_base.source_date,
      case
        when recommendation_base.row_pending_leg_count > 0 then 'pending'
        when recommendation_base.row_missing_runner_count > 0 then 'missing_runner'
        when recommendation_base.row_missing_result_count > 0 then 'missing_result'
        else 'settled'
      end as outcome_status,
      recommendation_base.row_missing_result_count,
      recommendation_base.row_missing_runner_count,
      case
        when recommendation_base.row_settled_leg_count = recommendation_base.row_leg_count
          and recommendation_base.row_winning_leg_count = recommendation_base.row_leg_count
          then case
            when recommendation_base.prediction_model = 'multi_place_percentage_v1' then recommendation_base.row_combined_fixed_place_price
            else recommendation_base.row_combined_fixed_win_price
          end
        else 0
      end as row_win_return
    from recommendation_base
  ),
  summary as (
    select
      min(source_date) as date_from,
      max(source_date) as date_to,
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      coalesce(sum(row_missing_result_count), 0)::int as missing_result_count,
      coalesce(sum(row_missing_runner_count), 0)::int as missing_runner_count,
      count(*) filter (where outcome_status = 'settled')::numeric as total_stake,
      coalesce(sum(row_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      count(*) filter (where outcome_status = 'settled' and row_win_return > 0)::int as wins
    from recommendation_rows
  )
  select
    p_prediction_model,
    coalesce(p_recommendation_type, 'all'),
    summary.date_from,
    summary.date_to,
    summary.prediction_count,
    summary.settled_count,
    summary.pending_count,
    summary.missing_result_count,
    summary.missing_runner_count,
    summary.total_stake,
    summary.total_return,
    summary.total_return - summary.total_stake,
    case when summary.total_stake > 0 then round(summary.total_return / summary.total_stake, 4) else 0 end,
    case when summary.total_stake > 0 then round(((summary.total_return - summary.total_stake) / summary.total_stake) * 100, 2) else 0 end,
    summary.wins,
    case when summary.settled_count > 0 then round((summary.wins::numeric / summary.settled_count::numeric) * 100, 2) else 0 end
  from summary;
$$;

revoke all on function public.get_user_locked_multi_recommendation_summary(text, date, date, text, text, text, text, int)
  from public;

grant execute on function public.get_user_locked_multi_recommendation_summary(text, date, date, text, text, text, text, int)
  to authenticated;

create or replace function public.get_user_locked_multi_recommendation_entries(
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
  combined_fixed_place_price numeric,
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
security definer
set search_path = public
as $$
  with locked as (
    select recommendation.*
    from public.user_locked_multi_recommendations recommendation
    where recommendation.user_id = auth.uid()
      and recommendation.prediction_model = p_prediction_model
      and (p_from_date is null or recommendation.source_date >= p_from_date)
      and (p_to_date is null or recommendation.source_date <= p_to_date)
      and (p_recommendation_type is null or recommendation.recommendation_type = p_recommendation_type)
  ),
  leg_source as (
    select
      locked.id as recommendation_id,
      locked.prediction_model,
      locked.source_date,
      locked.recommendation_type,
      locked.leg_count as stored_leg_count,
      locked.combined_fixed_win_price,
      locked.average_score,
      locked.locked_at,
      leg.value as raw,
      leg.ordinality::int as leg_index
    from locked
    cross join lateral jsonb_array_elements(locked.legs) with ordinality as leg(value, ordinality)
  ),
  leg_rows as (
    select
      leg_source.*,
      (leg_source.raw ->> 'raceCardId') as source_race_card_id,
      nullif(leg_source.raw ->> 'country', '') as country,
      nullif(leg_source.raw ->> 'code', '') as race_code,
      coalesce(nullif(leg_source.raw ->> 'canonicalTrack', ''), nullif(leg_source.raw ->> 'sourceTrack', ''), nullif(leg_source.raw ->> 'track', '')) as course_name,
      regexp_replace(
        regexp_replace(
          lower(coalesce(nullif(leg_source.raw ->> 'canonicalTrack', ''), nullif(leg_source.raw ->> 'sourceTrack', ''), nullif(leg_source.raw ->> 'track', ''))),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '(^-|-$)',
        '',
        'g'
      ) as course_slug,
      nullif(leg_source.raw ->> 'raceNumber', '')::int as race_number,
      nullif(leg_source.raw ->> 'raceName', '') as race_name,
      nullif(leg_source.raw ->> 'advertisedStart', '')::timestamptz as advertised_start,
      coalesce(
        nullif(leg_source.raw ->> 'percentageMultiRank', '')::int,
        nullif(leg_source.raw ->> 'winPercentageMultiRank', '')::int,
        nullif(leg_source.raw ->> 'rank', '')::int,
        leg_source.leg_index
      ) as prediction_rank,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,number}', '')::int,
        nullif(leg_source.raw #>> '{targetRunner,number}', '')::int
      ) as predicted_runner_number,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,name}', ''),
        nullif(leg_source.raw #>> '{targetRunner,name}', '')
      ) as predicted_runner_name,
      coalesce(
        nullif(leg_source.raw #>> '{favourite,fixedWinPrice}', '')::numeric,
        nullif(leg_source.raw #>> '{targetRunner,fixedWinPrice}', '')::numeric
      ) as predicted_fixed_win_price,
      nullif(leg_source.raw #>> '{favourite,fixedPlacePrice}', '')::numeric as predicted_fixed_place_price,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,placeScore}', '')::numeric,
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,winScore}', '')::numeric,
        nullif(leg_source.raw #>> '{candidate,cashAverageScore}', '')::numeric,
        nullif(leg_source.raw #>> '{candidate,blendedCashPlusBonusAverage}', '')::numeric
      ) as cash_average_score,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,placePayoutDepth}', '')::int,
        nullif(leg_source.raw ->> 'placePayoutDepth', '')::int
      ) as place_payout_depth,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,label}', ''),
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,label}', ''),
        nullif(leg_source.raw #>> '{candidate,label}', '')
      ) as signal_label,
      coalesce(
        nullif(leg_source.raw #>> '{placingCandidate,tone}', ''),
        nullif(leg_source.raw #>> '{winPercentageMultiCandidate,tone}', ''),
        nullif(leg_source.raw #>> '{candidate,tone}', '')
      ) as signal_tone
    from leg_source
  ),
  filtered_locked as (
    select locked.*
    from locked
    where (
      (p_country is null and p_race_code is null and p_course_slug is null)
      or exists (
        select 1
        from leg_rows leg
        where leg.recommendation_id = locked.id
          and (p_country is null or leg.country = p_country)
          and (p_race_code is null or leg.race_code = p_race_code)
          and (p_course_slug is null or leg.course_slug = p_course_slug)
      )
    )
  ),
  outcome_legs as (
    select
      leg.*,
      result.finish_position as outcome_result_position,
      case
        when race.id is null and (leg.advertised_start is null or now() < leg.advertised_start + interval '24 hours') then 'pending'
        when race.id is null then 'race_not_found'
        when runner.id is null then 'missing_runner'
        when result.runner_id is null and (leg.advertised_start is null or now() < leg.advertised_start + interval '24 hours') then 'pending'
        when result.runner_id is null then 'missing_result'
        else 'settled'
      end as outcome_status,
      case
        when result.finish_position is null then 0
        when leg.prediction_model = 'multi_place_percentage_v1'
          and leg.place_payout_depth is not null
          and result.finish_position <= leg.place_payout_depth
          then coalesce(leg.predicted_fixed_place_price, 0)
        when leg.prediction_model <> 'multi_place_percentage_v1'
          and result.finish_position = 1
          then coalesce(leg.predicted_fixed_win_price, 0)
        else 0
      end as outcome_win_return
    from leg_rows leg
    join filtered_locked locked
      on locked.id = leg.recommendation_id
    left join public.races race
      on race.source_race_card_id = leg.source_race_card_id
    left join public.runners runner
      on runner.race_id = race.id
     and runner.runner_number = leg.predicted_runner_number
    left join public.race_results result
      on result.runner_id = runner.id
  ),
  ranked_legs as (
    select *
    from outcome_legs leg
    where p_max_leg_rank is null
      or leg.prediction_rank <= p_max_leg_rank
  ),
  recommendation_base as (
    select
      locked.id,
      locked.prediction_model,
      locked.source_date,
      locked.locked_at,
      locked.recommendation_type,
      count(*)::int as leg_count,
      count(*) filter (where leg.outcome_status = 'settled')::int as outcome_settled_leg_count,
      count(*) filter (
        where public.is_multi_bet_leg_successful(
          locked.prediction_model,
          leg.outcome_status,
          leg.outcome_result_position,
          leg.outcome_win_return,
          leg.raw
        )
      )::int as outcome_winning_leg_count,
      count(*) filter (where leg.outcome_status = 'pending')::int as pending_leg_count,
      count(*) filter (where leg.outcome_status in ('missing_result', 'race_not_found'))::int as outcome_missing_result_count,
      count(*) filter (where leg.outcome_status = 'missing_runner')::int as outcome_missing_runner_count,
      case
        when p_max_leg_rank is null then locked.combined_fixed_win_price
        else round(exp(sum(
          case
            when leg.predicted_fixed_win_price > 0 then ln(leg.predicted_fixed_win_price::double precision)
            else null
          end
        ))::numeric, 2)
      end as combined_fixed_win_price,
      round(exp(sum(
        case
          when leg.predicted_fixed_place_price > 0 then ln(leg.predicted_fixed_place_price::double precision)
          else null
        end
      ))::numeric, 2) as combined_fixed_place_price,
      round(avg(leg.cash_average_score), 4) as average_cash_score
    from filtered_locked locked
    join ranked_legs leg
      on leg.recommendation_id = locked.id
    group by locked.id, locked.prediction_model, locked.source_date, locked.locked_at, locked.recommendation_type, locked.combined_fixed_win_price
    having p_max_leg_rank is null
      or (
        count(*) = p_max_leg_rank
        and count(*) filter (
          where case
            when p_prediction_model = 'multi_place_percentage_v1' then
              leg.predicted_fixed_place_price is null
              or leg.predicted_fixed_place_price <= 0
            else
              leg.predicted_fixed_win_price is null
              or leg.predicted_fixed_win_price <= 0
          end
        ) = 0
      )
  ),
  entry_rows as (
    select
      recommendation_base.*,
      case
        when recommendation_base.pending_leg_count > 0 then 'pending'
        when recommendation_base.outcome_missing_runner_count > 0 then 'missing_runner'
        when recommendation_base.outcome_missing_result_count > 0 then 'missing_result'
        else 'settled'
      end as outcome_status,
      case
        when recommendation_base.outcome_settled_leg_count = recommendation_base.leg_count
          and recommendation_base.outcome_winning_leg_count = recommendation_base.leg_count
          then case
            when recommendation_base.prediction_model = 'multi_place_percentage_v1' then recommendation_base.combined_fixed_place_price
            else recommendation_base.combined_fixed_win_price
          end
        else 0
      end as outcome_win_return
    from recommendation_base
  ),
  counted as (
    select entry_rows.*, count(*) over ()::int as total_count
    from entry_rows
  )
  select
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.locked_at,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.combined_fixed_place_price,
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
        'predictionRank', leg.prediction_rank,
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
        'predictedFixedPlacePrice', leg.predicted_fixed_place_price,
        'predictedFixedWinPrice', leg.predicted_fixed_win_price,
        'cashAverageScore', leg.cash_average_score,
        'placePayoutDepth', leg.place_payout_depth,
        'signalLabel', leg.signal_label,
        'signalTone', leg.signal_tone,
        'outcomeStatus', leg.outcome_status,
        'outcomeResultPosition', leg.outcome_result_position,
        'outcomeWinReturn', leg.outcome_win_return
      )
      order by case when p_max_leg_rank is null then leg.leg_index else leg.prediction_rank end
    ) filter (where leg.recommendation_id is not null), '[]'::jsonb) as legs,
    counted.total_count
  from counted
  left join ranked_legs leg
    on leg.recommendation_id = counted.id
  group by
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.locked_at,
    counted.recommendation_type,
    counted.leg_count,
    counted.combined_fixed_win_price,
    counted.combined_fixed_place_price,
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
    counted.locked_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_user_locked_multi_recommendation_entries(text, date, date, text, text, text, text, int, int, int)
  from public;

grant execute on function public.get_user_locked_multi_recommendation_entries(text, date, date, text, text, text, text, int, int, int)
  to authenticated;

notify pgrst, 'reload schema';
