import assert from 'node:assert/strict';
import test from 'node:test';
import { observations, metrics, analyse, CANDIDATES } from '../scripts/analyse-football-model-candidates.mjs';

// Construct source-backed three-way fixtures with explicit regulation-time outcomes.
function result(id, kickoff, extra = {}) {
  return { league:'epl',source_event_id:id,source_snapshot_key:`tab:${id}`,
    advertised_start_at:kickoff,snapshot_at:new Date(Date.parse(kickoff)-3600000).toISOString(),
    home_team_name:'Home',away_team_name:'Away',home_fixed_win_price:1.8,away_fixed_win_price:3.8,
    draw_fixed_win_price:3.5,outcome_status:'settled',home_team_won:true,away_team_won:false,match_drawn:false,...extra };
}
const fetchedAt = '2026-10-15T00:00:00Z';

test('research excludes duplicates and malformed prices and keeps the 24-hour embargo',()=>{
  const target=result('target','2026-09-10T10:00:00Z');
  const rows=observations([target,target,
    result('boundary','2026-09-09T09:00:00Z'),result('too-recent','2026-09-09T09:00:01Z'),
    result('future','2026-09-11T10:00:00Z'),result('unpriced','2026-09-01T10:00:00Z',{draw_fixed_win_price:null})],fetchedAt);
  assert.equal(rows.length,4);
  assert.equal(rows.find(r=>r.source_event_id==='target').earlier,1);
});

test('changing target and future outcomes cannot change reconstructed probabilities',()=>{
  const earlier=Array.from({length:105},(_,i)=>result(`past-${i}`,'2026-09-01T10:00:00Z',{home_team_won:i%3!==0,match_drawn:i%3===0}));
  const targets=[result('target','2026-09-10T10:00:00Z'),result('future','2026-09-11T10:00:00Z')];
  const a=observations([...earlier,...targets],fetchedAt).find(r=>r.source_event_id==='target');
  const b=observations([...earlier,...targets.map(r=>({...r,home_team_won:false,match_drawn:true}))],fetchedAt).find(r=>r.source_event_id==='target');
  assert.ok(a.rich!==null);
  assert.equal(a.rich,b.rich);assert.equal(a.bucket,b.bucket);assert.equal(a.m.probability,b.m.probability);
  assert.notEqual(a.profit,b.profit);
});

test('unit metrics use captured price and draws lose, with deterministic uncertainty',()=>{
  const rows=observations([result('win','2026-09-01T10:00:00Z'),result('draw','2026-09-02T10:00:00Z',{home_team_won:false,match_drawn:true})],fetchedAt);
  const m=metrics(rows,true);
  assert.equal(m.n,2);assert.equal(m.winRate,50);assert.ok(Math.abs(m.net+0.2)<1e-9);assert.ok(Math.abs(m.roi+10)<1e-9);
  assert.deepEqual(m,metrics(rows,true));
  assert.equal(metrics([]).roi,null);
});

test('fixed candidates abstain without model history and split complete match days',()=>{
  const results=Array.from({length:10},(_,i)=>result(`day-${i}`,`2026-09-${String(i+1).padStart(2,'0')}T10:00:00Z`));
  results.push(result('same-day','2026-09-08T10:00:00Z'));
  const report=analyse({results,fetchedAt});
  assert.equal(report.coverage.recentFrom,'2026-09-08');
  assert.equal(report.coverage.earlier,7);assert.equal(report.coverage.recent,4);
  assert.equal(report.candidates.find(r=>r.key==='consensus65').full.n,0);
  assert.equal(report.candidates.find(r=>r.key==='opponent').full.n,11);
  assert.equal(report.probabilities.full.n,0);
  assert.equal(CANDIDATES.length,12);
});
