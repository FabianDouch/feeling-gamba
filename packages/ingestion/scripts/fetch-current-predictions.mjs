import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rebuildPredictionAggregatesFromSupabase,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import {
  createUfcHistoricalStatsFromInsightAggregates,
  createHistoricalStatsFromFixtures,
  generateCurrentPredictionPayload,
  normalizeSupabaseProjectUrl,
  SOURCE_TIME_ZONE,
  isPredictionWindowClosed,
  upsertMultiBetRecommendationsToSupabase,
  upsertPredictionSnapshotToSupabase,
  upsertPromotionPredictionsToSupabase,
  upsertUfcMultiRecommendationsToSupabase,
  upsertUfcSinglePredictionsToSupabase,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_OUTPUT_DIR = "data/raw/predictions";
const DEFAULT_APP_OUTPUT = "apps/mobile/src/data/fixtures/currentRacingPredictions.json";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOT_ENV_FILES = [".env.local", ".env"];

/**
 * Parses the small CLI surface for local prediction refresh runs.
 */
function parseArgs(argv) {
  const options = {
    appOutput: DEFAULT_APP_OUTPUT,
    output: null,
    requireSupabase: false,
    skipSupabase: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--app-output=")) {
      options.appOutput = arg.slice("--app-output=".length);
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-supabase") {
      options.skipSupabase = true;
    }
  }

  return options;
}

/**
 * Loads repo-level env files without overriding already-exported shell values.
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

        const rawValue = match[2].trim();
        process.env[match[1]] = rawValue.replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * Returns today's source date in the Auckland racing calendar timezone.
 */
function getTodayNzDate() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Builds historical signal stats from bundled fixtures for offline development runs.
 */
async function loadHistoricalStatsFromFixtures() {
  const fixturesDir = path.join(REPO_ROOT, "apps/mobile/src/data/fixtures");
  const files = (await readdir(fixturesDir))
    .filter((file) => /^pilot-tracks-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const fixtures = [];

  for (const file of files) {
    fixtures.push(JSON.parse(await readFile(path.join(fixturesDir, file), "utf8")));
  }

  return createHistoricalStatsFromFixtures(fixtures);
}

/**
 * Reads the server-side Supabase write credentials accepted by local workers.
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
 * Reads UFC insight aggregates for local refresh runs when Supabase is configured.
 */
async function fetchUfcInsightAggregateRows(config) {
  const url = new URL("/rest/v1/ufc_insight_aggregates", config.url);
  url.searchParams.set(
    "select",
    [
      "scope_key",
      "scope_type",
      "price_bucket_label",
      "price_bucket_start",
      "price_bucket_end",
      "fight_count",
      "priced_fight_count",
      "favourite_selections",
      "favourite_wins",
      "favourite_win_percentage",
      "total_stake",
      "total_return",
      "net_return",
      "average_return_per_dollar",
      "roi_percentage",
    ].join(","),
  );
  url.searchParams.set("scope_type", "in.(favourite_price_bucket,other_fighter_price_bucket,price_difference_bucket)");
  url.searchParams.set("order", "scope_type.asc,price_bucket_start.asc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase ufc_insight_aggregates read failed with HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Generates, writes, and optionally upserts today's independent prediction snapshot.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const today = getTodayNzDate();
  const outputPath = options.output
    ?? path.join(REPO_ROOT, DEFAULT_OUTPUT_DIR, `current-racing-predictions-${today}.json`);
  const historicalStats = await loadHistoricalStatsFromFixtures();
  const config = getSupabaseWriteConfig();
  let ufcHistoricalStats = null;

  if (config) {
    try {
      ufcHistoricalStats = createUfcHistoricalStatsFromInsightAggregates(await fetchUfcInsightAggregateRows(config));
    } catch (error) {
      if (options.requireSupabase) {
        throw error;
      }

      console.warn(error instanceof Error
        ? `Skipping UFC current multis: ${error.message}`
        : "Skipping UFC current multis because UFC aggregates could not be loaded.");
    }
  }
  const output = await generateCurrentPredictionPayload({
    date: today,
    generatedAt: new Date(),
    historicalStats,
    ufcHistoricalStats,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  let appOutputPath = null;

  if (options.appOutput) {
    appOutputPath = path.isAbsolute(options.appOutput)
      ? options.appOutput
      : path.join(REPO_ROOT, options.appOutput);
    await mkdir(path.dirname(appOutputPath), { recursive: true });
    await writeFile(appOutputPath, `${JSON.stringify(output, null, 2)}\n`);
  }

  let predictionSnapshotWrite = {
    ok: false,
    skipped: true,
    reason: "Skipped by --skip-supabase.",
  };
  let predictionWrite = {
    changed: 0,
    ok: false,
    skipped: true,
    total: 0,
  };
  let predictionAggregateWrite = {
    predictionAggregates: 0,
    predictions: 0,
    skipped: true,
  };
  let ufcMultiRecommendationWrite = {
    changed: 0,
    ok: false,
    skipped: true,
    total: 0,
  };
  let ufcSinglePredictionWrite = {
    changed: 0,
    ok: false,
    skipped: true,
    total: 0,
  };

  if (isPredictionWindowClosed(output)) {
    if (!options.skipSupabase && config) {
      ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
        output,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });
      ufcSinglePredictionWrite = await upsertUfcSinglePredictionsToSupabase({
        output,
        supabaseKey: config.key,
        supabaseUrl: config.url,
      });
    }

    predictionSnapshotWrite = {
      ok: true,
      skipped: true,
      reason: "Prediction window is closed because the first eligible race has started.",
    };
    predictionWrite = {
      changed: 0,
      ok: true,
      skipped: true,
      total: 0,
    };
    predictionAggregateWrite = {
      predictionAggregates: 0,
      predictions: 0,
      reason: "Prediction window is closed.",
      skipped: true,
    };
  } else if (!options.skipSupabase) {
    try {
      if (config) {
        predictionWrite = await upsertPromotionPredictionsToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        await upsertMultiBetRecommendationsToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        ufcSinglePredictionWrite = await upsertUfcSinglePredictionsToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
          config,
        });
        predictionSnapshotWrite = await upsertPredictionSnapshotToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
      } else {
        if (options.requireSupabase) {
          throw new Error("Supabase URL or server-side key is not configured.");
        }

        predictionSnapshotWrite = {
          ok: false,
          skipped: true,
          reason: "Supabase URL or server-side key is not configured.",
        };
      }
    } catch (error) {
      if (options.requireSupabase) {
        throw error;
      }

      predictionSnapshotWrite = {
        error: error instanceof Error ? error.message : "Unknown Supabase write failure.",
        ok: false,
        skipped: false,
      };
    }
  }

  console.log(JSON.stringify({
    appOutputPath,
    outputPath,
    predictionAggregateWrite,
    predictionSnapshotWrite,
    predictionWrite,
    summary: output.summary,
    ufcMultiRecommendationWrite,
    ufcSinglePredictionWrite,
  }, null, 2));
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
