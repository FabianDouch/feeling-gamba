import { fileURLToPath } from 'node:url';
import { LEAGUES } from './lib/football-price-gap-trial.mjs';
import { createClient, loadEnv } from './refresh-football-price-gap-trial.mjs';
import { FOOTBALL, RACING, RACING_SOURCE_MODEL, generateShadowForecasts, reconcileShadowForecast, summarizeShadow } from './lib/model-shadow-trials.mjs';

const TABLE = 'model_shadow_forecasts';
const FOOTBALL_COLUMNS = 'source_event_id,source_snapshot_key,snapshot_at,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price,draw_fixed_win_price';
const RACING_COLUMNS = 'id,source,source_race_card_id,predicted_at,advertised_start,race_code,prediction_model,predicted_fixed_win_price,predicted_runner_name,predicted_runner_number,outcome_race_id,outcome_result_position,outcome_status';

// Read existing football market captures and official reconciliations without calling TAB again.
async function readFootball(client, now) {
  const candidates = [];
  const results = [];
  for (const league of LEAGUES) {
    const [markets, outcomes] = await Promise.all([
      client.all(`${league}_market_snapshots`, { select: FOOTBALL_COLUMNS, advertised_start_at: `gt.${now}` }),
      client.all(`${league}_fixed_win_snapshot_results`, { select: `${FOOTBALL_COLUMNS},outcome_status,home_team_won,away_team_won,match_drawn` }),
    ]);
    candidates.push(...markets.map((row) => ({ ...row, league })));
    results.push(...outcomes.map((row) => ({ ...row, league })));
  }
  return { candidates, results };
}

// Read the saved pre-race favourite, plus all settled training rows and existing trial outcomes.
async function readRacing(client, previous, now) {
  const scope = { select: RACING_COLUMNS, race_code: 'eq.horse', prediction_model: `eq.${RACING_SOURCE_MODEL}` };
  const [candidates, settled] = await Promise.all([
    client.all('promotion_predictions', { ...scope, outcome_status: 'eq.pending', advertised_start: `gt.${now}` }),
    client.all('promotion_predictions', { ...scope, outcome_status: 'eq.settled' }),
  ]);
  const results = new Map(settled.map((row) => [row.id, row]));
  const ids = [...new Set(previous.map((row) => row.source_identity.predictionId).filter((id) => id && !results.has(id)))];
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await client.all('promotion_predictions', { ...scope, id: `in.(${ids.slice(i, i + 100).join(',')})` });
    for (const row of rows) results.set(row.id, row);
  }
  const previousIds = new Set(previous.map((row) => row.source_identity.predictionId));
  const raceIds = [...new Set([...results.values()].filter((row) => previousIds.has(row.id) && row.outcome_race_id).map((row) => row.outcome_race_id))];
  const starts = new Map();
  for (let i = 0; i < raceIds.length; i += 100) {
    const rows = await client.all('race_day_entries', { select: 'race_id,advertised_start', order: 'race_id.asc', race_id: `in.(${raceIds.slice(i, i + 100).join(',')})` });
    for (const row of rows) starts.set(row.race_id, row.advertised_start);
  }
  return { candidates, results: [...results.values()].map((row) => ({ ...row, official_start: starts.get(row.outcome_race_id) })) };
}

// Reconcile one source identity per event and retain the latest source result if snapshots repeat.
function indexResults(results, model) {
  const index = new Map();
  for (const row of results) {
    const key = model === FOOTBALL ? `${row.league}:${row.source_event_id}` : row.id;
    if (!index.has(key) || (model === FOOTBALL && Date.parse(row.snapshot_at) > Date.parse(index.get(key).snapshot_at))) index.set(key, row);
  }
  return index;
}

// Insert prospective forecasts, reconcile corrections, and report the evaluated sample in each group.
export async function refreshShadowTrial(client, { model, dryRun = false, clock = () => new Date() }) {
  if (![FOOTBALL, RACING].includes(model)) throw new Error('Unknown shadow model');
  const previous = await client.all(TABLE, { model: `eq.${model}` });
  const readAt = clock().toISOString();
  const { candidates, results } = model === FOOTBALL ? await readFootball(client, readAt) : await readRacing(client, previous, readAt);
  const now = clock().toISOString();
  const indexed = indexResults(results, model);
  const key = (row) => `${row.source_group}:${row.source_event_id}`;
  const keys = new Set(previous.map(key));
  const eligible = generateShadowForecasts({ model, candidates, results, now });
  const fresh = eligible.filter((row) => !keys.has(key(row)));
  let changed = 0;
  for (const row of previous) {
    const result = indexed.get(model === FOOTBALL ? key(row) : row.source_identity.predictionId);
    const outcome = reconcileShadowForecast(row, result, now);
    if (!outcome || (outcome.outcome_status === row.outcome_status && outcome.actual === row.actual)) continue;
    if (!dryRun) await client.request(TABLE, { id: `eq.${row.id}` }, 'PATCH', outcome);
    Object.assign(row, outcome);
    changed += 1;
  }
  let submitted = 0;
  if (!dryRun) {
    for (let i = 0; i < fresh.length; i += 100) {
      const time = clock().getTime();
      const batch = fresh.slice(i, i + 100).filter((row) => Date.parse(row.event_at) > time);
      if (!batch.length) continue;
      const added = await client.request(TABLE, { on_conflict: 'model,source_group,source_event_id' },
        'POST', batch, 'resolution=ignore-duplicates,return=representation');
      previous.push(...added);
      submitted += added.length;
    }
  }
  const report = summarizeShadow(previous, model);
  const groups = Object.fromEntries([...Map.groupBy(previous, (row) => row.source_group)].map(([group, rows]) => {
    const { paired, settled, baseline, prediction } = summarizeShadow(rows, model);
    return [group, { paired, settled, baselineBrier: baseline.brier, modelBrier: prediction.brier,
      baselineLogLoss: baseline.logLoss, modelLogLoss: prediction.logLoss }];
  }));
  return { model, dryRun, evaluatedAt: now, eligible: eligible.length, newEligible: fresh.length, inserted: submitted,
    changedOutcomes: changed, summary: report, groups };
}

// Manual and scheduled entry point with an explicit no-write option.
async function main() {
  const [model, ...args] = process.argv.slice(2);
  if (![FOOTBALL, RACING].includes(model) || args.some((arg) => arg !== '--dry-run')) {
    throw new Error(`Usage: node refresh-model-shadow-trial.mjs ${FOOTBALL}|${RACING} [--dry-run]`);
  }
  await loadEnv();
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.FEELING_GAMBA_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL and service key required');
  console.log(JSON.stringify(await refreshShadowTrial(createClient(url, key), { model, dryRun: args.includes('--dry-run') }), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
