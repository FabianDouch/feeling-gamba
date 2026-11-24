import { createHash } from 'node:crypto';
import { LEAGUES } from './football-price-gap-trial.mjs';

export const FOOTBALL = 'football_draw_v1';
export const RACING = 'thoroughbred_favourite_v1';
export const RACING_SOURCE_MODEL = 'global_bucket_blend_v1';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const MIN_TRAINING = 100;
const MIN_CLASS = 10;
const MIN_BUCKET = 30;
const RIDGE = 0.035;
const STEPS = 220;
const STEP_SIZE = 0.35;

// Treat missing, invalid, and odds-on-certainty values as unavailable input.
function decimal(value) {
  const odds = Number(value);
  return Number.isFinite(odds) && odds > 1 ? odds : null;
}

// Remove the three-way market margin and keep equal team prices eligible.
function footballInputs(row) {
  const home = decimal(row.home_fixed_win_price);
  const away = decimal(row.away_fixed_win_price);
  const draw = decimal(row.draw_fixed_win_price);
  if (!home || !away || !draw || !row.home_team_name || !row.away_team_name) return null;
  const margin = 1 / home + 1 / away + 1 / draw;
  const baseline = { home: 1 / home / margin, away: 1 / away / margin, draw: 1 / draw / margin };
  return {
    prices: { home, away, draw }, baseline, p: baseline.draw,
    features: [1, logit(baseline.draw) + 1.1, Math.abs(Math.log(away / home)), (margin - 1) * 10],
  };
}

// Borrow the actual selected favourite and its saved price from the existing racing prediction.
function racingInputs(row) {
  const favourite = decimal(row.predicted_fixed_win_price);
  if (row.race_code !== 'horse' || row.prediction_model !== RACING_SOURCE_MODEL || !favourite ||
      !row.predicted_runner_name || !Number.isInteger(row.predicted_runner_number)) return null;
  const p = 1 / favourite;
  return { prices: { favourite }, baseline: { win: p, loss: 1 - p }, p, features: [1, logit(p)] };
}

// Accept only a consistent official three-way settlement.
function footballOutcome(row) {
  const flags = [row.home_team_won, row.away_team_won, row.match_drawn];
  if (row.outcome_status !== 'settled' || flags.some((flag) => typeof flag !== 'boolean') || flags.filter(Boolean).length !== 1) return null;
  return ['home', 'away', 'draw'][flags.indexOf(true)];
}

// Unknown runner placings do not count as losses.
function racingOutcome(row) {
  if (row.outcome_status !== 'settled' || !Number.isInteger(row.outcome_result_position) || row.outcome_result_position < 1) return null;
  return row.outcome_result_position === 1 ? 'win' : 'loss';
}

// Bound extreme logits while retaining the unmodified captured prices.
function logit(p) {
  return Math.log(p / (1 - p));
}

// Use the pilot's fixed logistic transform and weights for repeatable scoring.
function probability(input, weights) {
  const score = input.features.reduce((sum, value, index) => sum + value * weights[index], logit(input.p));
  return 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, score))));
}

// Fit the fixed pilot specification once per sport per run, abstaining during warm-up.
function fit(rows) {
  const positives = rows.reduce((sum, row) => sum + row.y, 0);
  if (rows.length < MIN_TRAINING || positives < MIN_CLASS || rows.length - positives < MIN_CLASS) return null;
  let weights = rows[0].features.map(() => 0);
  for (let step = 0; step < STEPS; step += 1) {
    const gradient = weights.map((weight) => RIDGE * weight);
    for (const row of rows) {
      const error = (probability(row, weights) - row.y) / rows.length;
      row.features.forEach((feature, index) => { gradient[index] += error * feature; });
    }
    weights = weights.map((weight, index) => weight - STEP_SIZE * gradient[index]);
  }
  return weights;
}

// Train on distinct older settled events, with a 24-hour embargo and pre-event prices only.
function training(rows, model, cutoff) {
  const football = model === FOOTBALL;
  const unique = new Map();
  for (const row of rows) {
    const input = football ? footballInputs(row) : racingInputs(row);
    const outcome = football ? footballOutcome(row) : racingOutcome(row);
    const start = Date.parse(football ? row.advertised_start_at : row.advertised_start);
    const captured = Date.parse(football ? row.snapshot_at : row.predicted_at);
    const key = football ? `${row.league}:${row.source_event_id}` : row.outcome_race_id;
    if (!input || !outcome || !key || (football && (!LEAGUES.includes(row.league) || !row.source_event_id)) ||
        !(captured < start && start + DAY <= cutoff)) continue;
    const previous = unique.get(key);
    // Football uses the retained price closest to kickoff. Racing uses the earliest saved selection per race.
    if (!previous || (football ? captured > previous.captured : captured < previous.captured)) {
      unique.set(key, { ...input, key, captured, start, y: Number(outcome === (football ? 'draw' : 'win')) });
    }
  }
  return [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// Use half-dollar price buckets matching the app's racing insights.
function priceBucket(price) {
  return Math.floor(price * 2) / 2;
}

// Freeze the first eligible source-backed forecast for each event, with separate baseline and model values.
export function generateShadowForecasts({ model, candidates, results, now }) {
  const football = model === FOOTBALL;
  const time = Date.parse(now);
  if (!Number.isFinite(time) || (!football && model !== RACING)) throw new Error('Valid model and generation time required');
  const prior = training(results, model, time);
  const weights = fit(prior);
  const metadata = {
    sample: prior.length, weights, embargoHours: 24, ridge: RIDGE, steps: STEPS, stepSize: STEP_SIZE,
    digest: createHash('sha256').update(JSON.stringify(prior)).digest('hex'),
  };
  const settled = new Set(results.filter((row) => row.outcome_status === 'settled').map((row) => football
    ? `${row.league}:${row.source_event_id}` : `${row.source}:${row.source_race_card_id}`));
  const unique = new Map();
  for (const row of candidates) {
    const input = football ? footballInputs(row) : racingInputs(row);
    const group = football ? row.league : row.source;
    const eventId = football ? row.source_event_id : row.source_race_card_id;
    const eventAt = football ? row.advertised_start_at : row.advertised_start;
    const capturedAt = football ? row.snapshot_at : row.predicted_at;
    const start = Date.parse(eventAt);
    const capture = Date.parse(capturedAt);
    const key = `${group}:${eventId}`;
    if (!input || !group || !eventId || (football && !LEAGUES.includes(group)) || settled.has(key) ||
        !(time < start && start <= time + DAY && capture <= time && capture >= time - (football ? HOUR : DAY))) continue;
    if (unique.has(key) && Date.parse(unique.get(key).captured_at) >= capture) continue;
    const p = weights ? probability(input, weights) : null;
    let prediction = null;
    let bucket = null;
    if (football && p !== null) {
      const home = (1 - p) * input.baseline.home / (input.baseline.home + input.baseline.away);
      prediction = { home, away: 1 - p - home, draw: p };
    } else if (!football) {
      if (p !== null) prediction = { win: p, loss: 1 - p };
      const low = priceBucket(input.prices.favourite);
      const samePrice = prior.filter((value) => priceBucket(value.prices.favourite) === low);
      const wins = samePrice.reduce((sum, value) => sum + value.y, 0);
      bucket = { from: low, toExclusive: low + 0.5, sample: samePrice.length, wins,
        winRate: samePrice.length >= MIN_BUCKET ? wins / samePrice.length : null };
    }
    unique.set(key, {
      model, source_group: group, source_event_id: eventId, event_at: eventAt, captured_at: capturedAt, forecast_at: now,
      source_prices: input.prices, baseline: input.baseline, prediction, training: { ...metadata, bucket },
      source_identity: football ? { home: row.home_team_name, away: row.away_team_name, snapshotKey: row.source_snapshot_key }
        : { runnerNumber: row.predicted_runner_number, runnerName: row.predicted_runner_name, predictionId: row.id },
    });
  }
  return [...unique.values()];
}

// Score only the original match or runner, and exclude a reschedule that would make the forecast late.
export function reconcileShadowForecast(forecast, result, now) {
  if (!result) return null;
  const football = forecast.model === FOOTBALL;
  if (football ? result.league !== forecast.source_group || result.source_event_id !== forecast.source_event_id
    : result.id !== forecast.source_identity.predictionId) return null;
  const eventAt = Date.parse(football ? result.advertised_start_at : result.official_start);
  const generation = Date.parse(forecast.forecast_at);
  const identity = forecast.source_identity;
  const same = football ? result.home_team_name === identity.home && result.away_team_name === identity.away
    : result.predicted_runner_number === identity.runnerNumber && result.predicted_runner_name === identity.runnerName;
  if ((Number.isFinite(eventAt) && eventAt <= generation) || (football && !same) || result.outcome_status === 'non_standard') {
    return { outcome_status: 'excluded', actual: null, settled_at: null };
  }
  if (!(eventAt > generation && eventAt < Date.parse(now))) return { outcome_status: 'pending', actual: null, settled_at: null };
  if (!same) return { outcome_status: 'excluded', actual: null, settled_at: null };
  const actual = football ? footballOutcome(result) : racingOutcome(result);
  return actual ? { outcome_status: 'settled', actual, settled_at: now }
    : { outcome_status: 'pending', actual: null, settled_at: null };
}

// Report paired scores, with availability and draw calibration bins visible separately.
export function summarizeShadow(rows, model) {
  const target = model === FOOTBALL ? 'draw' : 'win';
  const scored = rows.filter((row) => row.outcome_status === 'settled' && row.prediction);
  const summary = { recorded: rows.length, settled: rows.filter((row) => row.outcome_status === 'settled').length,
    pending: rows.filter((row) => row.outcome_status === 'pending').length,
    excluded: rows.filter((row) => row.outcome_status === 'excluded').length,
    unavailable: rows.filter((row) => !row.prediction).length, paired: scored.length,
    pairedTargetOutcomes: scored.filter((row) => row.actual === target).length };
  const clip = (p) => Math.max(1e-6, Math.min(1 - 1e-6, p));
  for (const key of ['baseline', 'prediction']) {
    const bins = Array.from({ length: 10 }, () => ({ n: 0, expected: 0, observed: 0 }));
    let brier = 0;
    let logLoss = 0;
    for (const row of scored) {
      const p = row[key][target];
      const y = Number(row.actual === target);
      brier += (p - y) ** 2;
      logLoss -= Math.log(clip(row[key][row.actual]));
      const bin = bins[Math.min(9, Math.floor(10 * p))];
      bin.n += 1;
      bin.expected += p;
      bin.observed += y;
    }
    summary[key] = { brier: scored.length ? brier / scored.length : null, logLoss: scored.length ? logLoss / scored.length : null,
      calibration: bins.flatMap((bin, i) => bin.n ? [{ from: i / 10, n: bin.n, mean: bin.expected / bin.n, observed: bin.observed / bin.n }] : []) };
  }
  return summary;
}
