import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeSupabaseProjectUrl,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_BATCH_SIZE = 300;
const DOT_ENV_FILES = [".env.local", ".env"];
const PAGE_SIZE = 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SOURCE_TIME_ZONE = "Pacific/Auckland";
const UFC_MODEL_KEYS = [
  "ufc_multi_favourite_price_win_percentage_v1",
  "ufc_multi_other_fighter_price_win_percentage_v1",
  "ufc_multi_price_difference_win_percentage_v1",
];
const UFC_THRESHOLD_MODELS = {
  65: {
    label: "65%+ win-rate single",
    targetModel: "ufc_single_win_percentage_65_plus_v1",
    threshold: 65,
  },
  75: {
    label: "75%+ win-rate single",
    targetModel: "ufc_single_win_percentage_75_plus_v1",
    threshold: 75,
  },
  85: {
    label: "85%+ win-rate single",
    targetModel: "ufc_single_win_percentage_85_plus_v1",
    threshold: 85,
  },
};

const UFC_SINGLE_PREDICTION_COLUMNS = [
  "advertised_start",
  "bucket_label",
  "bucket_sample_size",
  "bucket_win_percentage",
  "fight_name",
  "other_entrant_id",
  "other_fighter_fixed_win_price",
  "other_fighter_name",
  "outcome_favourite_won",
  "outcome_fight_id",
  "outcome_status",
  "outcome_updated_at",
  "outcome_win_return",
  "outcome_winner_name",
  "predicted_at",
  "predicted_entrant_id",
  "predicted_fighter_name",
  "predicted_fixed_win_price",
  "prediction_model",
  "prediction_rank",
  "prediction_signature",
  "price_difference",
  "raw",
  "signal_detail",
  "signal_label",
  "signal_tone",
  "source",
  "source_card_id",
  "source_card_name",
  "source_card_slug",
  "source_date",
  "source_event_id",
  "source_market_id",
  "source_time_zone",
  "win_score",
];

/**
 * Parses options for reconstructing UFC single rows from stored same-card multi legs.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    fromDate: null,
    predictionModel: null,
    replaceExisting: false,
    requireSupabase: false,
    threshold: null,
    thresholdModel: null,
    toDate: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--replace-existing") {
      options.replaceExisting = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--from-date=")) {
      options.fromDate = arg.slice("--from-date=".length);
    } else if (arg.startsWith("--prediction-model=")) {
      options.predictionModel = arg.slice("--prediction-model=".length);
    } else if (arg.startsWith("--threshold=")) {
      options.threshold = Number(arg.slice("--threshold=".length));
    } else if (arg.startsWith("--to-date=")) {
      options.toDate = arg.slice("--to-date=".length);
    }
  }

  for (const [label, value] of [["--from-date", options.fromDate], ["--to-date", options.toDate]]) {
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${label} must be YYYY-MM-DD.`);
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (options.predictionModel && !UFC_MODEL_KEYS.includes(options.predictionModel)) {
    throw new Error(`--prediction-model must be one of ${UFC_MODEL_KEYS.join(", ")}.`);
  }

  if (options.threshold !== null) {
    options.thresholdModel = UFC_THRESHOLD_MODELS[options.threshold];

    if (!options.thresholdModel) {
      throw new Error("--threshold must be 65, 75, or 85.");
    }
  }

  return options;
}

/**
 * Loads repo-local env files for manual Supabase repair scripts.
 */
async function loadDotEnvFiles() {
  for (const file of DOT_ENV_FILES) {
    try {
      const contents = await readFile(path.join(REPO_ROOT, file), "utf8");

      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

        if (!match || process.env[match[1]] !== undefined) {
          continue;
        }

        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * Reads Supabase service-role config for local backfill writes.
 */
function getSupabaseWriteConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.FEELING_GAMBA_SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    key,
    url: normalizeSupabaseProjectUrl(url),
  };
}

/**
 * Splits Supabase reads and writes into bounded batches.
 */
function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Escapes values used in PostgREST in.(...) filters.
 */
function escapePostgrestInValue(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

/**
 * Minimal Supabase REST client for UFC single backfills.
 */
function createSupabaseRestClient(config, batchSize) {
  async function request(table, options = {}) {
    const url = new URL(`${config.url}/rest/v1/${table}`);

    if (options.search) {
      for (const [key, value] of Object.entries(options.search)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: options.prefer ?? "return=representation",
      },
      method: options.method ?? "GET",
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase ${table} ${options.method ?? "GET"} failed with HTTP ${response.status}: ${message.slice(0, 500)}`);
    }

    if (options.expectJson === false) {
      return null;
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function selectAll(table, search) {
    const rows = [];
    let offset = 0;

    while (true) {
      const page = await request(table, {
        search: {
          ...search,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        },
      });

      rows.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;
    }

    return rows;
  }

  async function upsert(table, rows, onConflict, prefer = "resolution=merge-duplicates,return=minimal") {
    if (!rows.length) {
      return;
    }

    for (const batch of chunk(rows, batchSize)) {
      await request(table, {
        body: batch,
        method: "POST",
        prefer,
        search: {
          on_conflict: onConflict,
        },
      });
    }
  }

  return {
    request,
    selectAll,
    upsert,
  };
}

/**
 * Converts nullable database numbers to finite numbers.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rounds fixed-win return values to cents.
 */
function roundMoney(value) {
  const parsed = numeric(value);
  return parsed === null ? 0 : Number(parsed.toFixed(2));
}

/**
 * Creates the same stable signature used by live UFC single prediction writes.
 */
function createUfcSinglePredictionSignature(row) {
  return JSON.stringify({
    fixedWinPrice: row.predicted_fixed_win_price,
    modelKey: row.prediction_model,
    predictedFighterName: row.predicted_fighter_name,
    predictionRank: row.prediction_rank,
    sourceCardId: row.source_card_id,
    sourceEventId: row.source_event_id,
    winScore: row.win_score,
  });
}

/**
 * Maps one stored UFC multi leg to an equivalent standalone single prediction.
 */
function mapUfcLegToSinglePrediction(recommendation, leg, thresholdModel = null) {
  const raw = leg.raw ?? {};
  const signal = raw.signal ?? raw.modelSignal ?? {};
  const row = normalizeUfcSinglePredictionRow({
    advertised_start: leg.advertised_start,
    bucket_label: leg.bucket_label ?? signal.bucketLabel ?? null,
    bucket_sample_size: leg.bucket_sample_size ?? signal.bucketSampleSize ?? signal.sampleSize ?? null,
    bucket_win_percentage: leg.bucket_win_percentage ?? signal.bucketWinPercentage ?? signal.winScore ?? null,
    fight_name: raw.fightName ?? raw.name ?? null,
    other_entrant_id: leg.other_entrant_id,
    other_fighter_fixed_win_price: numeric(leg.other_fighter_fixed_win_price),
    other_fighter_name: leg.other_fighter_name,
    outcome_favourite_won: leg.outcome_favourite_won,
    outcome_fight_id: leg.outcome_fight_id,
    outcome_status: leg.outcome_status ?? "pending",
    outcome_updated_at: leg.outcome_updated_at,
    outcome_win_return: roundMoney(leg.outcome_win_return),
    outcome_winner_name: leg.outcome_winner_name,
    predicted_at: recommendation.predicted_at,
    predicted_entrant_id: leg.predicted_entrant_id,
    predicted_fighter_name: leg.predicted_fighter_name,
    predicted_fixed_win_price: numeric(leg.predicted_fixed_win_price),
    prediction_model: thresholdModel?.targetModel ?? recommendation.prediction_model,
    prediction_rank: leg.prediction_rank ?? leg.leg_index,
    price_difference: numeric(leg.price_difference),
    raw: {
      backfilledFrom: "ufc_multi_recommendation_legs",
      leg,
      recommendation: {
        id: recommendation.id,
        prediction_model: recommendation.prediction_model,
        predicted_at: recommendation.predicted_at,
        recommendation_type: recommendation.recommendation_type,
        source: recommendation.source,
        source_card_id: recommendation.source_card_id,
        source_date: recommendation.source_date,
      },
    },
    signal_detail: thresholdModel ? `${thresholdModel.threshold}%+ UFC single from ${signal.detail ?? leg.signal_label ?? "stored UFC multi leg"}` : signal.detail ?? null,
    signal_label: thresholdModel?.label ?? leg.signal_label ?? signal.label ?? null,
    signal_tone: thresholdModel ? "positive" : leg.signal_tone ?? signal.tone ?? null,
    source: recommendation.source,
    source_card_id: recommendation.source_card_id,
    source_card_name: recommendation.source_card_name,
    source_card_slug: recommendation.source_card_slug,
    source_date: recommendation.source_date,
    source_event_id: leg.source_event_id,
    source_market_id: leg.source_market_id,
    source_time_zone: recommendation.source_time_zone ?? SOURCE_TIME_ZONE,
    win_score: numeric(leg.win_score),
  });

  return {
    ...row,
    prediction_signature: createUfcSinglePredictionSignature(row),
  };
}

/**
 * Gives every UFC single row the same nullable column set for PostgREST bulk writes.
 */
function normalizeUfcSinglePredictionRow(row) {
  return Object.fromEntries(UFC_SINGLE_PREDICTION_COLUMNS.map((column) => [
    column,
    row[column] ?? null,
  ]));
}

/**
 * Reads stored UFC multi recommendations for all models or one selected model.
 */
async function fetchSourceRecommendations(supabase, options) {
  return await supabase.selectAll("ufc_multi_recommendations", {
    ...(options.fromDate ? { source_date: `gte.${options.fromDate}` } : {}),
    ...(options.toDate ? { source_date: `lte.${options.toDate}` } : {}),
    ...(options.predictionModel ? { prediction_model: `eq.${options.predictionModel}` } : {
      prediction_model: `in.(${UFC_MODEL_KEYS.map((key) => `"${key}"`).join(",")})`,
    }),
    order: "source_date.asc,prediction_model.asc,source_card_id.asc,predicted_at.asc",
    select: [
      "id",
      "prediction_model",
      "source",
      "source_date",
      "source_time_zone",
      "source_card_id",
      "source_card_name",
      "source_card_slug",
      "predicted_at",
      "recommendation_type",
    ].join(","),
  });
}

/**
 * Reads stored UFC multi legs for the selected parent recommendations.
 */
async function fetchSourceLegs(supabase, recommendationIds) {
  const rows = [];

  for (const batch of chunk(recommendationIds, 100)) {
    const ids = batch.map((id) => `"${escapePostgrestInValue(id)}"`).join(",");
    const batchRows = await supabase.selectAll("ufc_multi_recommendation_legs", {
      order: "recommendation_id.asc,prediction_rank.asc,leg_index.asc",
      recommendation_id: `in.(${ids})`,
      select: [
        "id",
        "recommendation_id",
        "advertised_start",
        "bucket_label",
        "bucket_sample_size",
        "bucket_win_percentage",
        "leg_index",
        "other_entrant_id",
        "other_fighter_fixed_win_price",
        "other_fighter_name",
        "outcome_favourite_won",
        "outcome_fight_id",
        "outcome_status",
        "outcome_updated_at",
        "outcome_win_return",
        "outcome_winner_name",
        "predicted_entrant_id",
        "predicted_fighter_name",
        "predicted_fixed_win_price",
        "prediction_rank",
        "price_difference",
        "raw",
        "signal_label",
        "signal_tone",
        "source_event_id",
        "source_market_id",
        "win_score",
      ].join(","),
    });

    rows.push(...batchRows);
  }

  return rows;
}

/**
 * Keeps one single prediction per model/card/event when old multis overlap.
 */
function dedupeSingleRows(rows) {
  const rowsByKey = new Map();

  for (const row of rows) {
    const key = `${row.prediction_model}:${row.source}:${row.source_date}:${row.source_card_id}:${row.source_event_id}`;
    const existing = rowsByKey.get(key);

    if (!existing || compareUfcSingleDedupPriority(row, existing) < 0) {
      rowsByKey.set(key, row);
    }
  }

  return [...rowsByKey.values()].sort(compareUfcSingleRows);
}

/**
 * Chooses the strongest signal when multiple source models map to the same threshold single.
 */
function compareUfcSingleDedupPriority(left, right) {
  const rightScore = Number(right.win_score ?? -Infinity);
  const leftScore = Number(left.win_score ?? -Infinity);

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return Number(left.prediction_rank ?? Infinity) - Number(right.prediction_rank ?? Infinity)
    || String(left.prediction_model).localeCompare(String(right.prediction_model));
}

/**
 * Sorts UFC singles by date, model, card, and best rank.
 */
function compareUfcSingleRows(left, right) {
  return String(left.source_date).localeCompare(String(right.source_date))
    || String(left.prediction_model).localeCompare(String(right.prediction_model))
    || String(left.source_card_id).localeCompare(String(right.source_card_id))
    || Number(left.prediction_rank ?? Infinity) - Number(right.prediction_rank ?? Infinity)
    || String(left.source_event_id).localeCompare(String(right.source_event_id));
}

/**
 * Ranks threshold rows within each model/date/card after source-model deduping.
 */
function rankThresholdRows(rows) {
  const groupedRows = new Map();

  for (const row of dedupeSingleRows(rows)) {
    const key = `${row.prediction_model}:${row.source}:${row.source_date}:${row.source_card_id}`;
    const group = groupedRows.get(key) ?? [];
    group.push(row);
    groupedRows.set(key, group);
  }

  return [...groupedRows.values()]
    .flatMap((group) =>
      group
        .sort((left, right) =>
          Number(right.win_score ?? -Infinity) - Number(left.win_score ?? -Infinity)
          || new Date(left.advertised_start ?? 0).valueOf() - new Date(right.advertised_start ?? 0).valueOf()
          || String(left.source_event_id).localeCompare(String(right.source_event_id)))
        .map((row, index) => {
          const rankedRow = {
            ...row,
            prediction_rank: index + 1,
          };

          return {
            ...rankedRow,
            prediction_signature: createUfcSinglePredictionSignature(rankedRow),
          };
        }))
    .sort(compareUfcSingleRows);
}

/**
 * Applies threshold-model filtering and ranking when requested.
 */
function prepareRowsForBackfill(rows, options) {
  if (!options.thresholdModel) {
    return rows;
  }

  return rankThresholdRows(rows.filter((row) =>
    Number(row.win_score ?? -Infinity) >= options.thresholdModel.threshold));
}

/**
 * Reads existing UFC singles so the default backfill is additive.
 */
async function fetchExistingSingleKeys(supabase, rows) {
  const keys = new Set();
  const keyInputs = dedupeSingleRows(rows).map((row) => ({
    predictionModel: row.prediction_model,
    source: row.source,
    sourceCardId: row.source_card_id,
    sourceDate: row.source_date,
  }));
  const uniqueInputs = [
    ...new Map(keyInputs.map((input) => [
      `${input.predictionModel}:${input.source}:${input.sourceDate}:${input.sourceCardId}`,
      input,
    ])).values(),
  ];

  for (const input of uniqueInputs) {
    const existingRows = await supabase.selectAll("ufc_single_predictions", {
      prediction_model: `eq.${input.predictionModel}`,
      source: `eq.${input.source}`,
      source_card_id: `eq.${input.sourceCardId}`,
      source_date: `eq.${input.sourceDate}`,
      select: "prediction_model,source,source_date,source_card_id,source_event_id",
    });

    for (const row of existingRows) {
      keys.add(`${row.prediction_model}:${row.source}:${row.source_date}:${row.source_card_id}:${row.source_event_id}`);
    }
  }

  return keys;
}

/**
 * Writes reconstructed UFC single rows, skipping existing events unless replacement is requested.
 */
async function writeBackfillRows(supabase, rows, options) {
  const uniqueRows = dedupeSingleRows(rows);
  const existingKeys = options.replaceExisting
    ? new Set()
    : await fetchExistingSingleKeys(supabase, uniqueRows);
  const rowsToWrite = uniqueRows.filter((row) =>
    !existingKeys.has(`${row.prediction_model}:${row.source}:${row.source_date}:${row.source_card_id}:${row.source_event_id}`));

  if (!options.dryRun) {
    await supabase.upsert(
      "ufc_single_predictions",
      rowsToWrite,
      "prediction_model,source,source_date,source_card_id,source_event_id",
    );
  }

  return {
    duplicateSourceLegsSkipped: rows.length - uniqueRows.length,
    existingRowsSkipped: uniqueRows.length - rowsToWrite.length,
    rowsWritten: options.dryRun ? 0 : rowsToWrite.length,
    rowsWouldWrite: rowsToWrite.length,
    uniqueSourceRows: uniqueRows.length,
  };
}

/**
 * Runs the UFC multi-leg to single-prediction backfill workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase URL or service-role key is not configured.");
    }

    console.log(JSON.stringify({
      ok: true,
      reason: "Supabase URL or service-role key is not configured.",
      skipped: true,
    }, null, 2));
    return;
  }

  const supabase = createSupabaseRestClient(config, options.batchSize);
  const recommendations = await fetchSourceRecommendations(supabase, options);
  const recommendationById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const legs = await fetchSourceLegs(supabase, recommendations.map((recommendation) => recommendation.id));
  const rows = legs
    .map((leg) => {
      const recommendation = recommendationById.get(leg.recommendation_id);

      return recommendation ? mapUfcLegToSinglePrediction(recommendation, leg, options.thresholdModel) : null;
    })
    .filter((row) =>
      row
      && row.source_card_id
      && row.source_card_name
      && row.source_event_id
      && row.predicted_fighter_name);
  const preparedRows = prepareRowsForBackfill(rows, options);
  const writeSummary = await writeBackfillRows(supabase, preparedRows, options);
  const sourceDates = [...new Set(recommendations.map((recommendation) => recommendation.source_date))].sort();

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    ok: true,
    sample: dedupeSingleRows(preparedRows).slice(0, 10).map((row) => ({
      card: row.source_card_name,
      date: row.source_date,
      fighter: row.predicted_fighter_name,
      model: row.prediction_model,
      price: row.predicted_fixed_win_price,
      rank: row.prediction_rank,
      score: row.win_score,
      status: row.outcome_status,
    })),
    summary: {
      dateFrom: sourceDates[0] ?? null,
      dateTo: sourceDates.at(-1) ?? null,
      modelCount: new Set(recommendations.map((recommendation) => recommendation.prediction_model)).size,
      recommendationRows: recommendations.length,
      sourceLegRows: legs.length,
      threshold: options.thresholdModel?.threshold ?? null,
      targetModel: options.thresholdModel?.targetModel ?? null,
      ...writeSummary,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
