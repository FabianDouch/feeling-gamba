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
const DEFAULT_THRESHOLD = 65;
const SINGLE_WIN_PERCENTAGE_BACKFILL_MODELS = {
  60: {
    label: "60%+ win-rate single",
    sourceModel: "multi_win_percentage_60_plus_v1",
    targetModel: "single_win_percentage_60_plus_v1",
    threshold: 60,
  },
  65: {
    label: "65%+ win-rate single",
    sourceModel: "multi_win_percentage_65_plus_v1",
    targetModel: "single_win_percentage_65_plus_v1",
    threshold: 65,
  },
};

const PROMOTION_PREDICTION_COLUMNS = [
  "advertised_start",
  "blended_cash_plus_bonus_average",
  "cash_average_score",
  "canonical_track",
  "country",
  "course_name",
  "course_slug",
  "historical_sample_size",
  "outcome_bonus_credit",
  "outcome_missing_result",
  "outcome_missing_runner",
  "outcome_race_id",
  "outcome_result_position",
  "outcome_runner_id",
  "outcome_starter_count",
  "outcome_status",
  "outcome_total_value_with_bonus_credit",
  "outcome_updated_at",
  "outcome_win_return",
  "predicted_at",
  "predicted_fixed_win_price",
  "predicted_implied_win_percentage",
  "predicted_other_starters_average_fixed_win_price",
  "predicted_other_starters_price_count",
  "predicted_other_starters_price_outlier_count",
  "predicted_runner_name",
  "predicted_runner_number",
  "predicted_starter_count",
  "prediction_model",
  "prediction_signature",
  "price_bucket_label",
  "race_code",
  "race_name",
  "race_number",
  "rank",
  "raw",
  "signal_detail",
  "signal_label",
  "signal_tone",
  "source",
  "source_date",
  "source_race_card_id",
  "source_time_zone",
  "source_track",
  "starter_bucket_label",
];

/**
 * Parses options for backfilling single win percentage rows from stored multi legs.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    fromDate: null,
    replaceExisting: false,
    requireSupabase: false,
    threshold: DEFAULT_THRESHOLD,
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

  options.model = SINGLE_WIN_PERCENTAGE_BACKFILL_MODELS[options.threshold];

  if (!options.model) {
    throw new Error("--threshold must be 60 or 65.");
  }

  return options;
}

/**
 * Loads local env files for manual ingestion runs without overriding shell vars.
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
 * Splits REST writes into bounded batches for Supabase request limits.
 */
function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for racing single backfills.
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
 * Converts nullable database numbers to finite numbers where a derived value is useful.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rounds money-like values to stable cents.
 */
function roundMoney(value) {
  const parsed = numeric(value);
  return parsed === null ? null : Number(parsed.toFixed(2));
}

/**
 * Creates a stable prediction signature from the recovered multi leg fields.
 */
function createPredictionSignature(recommendation, leg, model) {
  return JSON.stringify({
    backfillSourceModel: model.sourceModel,
    favouriteFixedWinPrice: numeric(leg.predicted_fixed_win_price),
    favouriteName: leg.predicted_runner_name ?? null,
    favouriteNumber: leg.predicted_runner_number ?? null,
    rank: leg.prediction_rank ?? leg.leg_index ?? null,
    signalLabel: leg.signal_label ?? null,
    sourceDate: recommendation.source_date,
    sourceRaceCardId: leg.source_race_card_id,
    winScore: numeric(leg.cash_average_score),
  });
}

/**
 * Maps one tracked 65%+ multi leg to the equivalent tracked 65%+ single row.
 */
function mapLegToSinglePrediction(recommendation, leg, model) {
  const raw = leg.raw ?? {};
  const fixedWinPrice = numeric(leg.predicted_fixed_win_price);
  const winReturn = roundMoney(leg.outcome_win_return);
  const outcomeStatus = leg.outcome_status ?? "pending";

  return normalizePredictionRow({
    advertised_start: leg.advertised_start,
    blended_cash_plus_bonus_average: null,
    cash_average_score: numeric(leg.cash_average_score),
    canonical_track: raw.canonicalTrack ?? null,
    country: leg.country,
    course_name: leg.course_name,
    course_slug: leg.course_slug,
    historical_sample_size: raw.candidate?.sampleSize ?? 0,
    outcome_bonus_credit: outcomeStatus === "settled" ? 0 : null,
    outcome_missing_result: ["missing_result", "race_not_found"].includes(outcomeStatus),
    outcome_missing_runner: outcomeStatus === "missing_runner",
    outcome_race_id: leg.outcome_race_id,
    outcome_result_position: leg.outcome_result_position,
    outcome_runner_id: leg.outcome_runner_id,
    outcome_starter_count: null,
    outcome_status: outcomeStatus,
    outcome_total_value_with_bonus_credit: outcomeStatus === "settled" ? winReturn ?? 0 : null,
    outcome_updated_at: leg.outcome_updated_at,
    outcome_win_return: winReturn,
    predicted_at: recommendation.predicted_at,
    predicted_fixed_win_price: fixedWinPrice,
    predicted_implied_win_percentage: raw.favourite?.impliedWinPercentage
      ?? (fixedWinPrice && fixedWinPrice > 0 ? Number((100 / fixedWinPrice).toFixed(3)) : null),
    predicted_other_starters_average_fixed_win_price: raw.fieldPriceShape?.otherStartersAverageFixedWinPrice ?? null,
    predicted_other_starters_price_count: raw.fieldPriceShape?.otherStartersPriceCount ?? null,
    predicted_other_starters_price_outlier_count: raw.fieldPriceShape?.otherStartersPriceOutlierCount ?? null,
    predicted_runner_name: leg.predicted_runner_name,
    predicted_runner_number: leg.predicted_runner_number,
    predicted_starter_count: leg.predicted_starter_count,
    prediction_model: model.targetModel,
    prediction_signature: createPredictionSignature(recommendation, leg, model),
    price_bucket_label: raw.candidate?.priceBucketLabel ?? raw.historical?.priceBucket?.label ?? raw.favourite?.priceBucket ?? null,
    race_code: leg.race_code,
    race_name: leg.race_name,
    race_number: leg.race_number,
    rank: leg.prediction_rank ?? leg.leg_index,
    raw: {
      backfilledFrom: model.sourceModel,
      leg,
      recommendation: {
        id: recommendation.id,
        predicted_at: recommendation.predicted_at,
        source: recommendation.source,
        source_date: recommendation.source_date,
      },
    },
    signal_detail: raw.candidate?.detail ?? null,
    signal_label: model.label,
    signal_tone: "positive",
    source: recommendation.source,
    source_date: recommendation.source_date,
    source_race_card_id: leg.source_race_card_id,
    source_time_zone: recommendation.source_time_zone ?? SOURCE_TIME_ZONE,
    source_track: raw.sourceTrack ?? raw.track ?? leg.course_name,
    starter_bucket_label: raw.candidate?.starterBucketLabel ?? raw.historical?.starterBucket?.label ?? null,
  });
}

/**
 * Gives every prediction row the same nullable column set for PostgREST bulk writes.
 */
function normalizePredictionRow(row) {
  return Object.fromEntries(PROMOTION_PREDICTION_COLUMNS.map((column) => [
    column,
    row[column] ?? null,
  ]));
}

/**
 * Reads stored threshold multi recommendations and their leg snapshots.
 */
async function fetchSourceRecommendations(supabase, options) {
  return await supabase.selectAll("multi_bet_recommendations", {
    ...(options.fromDate ? { source_date: `gte.${options.fromDate}` } : {}),
    ...(options.toDate ? { source_date: `lte.${options.toDate}` } : {}),
    order: "source_date.asc,predicted_at.asc",
    prediction_model: `eq.${options.model.sourceModel}`,
    select: [
      "id",
      "source",
      "source_date",
      "source_time_zone",
      "predicted_at",
      `multi_bet_recommendation_legs(${
        [
          "id",
          "advertised_start",
          "cash_average_score",
          "country",
          "course_name",
          "course_slug",
          "leg_index",
          "outcome_race_id",
          "outcome_result_position",
          "outcome_runner_id",
          "outcome_status",
          "outcome_updated_at",
          "outcome_win_return",
          "predicted_fixed_win_price",
          "predicted_runner_name",
          "predicted_runner_number",
          "predicted_starter_count",
          "prediction_rank",
          "race_code",
          "race_name",
          "race_number",
          "raw",
          "signal_label",
          "signal_tone",
          "source_race_card_id",
        ].join(",")
      })`,
    ].join(","),
  });
}

/**
 * Reads existing target single rows so the default backfill is additive.
 */
async function fetchExistingSingleKeys(supabase, rows, model) {
  const ids = rows.map((row) => row.source_race_card_id).filter(Boolean);
  const keys = new Set();

  for (const batch of chunk([...new Set(ids)], 100)) {
    const existingRows = await supabase.selectAll("promotion_predictions", {
      prediction_model: `eq.${model.targetModel}`,
      select: "source,source_race_card_id",
      source_race_card_id: `in.(${batch.map((id) => `"${String(id).replaceAll("\"", "\\\"")}"`).join(",")})`,
    });

    for (const row of existingRows) {
      keys.add(`${row.source}:${row.source_race_card_id}`);
    }
  }

  return keys;
}

/**
 * Writes backfilled single rows, skipping existing rows unless replacement is requested.
 */
async function writeBackfillRows(supabase, rows, options) {
  const existingKeys = options.replaceExisting
    ? new Set()
    : await fetchExistingSingleKeys(supabase, rows, options.model);
  const rowsToWrite = rows.filter((row) =>
    !existingKeys.has(`${row.source}:${row.source_race_card_id}`));

  if (!options.dryRun) {
    await supabase.upsert(
      "promotion_predictions",
      rowsToWrite,
      "prediction_model,source,source_race_card_id",
    );
  }

  return {
    existingRowsSkipped: rows.length - rowsToWrite.length,
    rowsWritten: options.dryRun ? 0 : rowsToWrite.length,
    rowsWouldWrite: rowsToWrite.length,
  };
}

/**
 * Runs the local single-win percentage backfill workflow.
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
  const rows = recommendations.flatMap((recommendation) =>
    (recommendation.multi_bet_recommendation_legs ?? [])
      .sort((left, right) => (left.prediction_rank ?? left.leg_index ?? 0) - (right.prediction_rank ?? right.leg_index ?? 0))
      .map((leg) => mapLegToSinglePrediction(recommendation, leg, options.model)));
  const writeSummary = await writeBackfillRows(supabase, rows, options);
  const sourceDates = [...new Set(recommendations.map((recommendation) => recommendation.source_date))].sort();

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    ok: true,
    sample: rows.slice(0, 10).map((row) => ({
      date: row.source_date,
      price: row.predicted_fixed_win_price,
      race: row.race_name,
      rank: row.rank,
      runner: row.predicted_runner_name,
      score: row.cash_average_score,
      status: row.outcome_status,
    })),
    summary: {
      dateFrom: sourceDates[0] ?? null,
      dateTo: sourceDates.at(-1) ?? null,
      recommendationRows: recommendations.length,
      sourceModel: options.model.sourceModel,
      sourceLegRows: rows.length,
      targetModel: options.model.targetModel,
      threshold: options.model.threshold,
      ...writeSummary,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
