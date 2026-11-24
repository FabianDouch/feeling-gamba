import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, FOOTBALL, RACING, RACING_SOURCE_MODEL, generateShadowForecasts, reconcileShadowForecast, summarizeShadow } from '../scripts/lib/model-shadow-trials.mjs';
import { refreshShadowTrial } from '../scripts/refresh-model-shadow-trial.mjs';

const NOW = '2026-11-24T04:00:00.000Z';
const time = Date.parse(NOW);
const iso = (offset) => new Date(time + offset).toISOString();

// Model realistic source rows with distinct eligible history and one future event.
function footballRow(index, history = false) {
  return {
    league: 'epl', source_event_id: `game-${index}`, source_snapshot_key: `odds-${index}`,
    advertised_start_at: history ? iso(-(index + 2) * DAY) : iso(10_800_000),
    snapshot_at: history ? iso(-(index + 2) * DAY - 60_000) : iso(-60_000),
    home_team_name: 'A', away_team_name: 'B', home_fixed_win_price: 2.65, away_fixed_win_price: 2.65, draw_fixed_win_price: 3.24,
    outcome_status: history ? 'settled' : 'pending', match_drawn: index % 4 === 0, home_team_won: index % 4 !== 0, away_team_won: false,
  };
}

// Provide the actual prediction row used as the thoroughbred benchmark's selection.
function racingRow(index, history = false) {
  return {
    id: `prediction-${index}`, source: 'betcha', source_race_card_id: `race-${index}`, race_code: 'horse', prediction_model: RACING_SOURCE_MODEL,
    advertised_start: history ? iso(-(index + 2) * DAY) : iso(3_600_000),
    predicted_at: history ? iso(-(index + 2) * DAY - 60_000) : iso(-7_200_000),
    predicted_fixed_win_price: 2.16, predicted_runner_number: 6, predicted_runner_name: 'Frozen Runner',
    outcome_race_id: history ? `official-${index}` : null, outcome_status: history ? 'settled' : 'pending', outcome_result_position: index % 2 + 1,
  };
}

const prior = (factory) => Array.from({ length: 110 }, (_, i) => factory(i, true));

test('draw trial preserves quotes, normalizes both forecasts and includes equal team prices', () => {
  const candidates = [footballRow(200), { ...footballRow(201), draw_fixed_win_price: null },
    { ...footballRow(202), snapshot_at: iso(-3_700_000) }, { ...footballRow(203), advertised_start_at: iso(-1) }];
  const [row, extra] = generateShadowForecasts({ model: FOOTBALL, candidates, results: prior(footballRow), now: NOW });
  assert.equal(extra, undefined);
  assert.deepEqual(row.source_prices, { home: 2.65, away: 2.65, draw: 3.24 });
  for (const prob of [row.baseline, row.prediction]) assert(Math.abs(prob.home + prob.draw + prob.away - 1) < 1e-12);
  assert.equal(row.prediction.home, row.prediction.away);
  assert.equal(row.training.sample, 110);
});

test('later, recent and duplicate outcomes cannot train their own forecast', () => {
  const candidates = [footballRow(200)];
  const results = prior(footballRow);
  const first = generateShadowForecasts({ model: FOOTBALL, candidates, results, now: NOW });
  const add = [{ ...footballRow(200, true), advertised_start_at: iso(DAY), snapshot_at: iso(-10) },
    { ...footballRow(201, true), advertised_start_at: iso(-DAY + 1), snapshot_at: iso(-2 * DAY) }, footballRow(4, true)];
  // An already settled source identity is omitted even if a later source schedule lists it again.
  assert.equal(generateShadowForecasts({ model: FOOTBALL, candidates, results: [...results, add[0]], now: NOW }).length, 0);
  assert.deepEqual(generateShadowForecasts({ model: FOOTBALL, candidates, results: [...results, ...add.slice(1)], now: NOW }), first);
});

test('racing benchmark stays on the saved horse selection and reports a distinct historical price-band rate', () => {
  const candidates = [racingRow(200), { ...racingRow(201), race_code: 'harness' }];
  const rows = generateShadowForecasts({ model: RACING, candidates, results: prior(racingRow), now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_prices.favourite, 2.16);
  assert.equal(rows[0].source_identity.runnerNumber, 6);
  assert.equal(rows[0].baseline.win, 1 / 2.16);
  assert.deepEqual(rows[0].training.bucket, { from: 2, toExclusive: 2.5, sample: 110, wins: 55, winRate: 0.5 });
  const [sparse] = generateShadowForecasts({ model: RACING, candidates, results: prior(racingRow).slice(0, 22), now: NOW });
  assert.equal(sparse.prediction, null);
  assert.equal(sparse.training.bucket.winRate, null);
});

test('settlement checks source identity and kickoff and leaves missing results pending', () => {
  const [match] = generateShadowForecasts({ model: FOOTBALL, candidates: [footballRow(200)], results: prior(footballRow), now: NOW });
  const final = { ...footballRow(200), outcome_status: 'settled' };
  assert.equal(reconcileShadowForecast(match, final, iso(DAY)).actual, 'draw');
  assert.equal(reconcileShadowForecast(match, { ...final, advertised_start_at: iso(-5) }, iso(DAY)).outcome_status, 'excluded');
  assert.equal(reconcileShadowForecast(match, { ...final, match_drawn: null }, iso(DAY)).outcome_status, 'pending');
  assert.equal(reconcileShadowForecast(match, { ...final, source_event_id: 'other' }, iso(DAY)), null);
  const [race] = generateShadowForecasts({ model: RACING, candidates: [racingRow(200)], results: prior(racingRow), now: NOW });
  const settled = { ...racingRow(200), official_start: iso(3_600_000), outcome_status: 'settled' };
  assert.equal(reconcileShadowForecast(race, settled, iso(DAY)).actual, 'win');
  assert.equal(reconcileShadowForecast(race, { ...settled, predicted_runner_number: 7 }, iso(DAY)).outcome_status, 'excluded');
  assert.equal(reconcileShadowForecast(race, { ...settled, official_start: null }, iso(DAY)).outcome_status, 'pending');
});

test('three-way loss and draw Brier use identical scored rows, excluding warm-up records', () => {
  const valid = { outcome_status: 'settled', actual: 'away', baseline: { home: .5, draw: .25, away: .25 }, prediction: { home: .4, draw: .2, away: .4 } };
  const summary = summarizeShadow([valid, { ...valid, prediction: null }], FOOTBALL);
  assert.equal(summary.paired, 1);
  assert.equal(summary.baseline.brier, .0625);
  assert.equal(summary.prediction.logLoss, -Math.log(.4));
  assert.equal(summary.unavailable, 1);
});

test('racing refresh dry run leaves storage alone and retry preserves the original quote', async () => {
  const saved = [];
  const calls = [];
  const now = () => new Date(time);
  const client = {
    all: async (table, filter) => table === 'model_shadow_forecasts' ? structuredClone(saved)
      : filter.outcome_status === 'eq.settled' ? prior(racingRow) : [{ ...racingRow(200), predicted_fixed_win_price: saved.length ? 2.4 : 2.16 }],
    request: async (table, _query, method, batch) => {
      calls.push({ table, method });
      assert.equal(table, 'model_shadow_forecasts');
      assert.equal(method, 'POST');
      const rows = batch.map((row) => ({ ...row, id: 'stored', outcome_status: 'pending', actual: null }));
      saved.push(...rows);
      return rows;
    },
  };
  const dry = await refreshShadowTrial(client, { model: RACING, dryRun: true, clock: now });
  assert.equal(dry.newEligible, 1);
  assert.equal(calls.length, 0);
  assert.equal((await refreshShadowTrial(client, { model: RACING, clock: now })).inserted, 1);
  assert.equal((await refreshShadowTrial(client, { model: RACING, clock: now })).newEligible, 0);
  assert.equal(saved[0].source_prices.favourite, 2.16);
});
