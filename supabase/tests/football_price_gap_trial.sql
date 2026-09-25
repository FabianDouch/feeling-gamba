-- Run after the migration in an isolated database; all fixtures roll back.
begin;
insert into public.football_price_gap_predictions (
 experiment,league,source_event_id,cohort,predicted_at,kickoff_at,snapshot_at,
 home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
 market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training
) values (
 'football_price_gap_v1','epl','guard-test','exact_2',now(),now()+interval '1 hour',now()-interval '5 minutes',
 'Home','Away',true,1.8,3.8,3.5,2,0.6,0.7,null,30,50,'{}'
);

do $$
begin
  begin
    update public.football_price_gap_predictions set favourite_price=2 where source_event_id='guard-test';
    raise exception 'Forecast mutation was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Trial forecast inputs and probabilities are immutable' then raise; end if;
  end;
  begin
    insert into public.football_price_gap_predictions
      select gen_random_uuid(),experiment,league,'late-test',cohort,now()-interval '2 hours',now()-interval '1 hour',now()-interval '3 hours',
        home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
        market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training,outcome_status,won,unit_return,settled_at,created_at
      from public.football_price_gap_predictions where source_event_id='guard-test';
    raise exception 'Late insert was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Trial forecasts require a fresh pre-kickoff market and current prediction timestamp' then raise; end if;
  end;
end $$;

-- Synthetic past records exercise scoring only, not the prospective insertion path.
alter table public.football_price_gap_predictions disable trigger guard_football_price_gap_forecast;
insert into public.football_price_gap_predictions
  select gen_random_uuid(),experiment,league,'win-test',cohort,now()-interval '2 days',now()-interval '1 day',now()-interval '2 days',
    home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
    0.6,0.7,null,bucket_sample,rich_sample,training,'settled',true,1.8,now(),now()
  from public.football_price_gap_predictions where source_event_id='guard-test';
insert into public.football_price_gap_predictions
  select gen_random_uuid(),experiment,league,'draw-test',cohort,now()-interval '2 days',now()-interval '1 day',now()-interval '2 days',
    home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
    0.6,null,null,0,0,training,'settled',false,0,now(),now()
  from public.football_price_gap_predictions where source_event_id='guard-test';
alter table public.football_price_gap_predictions enable trigger guard_football_price_gap_forecast;

do $$
declare summary jsonb; bucket jsonb; empty_summary jsonb;
begin
 summary := public.get_football_price_gap_summary('epl','exact_2');
 if (summary->>'recorded')::int <> 3 or (summary->>'settled')::int <> 2 or (summary->>'pending')::int <> 1
   or (summary->>'wins')::int <> 1 or (summary->>'returned')::numeric <> 1.8
   or (summary->>'net')::numeric <> -0.2 or abs((summary->>'roi')::numeric + 10) > 1e-8 then
   raise exception 'Incorrect cohort counts/returns: %',summary;
 end if;
 select value into bucket from jsonb_array_elements(summary->'models') where value->>'model'='bucket';
 if (bucket->>'scored')::int <> 1 or (bucket->>'unavailable')::int <> 1
   or abs((bucket->>'brier')::numeric - 0.09) > 1e-8
   or abs((bucket->>'paired_market_brier')::numeric - 0.16) > 1e-8 then
   raise exception 'Paired baseline or missing prediction denominator is wrong: %',bucket;
 end if;
 empty_summary := public.get_football_price_gap_summary('ucl','exact_2');
 if (empty_summary->>'recorded')::int <> 0 or empty_summary->>'roi' is not null then
   raise exception 'Empty cohort must not claim performance';
 end if;
 if (public.get_football_price_gap_summary('epl','plus_2')->>'recorded')::int <> 0 then
   raise exception 'Exact and cumulative groups leaked into each other';
 end if;
 if has_table_privilege('anon','public.football_price_gap_predictions','UPDATE') then
   raise exception 'Anonymous updates are permitted';
 end if;
end $$;
-- Official corrections may alter outcomes while forecasts remain unchanged.
update public.football_price_gap_predictions set won=false,unit_return=0,settled_at=now()
where source_event_id='win-test';
do $$
begin
 if (public.get_football_price_gap_summary('epl','exact_2')->>'wins')::int <> 0 then
   raise exception 'Outcome correction did not reach summary';
 end if;
 if (select bucket_probability from public.football_price_gap_predictions where source_event_id='win-test') <> 0.7 then
   raise exception 'Outcome correction rewrote a forecast';
 end if;
end $$;
set local role anon;
select public.get_football_price_gap_summary('epl','exact_2')->>'recorded' as public_read_count;
reset role;
rollback;
