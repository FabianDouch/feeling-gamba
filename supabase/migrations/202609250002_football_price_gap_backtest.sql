-- Reconstructed historical predictions are stored separately from immutable forward forecasts.
create table public.football_price_gap_backtests (
  like public.football_price_gap_predictions including all,
  check (predicted_at = snapshot_at),
  check (outcome_status = 'settled'),
  check (coalesce(training #>> '{backtest,method}' = 'chronological_24h_embargo_v1', false)),
  check (coalesce((training #>> '{backtest,embargoHours}')::int = 24, false)),
  check (coalesce((training #>> '{backtest,resultAvailabilityVerified}')::boolean = false, false))
);
alter table public.football_price_gap_backtests enable row level security;
create policy football_price_gap_backtest_public_read on public.football_price_gap_backtests
  for select to anon, authenticated using (true);
revoke all on public.football_price_gap_backtests from anon, authenticated;
grant select on public.football_price_gap_backtests to anon, authenticated;
grant all on public.football_price_gap_backtests to service_role;
comment on table public.football_price_gap_backtests is
  'Historical replay from retained pre-kickoff odds. Not forecasts actually saved at that time. Training uses a 24-hour result-availability assumption.';

-- Replace only derived backtests atomically after a complete source read, including source corrections.
create function public.replace_football_price_gap_backtests(p_rows jsonb, p_generated_at timestamptz)
returns integer language plpgsql security invoker set search_path = public as $$
declare inserted_count integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or p_generated_at is null
    or p_generated_at > clock_timestamp() + interval '1 minute' then
    raise exception 'A backtest array and valid build timestamp are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('football_price_gap_backtests',0));
  if exists (select 1 from football_price_gap_backtests where created_at > p_generated_at) then
    raise exception 'A newer historical reconstruction has already been saved';
  end if;
  delete from football_price_gap_backtests;
  insert into football_price_gap_backtests (
    experiment,league,source_event_id,cohort,predicted_at,kickoff_at,snapshot_at,
    home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
    market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training,
    outcome_status,won,unit_return,settled_at,created_at
  ) select
    experiment,league,source_event_id,cohort,predicted_at,kickoff_at,snapshot_at,
    home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
    market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training,
    outcome_status,won,unit_return,settled_at,p_generated_at
  from jsonb_populate_recordset(null::football_price_gap_backtests,p_rows);
  get diagnostics inserted_count = row_count;
  if exists (select 1 from football_price_gap_backtests where kickoff_at >= p_generated_at) then
    raise exception 'Backtests must refer to past fixtures';
  end if;
  return inserted_count;
end $$;
revoke all on function public.replace_football_price_gap_backtests(jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.replace_football_price_gap_backtests(jsonb,timestamptz) to service_role;

-- Compute full filtered denominators on the server, independently of paginated history rows.
create function public.get_football_price_gap_backtest_summary(
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
    ('market',market_probability), ('bucket',bucket_probability), ('rich',rich_probability)
  ) m(model,probability)
), metrics as (
  select model, count(*) as recorded,
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
grant execute on function public.get_football_price_gap_backtest_summary(text,text,date,date) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
