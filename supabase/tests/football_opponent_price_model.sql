-- Run inside a transaction after the backtest migration; caller must roll back fixtures.
do $$
declare sample jsonb; rows jsonb; summary jsonb; saved_count integer; build_time timestamptz := clock_timestamp();
begin
 sample := jsonb_build_object(
   'experiment','football_price_gap_v1','league','epl','source_event_id','backtest-validation-win',
   'cohort','opponent_3_50_plus','predicted_at',build_time-interval '3 days','snapshot_at',build_time-interval '3 days',
   'kickoff_at',build_time-interval '2 days','home_team_name','Home','away_team_name','Away',
   'favourite_home',true,'favourite_price',2.1,'other_price',3.5,'draw_price',3.5,'price_gap',1.4,
   'market_probability',0.6,'bucket_probability',0.7,'rich_probability',null,
   'bucket_sample',30,'rich_sample',50,
   'training',jsonb_build_object('backtest',jsonb_build_object('method','chronological_24h_embargo_v1',
     'embargoHours',24,'resultAvailabilityVerified',false)),
   'outcome_status','settled','won',true,'unit_return',2.1,'settled_at',build_time
 );
 rows := jsonb_build_array(sample);
 saved_count := public.replace_football_price_gap_backtests(rows,build_time);
 summary := public.get_football_price_gap_backtest_summary('epl','opponent_3_50_plus');
 if saved_count <> 1 or (summary->>'wins')::int <> 1 or (summary->>'returned')::numeric <> 2.1 then
   raise exception 'Opponent-price summary is incorrect: %', summary;
 end if;
 if (public.get_football_price_gap_backtest_summary(null,'plus_2')->>'recorded')::int <> 0 then
   raise exception 'Opponent-price records leaked into gap cohort';
 end if;
 -- Invalid thresholds must roll back the replacement and preserve the valid row.
 for rows in select value from jsonb_array_elements(jsonb_build_array(
   sample || '{"other_price":3.49}'::jsonb,
   sample || '{"cohort":"plus_2"}'::jsonb,
   sample || '{"cohort":"exact_2","price_gap":2.5}'::jsonb,
   sample || '{"cohort":"unknown"}'::jsonb
 )) loop
   begin
     perform public.replace_football_price_gap_backtests(jsonb_build_array(rows),build_time);
     raise exception 'Invalid opponent-price row accepted';
   exception when check_violation then null;
   end;
 end loop;
 if (select count(*) from public.football_price_gap_backtests) <> 1 then
   raise exception 'Invalid replacement removed valid history';
 end if;
 -- The prospective store admits the same small-gap rule, with fresh frozen inputs.
 insert into public.football_price_gap_predictions (
   experiment,league,source_event_id,cohort,predicted_at,kickoff_at,snapshot_at,
   home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
   market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training
 ) values ('football_price_gap_v1','epl','opponent-price-forward','opponent_3_50_plus',
   build_time,build_time+interval '1 hour',build_time-interval '1 minute',
   'Home','Away',true,2.1,3.5,3.2,1.4,0.44,null,null,0,0,'{}');
 if (public.get_football_price_gap_summary('epl','opponent_3_50_plus')->>'pending')::int <> 1 then
   raise exception 'Forward summary did not include the new cohort';
 end if;
 if has_table_privilege('anon','public.football_price_gap_backtests','UPDATE')
   or has_function_privilege('anon','public.replace_football_price_gap_backtests(jsonb,timestamptz)','EXECUTE') then
   raise exception 'Public backtest writes are permitted';
 end if;
end $$;
set local role anon;
select public.get_football_price_gap_backtest_summary('epl','opponent_3_50_plus')->>'recorded' as public_backtest_read_count;
reset role;
