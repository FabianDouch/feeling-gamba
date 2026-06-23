import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rebuildPredictionAggregatesFromSupabase,
  reconcilePromotionPredictionOutcomesFromSupabase,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import {
  normalizeSupabaseProjectUrl,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_BATCH_SIZE = 300;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOT_ENV_FILES = [".env.local", ".env"];

/**
 * Parses local reconciliation flags for manual prediction settlement runs.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
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
 * Settles pending promotion predictions against stored race results and refreshes aggregates.
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

  const predictionOutcomeWrite = await reconcilePromotionPredictionOutcomesFromSupabase({
    batchSize: options.batchSize,
    config,
  });
  const predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
    batchSize: options.batchSize,
    config,
  });

  console.log(JSON.stringify({
    ok: true,
    predictionAggregateWrite,
    predictionOutcomeWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
