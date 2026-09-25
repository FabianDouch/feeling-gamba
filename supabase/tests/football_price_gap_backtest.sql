-- Run inside a transaction after the backtest migration; caller must roll back fixtures.
do $$
declare sample jsonb; rows jsonb; summary jsonb; saved_count integer; build_time timestamptz := clock_timestamp();
begin
 sample := jsonb_build_object(
   'experiment','football_price_gap_v1','league','epl','source_event_id','backtest-validation-win',
   'cohort','exact_2','predicted_at',build_time-interval '3 days','snapshot_at',build_time-interval '3 days',
   'kickoff_at',build_time-interval '2 days','home_team_name','Home','away_team_name','Away',
   'favourite_home',true,'favourite_price',1.8,'other_price',3.8,'draw_price',3.5,'price_gap',2,
   'market_probability',0.6,'bucket_probability',0.7,'rich_probability',null,
   'bucket_sample',30,'rich_sample',50,
   'training',jsonb_build_object('backtest',jsonb_build_object('method','chronological_24h_embargo_v1',
     'embargoHours',24,'resultAvailabilityVerified',false)),
   'outcome_status','settled','won',true,'unit_return',1.8,'settled_at',build_time
 );
 rows := jsonb_build_array(sample,
   sample || '{"cohort":"plus_2"}'::jsonb,
   sample || '{"source_event_id":"backtest-validation-loss","cohort":"plus_2","won":false,"unit_return":0,"bucket_probability":null,"bucket_sample":0}'::jsonb);
 saved_count := public.replace_football_price_gap_backtests(rows,build_time);
 if saved_count <> 3 then raise exception 'Unexpected backtest row count'; end if;
 summary := public.get_football_price_gap_backtest_summary('epl','plus_2');
 if summary->>'record_type' <> 'historical_backtest' or (summary->>'recorded')::int <> 2
   or (summary->>'wins')::int <> 1 or (summary->>'returned')::numeric <> 1.8
   or abs((summary->>'roi')::numeric + 10) > 1e-8 then
   raise exception 'Incorrect historical summary: %', summary;
 end if;
 if (public.get_football_price_gap_backtest_summary('epl','exact_2')->>'recorded')::int <> 1 then
   raise exception 'Historical cohorts were mixed';
 end if;
 if exists (select 1 from public.football_price_gap_predictions where source_event_id like 'backtest-validation-%') then
   raise exception 'Historical records entered the forward table';
 end if;
 perform public.replace_football_price_gap_backtests(rows,build_time);
 if (select count(*) from public.football_price_gap_backtests) <> 3 then
   raise exception 'Rerun duplicated backtests';
 end if;
 begin
   perform public.replace_football_price_gap_backtests(jsonb_build_array(sample || '{"unit_return":-1}'::jsonb),build_time);
   raise exception 'Invalid replacement was accepted';
 exception when check_violation then null;
 end;
 if (select count(*) from public.football_price_gap_backtests) <> 3 then
   raise exception 'Failed replacement removed valid history';
 end if;
 begin
   perform public.replace_football_price_gap_backtests(rows,build_time-interval '1 second');
   raise exception 'Stale replacement was accepted';
 exception when raise_exception then
   if sqlerrm <> 'A newer historical reconstruction has already been saved' then raise; end if;
 end;
 if has_table_privilege('anon','public.football_price_gap_backtests','UPDATE')
   or has_function_privilege('anon','public.replace_football_price_gap_backtests(jsonb,timestamptz)','EXECUTE') then
   raise exception 'Public backtest writes are permitted';
 end if;
end $$;
set local role anon;
select public.get_football_price_gap_backtest_summary('epl','plus_2')->>'recorded' as public_backtest_read_count;
reset role;
