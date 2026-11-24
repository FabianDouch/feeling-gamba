-- Expose only the saved quotes, probabilities, public event labels and evaluation totals.
create function public.get_model_forecasts(
  p_model text,
  p_view text,
  p_league text default null,
  p_page integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  response jsonb;
begin
  if p_model is null or p_model not in ('football_draw_v1', 'thoroughbred_favourite_v1')
    or p_view is null or p_view not in ('upcoming', 'history')
    or p_page is null or p_page < 0 or p_page > 100000
    or (p_league is not null and (p_model <> 'football_draw_v1' or p_league not in (
      'epl','ucl','laliga','bundesliga','seriea','ligue1','mls','europaleague','eflcup','nationsleague'
    ))) then
    raise exception 'Invalid forecast scope' using errcode = '22023';
  end if;

  with filtered as materialized (
    select f.*, case when p_model = 'football_draw_v1' then 'draw' else 'win' end as target
    from public.model_shadow_forecasts f
    where f.model = p_model and (p_league is null or f.source_group = p_league)
      and (case when p_view = 'upcoming' then f.event_at > statement_timestamp() and f.outcome_status = 'pending'
        else f.event_at <= statement_timestamp() end)
  ), scored as (
    select (baseline->>target)::double precision as market,
      (prediction->>target)::double precision as estimate,
      (baseline->>actual)::double precision as market_actual,
      (prediction->>actual)::double precision as estimate_actual,
      (actual = target)::int as y
    from filtered where outcome_status = 'settled' and prediction is not null
  ), probabilities as (
    select *, least(9, floor(market * 10))::int as market_bin,
      least(9, floor(estimate * 10))::int as estimate_bin from scored
  ), bins as (
    select variant, bin, count(*) as sample, avg(probability) as predicted, avg(y) as observed
    from probabilities cross join lateral (values ('baseline', market_bin, market), ('model', estimate_bin, estimate)) as p(variant, bin, probability)
    group by variant, bin
  ), page as (
    select * from filtered
    order by case when p_view = 'upcoming' then event_at end asc,
      case when p_view = 'history' then event_at end desc, id asc
    limit 20 offset p_page * 20
  ), public_rows as (
    select jsonb_build_object(
      'id', f.id, 'sourceGroup', f.source_group,
      'eventAt', f.event_at, 'capturedAt', f.captured_at, 'forecastAt', f.forecast_at,
      'prices', f.source_prices, 'baseline', f.baseline, 'estimate', f.prediction,
      'trainingSample', f.training->'sample', 'priceBand', f.training->'bucket',
      'status', f.outcome_status, 'actual', f.actual, 'settledAt', f.settled_at,
      'home', f.source_identity->>'home', 'away', f.source_identity->>'away',
      'runner', f.source_identity->>'runnerName', 'runnerNumber', f.source_identity->'runnerNumber',
      'course', r.course_name, 'raceNumber', r.race_number, 'country', r.country
    ) as content, f.id, f.event_at
    from page f
    left join public.promotion_predictions r on r.id = case when p_model = 'thoroughbred_favourite_v1'
      then (f.source_identity->>'predictionId')::uuid end
  )
  select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(content order by case when p_view = 'upcoming' then event_at end asc,
      case when p_view = 'history' then event_at end desc, id asc) from public_rows), '[]'::jsonb),
    'summary', (select jsonb_build_object(
      'total', count(*), 'pending', count(*) filter (where outcome_status = 'pending'),
      'settled', count(*) filter (where outcome_status = 'settled'),
      'excluded', count(*) filter (where outcome_status = 'excluded'),
      'unavailable', count(*) filter (where prediction is null)
    ) from filtered),
    'scores', (select jsonb_build_object(
      'paired', count(*), 'targetOutcomes', coalesce(sum(y), 0),
      'baselineBrier', avg(power(market - y, 2)), 'modelBrier', avg(power(estimate - y, 2)),
      'baselineLogLoss', avg(-ln(greatest(1e-6, least(1 - 1e-6, market_actual)))),
      'modelLogLoss', avg(-ln(greatest(1e-6, least(1 - 1e-6, estimate_actual))))
    ) from scored),
    'bins', coalesce((select jsonb_agg(to_jsonb(bins) order by variant, bin) from bins), '[]'::jsonb)
  ) into response;
  return response;
end;
$$;

revoke all on function public.get_model_forecasts(text, text, text, integer) from public;
grant execute on function public.get_model_forecasts(text, text, text, integer) to anon, authenticated, service_role;
