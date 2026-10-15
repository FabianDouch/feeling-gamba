-- Execute in an isolated transaction and roll back all fixtures.
do $$
declare sample jsonb; summary jsonb; blend jsonb; base jsonb; t timestamptz := clock_timestamp(); bad jsonb;
begin
 sample := jsonb_build_object(
   'experiment','football_price_gap_v1','league','epl','source_event_id','home-blend-win',
   'cohort','opponent_3_50_plus','predicted_at',t-interval '3 days','snapshot_at',t-interval '3 days',
   'kickoff_at',t-interval '2 days','home_team_name','Home','away_team_name','Away',
   'favourite_home',true,'favourite_price',2.1,'other_price',3.5,'draw_price',3.2,'price_gap',1.4,
   'market_probability',0.6,'bucket_probability',0.9,'rich_probability',0.3,
   'bucket_sample',30,'rich_sample',100,
   'training',jsonb_build_object('backtest',jsonb_build_object('method','chronological_24h_embargo_v1',
     'embargoHours',24,'resultAvailabilityVerified',false)),
   'outcome_status','settled','won',true,'unit_return',2.1,'settled_at',t
 );
 perform public.replace_football_price_gap_backtests(jsonb_build_array(sample,
   sample || '{"source_event_id":"home-blend-loss","won":false,"unit_return":0,"bucket_probability":null}'::jsonb,
   sample || '{"source_event_id":"home-only","cohort":"home_opponent_3_50_plus"}'::jsonb),t);
 summary := public.get_football_price_gap_backtest_summary('epl','opponent_3_50_plus');
 select value into blend from jsonb_array_elements(summary->'models') where value->>'model'='blend';
 select value into base from jsonb_array_elements(summary->'models') where value->>'model'='market';
 if (blend->>'recorded')::int <> 2 or (blend->>'unavailable')::int <> 1 or (blend->>'scored')::int <> 1
   or abs((blend->>'brier')::numeric - 0.16) > 1e-10
   or abs((blend->>'paired_market_brier')::numeric - 0.16) > 1e-10
   or (blend->>'wins')::int <> 1 or (blend->>'staked')::int <> 1
   or (blend->>'returned')::numeric <> 2.1 or (blend->>'net')::numeric <> 1.1
   or abs((blend->>'roi')::numeric - 110) > 1e-8
   or (base->>'scored')::int <> 2 then
   raise exception 'Blend must require all components and use paired scoring/return denominators: %',summary;
 end if;
 if (public.get_football_price_gap_backtest_summary('epl','home_opponent_3_50_plus')->>'recorded')::int <> 1
   or (public.get_football_price_gap_backtest_summary('ucl','home_opponent_3_50_plus')->>'recorded')::int <> 0 then
   raise exception 'Home cohort or league filters failed';
 end if;
 for bad in select value from jsonb_array_elements(jsonb_build_array(
   sample || '{"cohort":"home_opponent_3_50_plus","favourite_home":false}'::jsonb,
   sample || '{"cohort":"home_opponent_3_50_plus","other_price":3.49}'::jsonb
 )) loop
   begin
     perform public.replace_football_price_gap_backtests(jsonb_build_array(bad),t);
     raise exception 'Invalid home cohort accepted';
   exception when check_violation then null;
   end;
 end loop;
 -- Fresh forward rows use the same cohort constraints and null-aware blend formula.
 insert into public.football_price_gap_predictions (
   experiment,league,source_event_id,cohort,predicted_at,kickoff_at,snapshot_at,
   home_team_name,away_team_name,favourite_home,favourite_price,other_price,draw_price,price_gap,
   market_probability,bucket_probability,rich_probability,bucket_sample,rich_sample,training
 ) values ('football_price_gap_v1','epl','home-only-forward','home_opponent_3_50_plus',
   t,t+interval '1 hour',t-interval '1 minute','Home','Away',true,2.1,3.5,3.2,1.4,0.6,0.9,0.3,30,100,'{}');
 summary := public.get_football_price_gap_summary('epl','home_opponent_3_50_plus');
 select value into blend from jsonb_array_elements(summary->'models') where value->>'model'='blend';
 if (blend->>'recorded')::int <> 1 or (blend->>'unavailable')::int <> 0 or (blend->>'scored')::int <> 0
   or (blend->>'staked')::int <> 0 or (blend->>'returned')::numeric <> 0 or blend->>'roi' is not null then
   raise exception 'Pending forward blend must not enter outcome metrics: %', blend;
 end if;
 begin
   update public.football_price_gap_predictions set bucket_probability=0.8 where source_event_id='home-only-forward';
   raise exception 'Blend components were mutable';
 exception when raise_exception then
   if sqlerrm <> 'Trial forecast inputs and probabilities are immutable' then raise; end if;
 end;
end $$;
set local role anon;
select public.get_football_price_gap_backtest_summary(null,'home_opponent_3_50_plus')->>'recorded' as public_home_read;
reset role;
