import { createHash } from "node:crypto";

export const LEAGUES = ["epl", "ucl", "laliga", "bundesliga", "seriea", "ligue1", "mls", "europaleague", "eflcup", "nationsleague"];
export const EXPERIMENT = "football_price_gap_v1";
export const COHORTS = ["exact_2", "plus_2"];
export const MIN_BUCKET = 30;
export const MIN_RICH = 100;

// Reject absent prices rather than coercing null or blank source fields to zero.
function price(value) {
  const n = Number(value);
  return value !== null && value !== "" && Number.isFinite(n) && n > 1 ? n : null;
}

// Read one three-way market, preserving the team favourite even if draw is shortest.
export function market(row) {
  const home = price(row.home_fixed_win_price);
  const away = price(row.away_fixed_win_price);
  const draw = price(row.draw_fixed_win_price);
  if (!home || !away || !draw || home === away || !row.home_team_name || !row.away_team_name) return null;
  const homeFavourite = home < away;
  const favourite = Math.min(home, away);
  const other = Math.max(home, away);
  const total = 1 / home + 1 / away + 1 / draw;
  return { home, away, draw, favourite, other, gap: Math.round((other - favourite) * 100) / 100,
    homeFavourite, probability: (1 / favourite) / total, drawProbability: (1 / draw) / total };
}

// Exact means the default 50c bucket; cumulative overlaps it and is reported separately.
export function inCohort(m, cohort) {
  return m.gap >= 2 && (cohort === "plus_2" || m.gap < 2.5);
}

// Require a consistent three-way settlement; a draw is a loss for the team favourite.
export function outcome(row, homeFavourite) {
  const flags = [row.home_team_won, row.away_team_won, row.match_drawn];
  if (row.outcome_status !== "settled" || flags.some((flag) => typeof flag !== "boolean")
    || flags.filter(Boolean).length !== 1) return null;
  return Number(homeFavourite ? row.home_team_won : row.away_team_won);
}

// Build one training observation per league/event, excluding post-kickoff or future data.
export function trainingRows(results, cutoff) {
  const unique = new Map();
  const time = Date.parse(cutoff);
  for (const row of results) {
    const m = market(row);
    const start = Date.parse(row.advertised_start_at);
    const captured = Date.parse(row.snapshot_at);
    const observed = Date.parse(row.observed_at);
    const y = m && outcome(row, m.homeFavourite);
    if (!m || y === null || !LEAGUES.includes(row.league) || !row.source_event_id
      || !(captured < start && start < time && observed <= time)) continue;
    const key = `${row.league}:${row.source_event_id}`;
    if (!unique.has(key) || captured > Date.parse(unique.get(key).snapshot_at)) {
      unique.set(key, { ...row, m, y });
    }
  }
  return [...unique.values()].sort((a, b) => `${a.league}:${a.source_event_id}`.localeCompare(`${b.league}:${b.source_event_id}`));
}

// Keep logits finite for numerical stability in fitting and probability scoring.
function logit(p) { return Math.log(p / (1 - p)); }

// Stable logistic transform avoids overflow on extreme but valid source prices.
function sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x)))); }

// Fixed feature scaling and L2 regularisation reduce instability in small league samples.
function features(row) {
  return [1, Math.log(row.m.favourite), Math.log1p(row.m.gap) / 3,
    row.m.drawProbability, Number(row.m.homeFavourite), ...LEAGUES.map((league) => Number(row.league === league))];
}

// Fit an offset logistic model: market probability remains the baseline when weights are zero.
export function fitRich(rows) {
  const wins = rows.filter((row) => row.y === 1).length;
  if (rows.length < MIN_RICH || wins < 10 || rows.length - wins < 10) return null;
  const weights = Array(5 + LEAGUES.length).fill(0);
  const inputs = rows.map((row) => ({ x: features(row), offset: logit(row.m.probability), y: row.y }));
  for (let step = 0; step < 600; step += 1) {
    const gradient = weights.map((weight) => 0.1 * weight);
    for (const { x, offset, y } of inputs) {
      const error = sigmoid(offset + x.reduce((sum, value, i) => sum + value * weights[i], 0)) - y;
      for (let i = 0; i < weights.length; i += 1) gradient[i] += error * x[i] / rows.length;
    }
    for (let i = 0; i < weights.length; i += 1) weights[i] -= 0.1 * gradient[i];
  }
  return weights;
}

// Score one captured market using only the explicitly supplied earlier training set.
export function buildForecasts(row, training, predictedAt, weights = fitRich(training)) {
  const m = market(row);
  if (!m) return [];
  const rows = [];
  const digest = createHash("sha256").update(JSON.stringify(training.map((r) =>
    [r.league, r.source_event_id, r.snapshot_at, r.m, r.y]))).digest("hex");
  const leagueSample = training.filter((r) => r.league === row.league).length;
  const rich = weights && leagueSample >= 20
    ? sigmoid(logit(m.probability) + features({ ...row, m }).reduce((sum, x, i) => sum + x * weights[i], 0)) : null;
  for (const cohort of COHORTS) {
    if (!inCohort(m, cohort)) continue;
    const bucket = training.filter((r) => inCohort(r.m, cohort));
    rows.push({ experiment: EXPERIMENT, league: row.league, source_event_id: row.source_event_id, cohort,
      predicted_at: predictedAt, kickoff_at: row.advertised_start_at, snapshot_at: row.snapshot_at,
      home_team_name: row.home_team_name, away_team_name: row.away_team_name,
      favourite_home: m.homeFavourite, favourite_price: m.favourite, other_price: m.other, draw_price: m.draw,
      price_gap: m.gap, market_probability: m.probability,
      bucket_probability: bucket.length >= MIN_BUCKET ? bucket.reduce((sum, r) => sum + r.y, 0) / bucket.length : null,
      rich_probability: rich, bucket_sample: bucket.length, rich_sample: training.length,
      training: { digest, leagueSample, weights: rich === null ? null : weights,
        minimumBucket: MIN_BUCKET, minimumRich: MIN_RICH, minimumLeague: 20,
        sourceSnapshotKey: row.source_snapshot_key, pooledLeagues: LEAGUES, ridge: 0.1, steps: 600 },
    });
  }
  return rows;
}

// Freeze prospective candidates; historical data supplies training only, never trial outcomes.
export function generateTrial(snapshots, results, now) {
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw new Error("A valid generation timestamp is required.");
  const training = trainingRows(results, now);
  const weights = fitRich(training);
  const rows = [];
  const knownSettled = new Set(results.filter((row) => row.outcome_status === "settled")
    .map((row) => `${row.league}:${row.source_event_id}`));
  const unique = new Map();
  for (const row of snapshots) {
    const key = `${row.league}:${row.source_event_id}`;
    if (!unique.has(key) || Date.parse(row.snapshot_at) > Date.parse(unique.get(key).snapshot_at)) unique.set(key, row);
  }
  for (const row of unique.values()) {
    const m = market(row);
    const start = Date.parse(row.advertised_start_at);
    const captured = Date.parse(row.snapshot_at);
    if (!m || !LEAGUES.includes(row.league) || !row.source_event_id
      || !(time < start && start <= time + 86400000 && captured <= time && captured >= time - 3600000)) continue;
    // An event already known settled cannot re-enter the trial after a source schedule change.
    if (knownSettled.has(`${row.league}:${row.source_event_id}`)) continue;
    rows.push(...buildForecasts(row, training, now, weights));
  }
  return rows;
}

// Settle the frozen team and price, never a later snapshot's favourite or price.
export function settleTrial(prediction, result, now) {
  if (!result || result.source_event_id !== prediction.source_event_id
    || result.league !== prediction.league || Date.parse(prediction.kickoff_at) >= Date.parse(now)) return null;
  const sameTeams = result.home_team_name === prediction.home_team_name && result.away_team_name === prediction.away_team_name;
  // A moved kickoff that preceded generation invalidates the prospective forecast.
  const resultStart = Date.parse(result.advertised_start_at);
  const knownStart = Number.isFinite(resultStart);
  const validStart = resultStart > Date.parse(prediction.predicted_at);
  const resultFinished = resultStart < Date.parse(now);
  const y = sameTeams && validStart && resultFinished ? outcome(result, prediction.favourite_home) : null;
  const status = !sameTeams || (knownStart && !validStart) || result.outcome_status === "non_standard" ? "excluded"
    : y === null ? "pending" : "settled";
  return { outcome_status: status, won: status === "settled" ? Boolean(y) : null,
    unit_return: status === "settled" ? y * Number(prediction.favourite_price) : null,
    settled_at: status === "settled" ? now : null };
}
