import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rebuildPredictionAggregatesFromSupabase,
  reconcileMultiBetRecommendationOutcomesFromSupabase,
  reconcilePromotionPredictionOutcomesFromSupabase,
  reconcileUfcMultiRecommendationOutcomesFromSupabase,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import {
  normalizeSupabaseProjectUrl,
  upsertMultiBetRecommendationsToSupabase,
  upsertPromotionPredictionsToSupabase,
  upsertUfcMultiRecommendationsToSupabase,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_BATCH_SIZE = 300;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOT_ENV_FILES = [".env.local", ".env"];

/**
 * Parses the small replay CLI used to repair tracked rows from a stored snapshot.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    requireSupabase: false,
    skipReconcile: false,
    sourceDate: null,
  };

  for (const arg of argv) {
    if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--source-date=")) {
      options.sourceDate = arg.slice("--source-date=".length);
    }
  }

  if (!options.sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(options.sourceDate)) {
    throw new Error("--source-date=YYYY-MM-DD is required.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

/**
 * Loads repo env files for manual ingestion scripts without replacing shell env.
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
 * Reads the Supabase service-role write config used by ingestion workers.
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
 * Reads the stored current prediction snapshot for one source date.
 */
async function fetchPredictionSnapshot({ config, sourceDate }) {
  const url = new URL("/rest/v1/current_prediction_snapshots", config.url);
  url.searchParams.set("select", "payload,generated_at,source_date");
  url.searchParams.set("source_date", `eq.${sourceDate}`);
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase current_prediction_snapshots read failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  const rows = await response.json();
  const row = rows[0] ?? null;

  if (!row?.payload) {
    throw new Error(`No current prediction snapshot found for ${sourceDate}.`);
  }

  return row;
}

/**
 * Replays one stored snapshot into normalized prediction tracking rows.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
    }

    console.log(JSON.stringify({
      ok: true,
      skipped: true,
    }, null, 2));
    return;
  }

  const snapshot = await fetchPredictionSnapshot({
    config,
    sourceDate: options.sourceDate,
  });
  const output = snapshot.payload;
  const predictionWrite = await upsertPromotionPredictionsToSupabase({
    output,
    supabaseKey: config.key,
    supabaseUrl: config.url,
  });
  const multiBetRecommendationWrite = await upsertMultiBetRecommendationsToSupabase({
    output,
    supabaseKey: config.key,
    supabaseUrl: config.url,
  });
  const ufcMultiRecommendationWrite = await upsertUfcMultiRecommendationsToSupabase({
    output,
    supabaseKey: config.key,
    supabaseUrl: config.url,
  });
  const predictionOutcomeWrite = options.skipReconcile
    ? { skipped: true }
    : await reconcilePromotionPredictionOutcomesFromSupabase({
        batchSize: options.batchSize,
        config,
      });
  const multiBetRecommendationOutcomeWrite = options.skipReconcile
    ? { skipped: true }
    : await reconcileMultiBetRecommendationOutcomesFromSupabase({
        batchSize: options.batchSize,
        config,
      });
  const ufcMultiRecommendationOutcomeWrite = options.skipReconcile
    ? { skipped: true }
    : await reconcileUfcMultiRecommendationOutcomesFromSupabase({
        batchSize: options.batchSize,
        config,
      });
  const predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
    batchSize: options.batchSize,
    config,
  });

  console.log(JSON.stringify({
    ok: true,
    multiBetRecommendationOutcomeWrite,
    multiBetRecommendationWrite,
    predictionAggregateWrite,
    predictionOutcomeWrite,
    predictionWrite,
    replayedGeneratedAt: snapshot.generated_at,
    sourceDate: snapshot.source_date,
    ufcMultiRecommendationOutcomeWrite,
    ufcMultiRecommendationWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
