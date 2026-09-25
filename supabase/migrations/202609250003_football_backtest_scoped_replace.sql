-- Hosted PostgREST rejects unscoped deletes; rebuild only the named backtest experiment.
create or replace function public.replace_football_price_gap_backtests(p_rows jsonb, p_generated_at timestamptz)
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
  delete from football_price_gap_backtests where experiment = 'football_price_gap_v1';
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
notify pgrst, 'reload schema';
