import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFootballForecasts, footballForecastProbability, isUpcomingFootballForecast } from '../src/data/footballForecastReader.ts';
const now = Date.parse('2026-09-25T00:00:00Z');

// Create a valid frozen forward record; overrides exercise boundary and unavailable-model cases.
function row(overrides = {}) {
  return {id:'one',experiment:'football_price_gap_v1',cohort:'exact_2',league:'epl',source_event_id:'event',
    kickoff_at:'2026-09-25T12:00:00Z',predicted_at:'2026-09-24T23:30:00Z',snapshot_at:'2026-09-24T23:00:00Z',
    outcome_status:'pending',price_gap:2.2,favourite_price:1.8,market_probability:0.6,bucket_probability:null,rich_probability:0.7,...overrides};
}

test('only the selected model supplies the recommendation, with no baseline fallback', () => {
  assert.equal(footballForecastProbability(row(), {model:'market'}), 0.6);
  assert.equal(footballForecastProbability(row(), {model:'bucket'}), null);
  assert.equal(footballForecastProbability(row(), {model:'rich'}), 0.7);
  for (const value of [NaN, Infinity, -0.1, 1.1, '0.7', undefined]) assert.equal(footballForecastProbability(row({rich_probability:value}), {model:'rich'}), null);
  assert.equal(footballForecastProbability(row({bucket_probability:0}), {model:'bucket'}), 0);
});

test('recommendations expire at kickoff and require eligible prospective captures', () => {
  assert.equal(isUpcomingFootballForecast(row(), now), true);
  assert.equal(isUpcomingFootballForecast(row(), Date.parse(row().kickoff_at)), false);
  for (const override of [
    {outcome_status:'settled'}, {outcome_status:'excluded'}, {kickoff_at:'invalid'},
    {predicted_at:'2026-09-25T01:00:00Z'}, {kickoff_at:'2026-09-26T01:00:00Z'},
    {snapshot_at:'2026-09-24T22:00:00Z'}, {snapshot_at:'2026-09-25T01:00:00Z'},
    {favourite_price:null}, {favourite_price:Infinity}, {price_gap:1.99}, {price_gap:2.5}, {cohort:'unknown'},
  ]) assert.equal(isUpcomingFootballForecast(row(override), now), false, JSON.stringify(override));
  assert.equal(isUpcomingFootballForecast(row({cohort:'plus_2',price_gap:2.5}), now), true);
});

test('forward read pages completely, deduplicates IDs, and scopes every request', async () => {
  const calls=[];
  const entries=await readFootballForecasts('epl','exact_2',async params => {
    calls.push(params);
    return params.offset==='0' ? Array.from({length:1000},(_,i)=>row({id:String(i)}))
      : [row({id:'999'}), row({id:'last'}), row({id:'foreign',league:'ucl'}), row({id:'wrong',cohort:'plus_2'}), row({id:'other',experiment:'other'})];
  },now);
  assert.equal(entries.length,1001);
  for(const params of calls) {
    assert.equal(params.league,'eq.epl'); assert.equal(params.cohort,'eq.exact_2');
    assert.equal(params.experiment,'eq.football_price_gap_v1'); assert.equal(params.outcome_status,'eq.pending');
    assert.equal(params.kickoff_at,`gt.${new Date(now).toISOString()}`);
  }
});

test('combined forecasts preserve league identity and fail visibly if a later page fails', async () => {
  const entries=await readFootballForecasts(null,'plus_2',async params => {
    assert.equal(params.league,undefined);
    return [row({cohort:'plus_2',id:'epl'}),row({cohort:'plus_2',id:'ucl',league:'ucl'})];
  },now);
  assert.deepEqual(entries.map(item=>item.league),['epl','ucl']);
  await assert.rejects(()=>readFootballForecasts(null,'exact_2', async params => {
    if(params.offset==='0')return Array.from({length:1000},(_,i)=>row({id:String(i)}));
    throw new Error('Read failed');
  },now), /Read failed/);
});
