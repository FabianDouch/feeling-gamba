-- Prospective experiment only; never populate historical forecasts from current aggregates.
create table public.football_price_gap_predictions (
  id uuid primary key default gen_random_uuid(),
  experiment text not null check (experiment = 'football_price_gap_v1'),
  league text not null check (league in ('epl','ucl','laliga','bundesliga','seriea','ligue1','mls','europaleague','eflcup','nationsleague')),
  source_event_id text not null,
  cohort text not null check (cohort in ('exact_2','plus_2')),
  predicted_at timestamptz not null,
  kickoff_at timestamptz not null,
  snapshot_at timestamptz not null,
  home_team_name text not null,
  away_team_name text not null,
  favourite_home boolean not null,
  favourite_price numeric not null check (favourite_price > 1),
  other_price numeric not null check (other_price > favourite_price),
  draw_price numeric not null check (draw_price > 1),
  price_gap numeric not null check (price_gap >= 2),
  market_probability double precision not null check (market_probability > 0 and market_probability < 1),
  bucket_probability double precision check (bucket_probability between 0 and 1),
  rich_probability double precision check (rich_probability > 0 and rich_probability < 1),
  bucket_sample integer not null check (bucket_sample >= 0),
  rich_sample integer not null check (rich_sample >= 0),
  training jsonb not null,
  outcome_status text not null default 'pending' check (outcome_status in ('pending','settled','excluded')),
  won boolean,
  unit_return numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (experiment,league,source_event_id,cohort),
  check (snapshot_at <= predicted_at and predicted_at < kickoff_at),
  check (cohort <> 'exact_2' or price_gap < 2.5),
  check ((outcome_status = 'settled' and won is not null and unit_return is not null and settled_at is not null
    and unit_return = case when won then favourite_price else 0 end)
    or (outcome_status <> 'settled' and won is null and unit_return is null and settled_at is null))
);
create index football_price_gap_history_idx on public.football_price_gap_predictions (league,cohort,kickoff_at desc);
alter table public.football_price_gap_predictions enable row level security;
create policy football_price_gap_public_read on public.football_price_gap_predictions for select to anon, authenticated using (true);
revoke all on public.football_price_gap_predictions from anon, authenticated;
grant select on public.football_price_gap_predictions to anon, authenticated;
grant all on public.football_price_gap_predictions to service_role;

-- Preserve predictions during retries/corrections and reject forecasts inserted after kickoff.
create function public.guard_football_price_gap_forecast() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if new.kickoff_at <= clock_timestamp() or new.predicted_at > clock_timestamp()
      or new.predicted_at < clock_timestamp() - interval '15 minutes'
      or new.snapshot_at < new.predicted_at - interval '1 hour'
      or new.kickoff_at > new.predicted_at + interval '24 hours'
      or new.outcome_status <> 'pending' then
      raise exception 'Trial forecasts require a fresh pre-kickoff market and current prediction timestamp';
    end if;
  elsif (to_jsonb(new) - array['outcome_status','won','unit_return','settled_at'])
    is distinct from (to_jsonb(old) - array['outcome_status','won','unit_return','settled_at']) then
    raise exception 'Trial forecast inputs and probabilities are immutable';
  end if;
  return new;
end $$;
create trigger guard_football_price_gap_forecast before insert or update on public.football_price_gap_predictions
for each row execute function public.guard_football_price_gap_forecast();

-- Compute full filtered denominators on the server, independently of paginated history rows.
create function public.get_football_price_gap_summary(
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
grant execute on function public.get_football_price_gap_summary(text,text,date,date) to anon, authenticated, service_role;
