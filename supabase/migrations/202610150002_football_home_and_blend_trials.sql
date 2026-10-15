-- Add a home-only cohort and score an equal blend of immutable stored probabilities.
do $$
declare target regclass;
begin
  foreach target in array array['public.football_price_gap_predictions'::regclass,
    'public.football_price_gap_backtests'::regclass] loop
    execute format('alter table %s drop constraint football_selection_cohort_check,
      drop constraint football_selection_threshold_check', target);
    execute format('alter table %s add constraint football_selection_cohort_check
      check (cohort in (''exact_2'',''plus_2'',''opponent_3_50_plus'',''home_opponent_3_50_plus''))', target);
    execute format('alter table %s add constraint football_selection_threshold_check check (
      (cohort = ''opponent_3_50_plus'' and other_price >= 3.50 and price_gap >= 0)
      or (cohort = ''home_opponent_3_50_plus'' and favourite_home and other_price >= 3.50 and price_gap >= 0)
      or (cohort in (''exact_2'',''plus_2'') and price_gap >= 2)
    )', target);
  end loop;
end $$;

-- Keep scoring and returns paired to the selected model's available forecasts.
create or replace function public.get_football_price_gap_summary(
  p_league text default null, p_cohort text default 'exact_2',
  p_from date default null, p_to date default null
) returns jsonb language sql stable security invoker set search_path = public as $$
with filtered as (
  select * from football_price_gap_predictions
  where experiment = 'football_price_gap_v1' and cohort = p_cohort
    and (p_league is null or league = p_league)
    and (p_from is null or kickoff_at >= (p_from::timestamp at time zone 'Pacific/Auckland'))
    and (p_to is null or kickoff_at < ((p_to + 1)::timestamp at time zone 'Pacific/Auckland'))
), predictions as (
  select f.*, m.model, m.probability, won::int as y
  from filtered f cross join lateral (values
    ('market',market_probability), ('bucket',bucket_probability), ('rich',rich_probability),
    -- SQL null propagation ensures a missing component never becomes a partial blend.
    ('blend',(market_probability + bucket_probability + rich_probability) / 3.0)
  ) m(model,probability)
), metrics as (
  select model, count(*) as recorded,
    count(*) filter (where outcome_status = 'settled' and probability is not null and won) as wins,
    count(*) filter (where outcome_status = 'settled' and probability is not null) as staked,
    coalesce(sum(unit_return) filter (where outcome_status = 'settled' and probability is not null),0) as returned,
    coalesce(sum(unit_return) filter (where outcome_status = 'settled' and probability is not null),0)
      - count(*) filter (where outcome_status = 'settled' and probability is not null) as net,
    100 * (sum(unit_return) filter (where outcome_status = 'settled' and probability is not null)
      / nullif(count(*) filter (where outcome_status = 'settled' and probability is not null),0) - 1) as roi,
    count(*) filter (where probability is null) as unavailable,
    count(*) filter (where outcome_status = 'settled' and probability is not null) as scored,
    avg(power(probability-y,2)) filter (where outcome_status = 'settled' and probability is not null) as brier,
    avg(power(market_probability-y,2)) filter (where outcome_status = 'settled' and probability is not null) as paired_market_brier,
    avg(-(y*ln(greatest(1e-6,least(1-1e-6,probability))) + (1-y)*ln(1-greatest(1e-6,least(1-1e-6,probability)))))
      filter (where outcome_status = 'settled' and probability is not null) as log_loss,
    avg(-(y*ln(greatest(1e-6,least(1-1e-6,market_probability))) + (1-y)*ln(1-greatest(1e-6,least(1-1e-6,market_probability)))))
      filter (where outcome_status = 'settled' and probability is not null) as paired_market_log_loss
  from predictions group by model
), bins as (
  select model, least(9,floor(probability*10)::int) as bin,
    count(*) as sample, avg(probability) as predicted, avg(y) as actual
  from predictions where outcome_status = 'settled' and probability is not null group by model,bin
)
select jsonb_build_object(
  'recorded',count(*), 'pending',count(*) filter (where outcome_status = 'pending'),
  'excluded',count(*) filter (where outcome_status = 'excluded'),
  'settled',count(*) filter (where outcome_status = 'settled'),
  'wins',count(*) filter (where won),
  'staked',count(*) filter (where outcome_status = 'settled'),
  'returned',coalesce(sum(unit_return),0),
  'net',coalesce(sum(unit_return),0)-count(*) filter (where outcome_status = 'settled'),
  'roi',100*(sum(unit_return)/nullif(count(*) filter (where outcome_status = 'settled'),0)-1),
  'models',coalesce((select jsonb_agg(to_jsonb(metrics) order by model) from metrics),'[]'::jsonb),
  'calibration',coalesce((select jsonb_agg(to_jsonb(bins) order by model,bin) from bins),'[]'::jsonb)
) from filtered;
$$;

-- Keep scoring and returns paired to the selected model's available forecasts.
create or replace function public.get_football_price_gap_backtest_summary(
  p_league text default null, p_cohort text default 'exact_2',
  p_from date default null, p_to date default null
) returns jsonb language sql stable security invoker set search_path = public as $$
with filtered as (
  select * from football_price_gap_backtests
  where experiment = 'football_price_gap_v1' and cohort = p_cohort
    and (p_league is null or league = p_league)
    and (p_from is null or kickoff_at >= (p_from::timestamp at time zone 'Pacific/Auckland'))
    and (p_to is null or kickoff_at < ((p_to + 1)::timestamp at time zone 'Pacific/Auckland'))
), predictions as (
  select f.*, m.model, m.probability, won::int as y
  from filtered f cross join lateral (values
    ('market',market_probability), ('bucket',bucket_probability), ('rich',rich_probability),
    -- SQL null propagation ensures a missing component never becomes a partial blend.
    ('blend',(market_probability + bucket_probability + rich_probability) / 3.0)
  ) m(model,probability)
), metrics as (
  select model, count(*) as recorded,
    count(*) filter (where outcome_status = 'settled' and probability is not null and won) as wins,
    count(*) filter (where outcome_status = 'settled' and probability is not null) as staked,
    coalesce(sum(unit_return) filter (where outcome_status = 'settled' and probability is not null),0) as returned,
    coalesce(sum(unit_return) filter (where outcome_status = 'settled' and probability is not null),0)
      - count(*) filter (where outcome_status = 'settled' and probability is not null) as net,
    100 * (sum(unit_return) filter (where outcome_status = 'settled' and probability is not null)
      / nullif(count(*) filter (where outcome_status = 'settled' and probability is not null),0) - 1) as roi,
    count(*) filter (where probability is null) as unavailable,
    count(*) filter (where outcome_status = 'settled' and probability is not null) as scored,
    avg(power(probability-y,2)) filter (where outcome_status = 'settled' and probability is not null) as brier,
    avg(power(market_probability-y,2)) filter (where outcome_status = 'settled' and probability is not null) as paired_market_brier,
    avg(-(y*ln(greatest(1e-6,least(1-1e-6,probability))) + (1-y)*ln(1-greatest(1e-6,least(1-1e-6,probability)))))
      filter (where outcome_status = 'settled' and probability is not null) as log_loss,
    avg(-(y*ln(greatest(1e-6,least(1-1e-6,market_probability))) + (1-y)*ln(1-greatest(1e-6,least(1-1e-6,market_probability)))))
      filter (where outcome_status = 'settled' and probability is not null) as paired_market_log_loss
  from predictions group by model
), bins as (
  select model, least(9,floor(probability*10)::int) as bin,
    count(*) as sample, avg(probability) as predicted, avg(y) as actual
  from predictions where outcome_status = 'settled' and probability is not null group by model,bin
)
select jsonb_build_object(
  'record_type','historical_backtest', 'built_at',max(created_at),
  'availability_assumption','Training results assumed available 24 hours after kickoff; historical publication times unverified',
  'recorded',count(*), 'pending',count(*) filter (where outcome_status = 'pending'),
  'excluded',count(*) filter (where outcome_status = 'excluded'),
  'settled',count(*) filter (where outcome_status = 'settled'),
  'wins',count(*) filter (where won),
  'staked',count(*) filter (where outcome_status = 'settled'),
  'returned',coalesce(sum(unit_return),0),
  'net',coalesce(sum(unit_return),0)-count(*) filter (where outcome_status = 'settled'),
  'roi',100*(sum(unit_return)/nullif(count(*) filter (where outcome_status = 'settled'),0)-1),
  'models',coalesce((select jsonb_agg(to_jsonb(metrics) order by model) from metrics),'[]'::jsonb),
  'calibration',coalesce((select jsonb_agg(to_jsonb(bins) order by model,bin) from bins),'[]'::jsonb)
) from filtered;
$$;

notify pgrst, 'reload schema';
