import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUpcomingFootballPrediction, readFootballLeaguePredictions, readCombinedFootballPredictions } from '../src/data/footballPredictionReader.ts';
const now=Date.parse('2026-09-25T00:00:00Z');
const fresh='2026-09-24T23:00:00Z';

// Build source rows with real query fields so the adapter's eligibility and identity contracts are exercised.
function row(overrides={}) {
 return {id:'one',prediction_model:'epl_fixed_win_percentage_single_v1',source_date:'2026-09-25',predicted_at:fresh,
 advertised_start_at:'2026-09-26T12:00:00Z',outcome_status:'pending',prediction_rank:2,match_label:'A v B',predicted_team_name:'A',predicted_player_name:null,
 predicted_fixed_win_price:1.75,win_score:67.1234,signal_label:null,signal_detail:'Source model detail',signal_tone:'neutral',bucket_sample_size:32,lineup_status:'confirmed',...overrides};
}

test('upcoming eligibility requires an unstarted pending match and a genuine finite score',()=>{
 assert.equal(isUpcomingFootballPrediction(row(),now),true);
 for(const overrides of [{advertised_start_at:new Date(now).toISOString()},{advertised_start_at:'invalid'},{advertised_start_at:null},{outcome_status:'settled'},{outcome_status:'missing_result'},{outcome_status:'non_standard'},{win_score:null},{win_score:'NaN'},{win_score:101},{win_score:-1}]){
  assert.equal(isUpcomingFootballPrediction(row(overrides),now),false,JSON.stringify(overrides));
 }
 assert.equal(isUpcomingFootballPrediction(row({win_score:0}),now),true);
});

test('latest-run lookup is one request and pagination includes rows beyond the first 1000 without duplicates',async()=>{
 const calls=[];
 const read=async(table,params)=>{
  calls.push({table,params});
  if(params.limit==='1')return [{source_date:'2026-09-25',predicted_at:fresh}];
  if(params.offset==='0')return Array.from({length:1000},(_,index)=>row({id:String(index)}));
  return [row({id:'999'}),row({id:'last'})];
 };
 const result=await readFootballLeaguePredictions({key:'epl',label:'EPL'},'fixed_win_percentage',read,now);
 assert.equal(result.totalCount,1001);
 assert(result.predictions.some(item=>item.id==='last'));
 assert.equal(calls.filter(call=>call.params.limit==='1').length,1);
 assert.deepEqual(calls.slice(1).map(call=>call.params.offset),['0','1000']);
 for(const {params} of calls.slice(1)){
  assert.equal(params.predicted_at,`eq.${fresh}`);
  assert.equal(params.outcome_status,'eq.pending');
  assert.equal(params.advertised_start_at,`gt.${new Date(now).toISOString()}`);
 }
});

test('defensive filtering keeps old, settled and foreign-model rows out even if a response includes them',async()=>{
 const rows=[row(),row({id:'old',advertised_start_at:'2026-09-20T00:00:00Z'}),row({id:'settled',outcome_status:'settled'}),row({id:'foreign',prediction_model:'ucl_fixed_win_percentage_single_v1'}),row({id:'scoreless',win_score:null})];
 const result=await readFootballLeaguePredictions({key:'epl',label:'EPL'},'fixed_win_percentage',async(_table,p)=>p.limit==='1'?[rows[0]]:rows,now);
 assert.deepEqual(result.predictions.map(item=>item.id),['one']);
 assert.equal(result.predictions[0].score,'67.12%');
 assert.equal(result.predictions[0].rank,'#2');
 assert.equal(result.stale,false);
});

test('an older run stays labelled stale and never invents a missing price',async()=>{
 const old=row({predicted_at:'2026-09-20T00:00:00Z',predicted_fixed_win_price:null});
 const result=await readFootballLeaguePredictions({key:'epl',label:'EPL'},'fixed_win_percentage',async(_t,p)=>p.limit==='1'?[old]:[old],now);
 assert.equal(result.stale,true);
 assert.equal(result.predictions[0].price,'No price');
 assert.equal(result.generatedAt,old.predicted_at);
});

test('empty generation is successful coverage and is distinct from a failed source',async()=>{
 const result=await readCombinedFootballPredictions([{key:'eflcup',label:'EFL Cup'},{key:'mls',label:'MLS'}],'fixed_win_percentage',async table=>{
  if(table.startsWith('mls'))throw new Error('HTTP 503');
  return [];
 },now);
 assert.equal(result.coverage[0].result.sourceDate,null);
 assert.equal(result.coverage[0].error,null);
 assert.equal(result.coverage[1].result,null);
 assert.match(result.coverage[1].error,/503/);
 assert.deepEqual(result.predictions,[]);
});

test('combined reads preserve league/model identity, use kickoff ordering and have the same membership as individual reads',async()=>{
 const leagues=[{key:'epl',label:'EPL'},{key:'ucl',label:'UCL'}];
 const read=async(table,p)=>{
  const key=table.split('_')[0];
  return p.limit==='1'?[{source_date:'2026-09-25',predicted_at:fresh}]:[row({id:'same-id',prediction_model:`${key}_goal_scorer_percentage_single_v1`,advertised_start_at:key==='ucl'?'2026-09-26T10:00:00Z':'2026-09-26T12:00:00Z'})];
 };
 const combined=await readCombinedFootballPredictions(leagues,'goal_scorer_percentage',read,now);
 const individual=await Promise.all(leagues.map(league=>readFootballLeaguePredictions(league,'goal_scorer_percentage',read,now)));
 assert.deepEqual(combined.predictions.map(item=>item.league),['ucl','epl']);
 assert.equal(new Set(combined.predictions.map(item=>item.identity)).size,2);
 assert.deepEqual(new Set(combined.predictions.map(item=>item.identity)),new Set(individual.flatMap(result=>result.predictions.map(item=>item.identity))));
});

test('bounded concurrency and a failed later page cannot produce a silently truncated league total',async()=>{
 let active=0,max=0;
 const leagues=Array.from({length:8},(_,i)=>({key:`league${i}`,label:`League ${i}`}));
 const result=await readCombinedFootballPredictions(leagues,'fixed_win_percentage',async(table,p)=>{
  active++;max=Math.max(max,active);
  await new Promise(resolve=>setTimeout(resolve,1));active--;
  if(p.limit==='1')return [{source_date:'2026-09-25',predicted_at:fresh}];
  if(table.startsWith('league0')){
   if(p.offset==='1000')throw new Error('Second page failed');
   return Array.from({length:1000},(_,i)=>row({id:String(i),prediction_model:'league0_fixed_win_percentage_single_v1'}));
  }
  return [];
 },now);
 assert(max<=3);assert(max>1);
 assert.equal(result.coverage[0].result,null);
 assert.match(result.coverage[0].error,/Second page/);
 assert.equal(result.coverage.length,8);
 assert.equal(result.predictions.length,0);
});
