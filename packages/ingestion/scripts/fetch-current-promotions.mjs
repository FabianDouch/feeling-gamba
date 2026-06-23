import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rebuildPredictionAggregatesFromSupabase,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import {
  createHistoricalStatsFromFixtures,
  generateCurrentPromotionPayload,
  normalizeSupabaseProjectUrl,
  SOURCE_TIME_ZONE,
  upsertPromotionPredictionsToSupabase,
  upsertPromotionSnapshotToSupabase,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_OUTPUT_DIR = "data/raw/promotions";
const DEFAULT_APP_OUTPUT = "apps/mobile/src/data/fixtures/currentRacingPromotions.json";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DOT_ENV_FILES = [".env.local", ".env"];

/**
 * Parses local worker flags while keeping the Supabase Edge Function payload path separate.
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
 * Loads local env files for manual ingestion runs without overwriting shell-provided values.
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
 * Reads the current racing date in Auckland so local previews do not drift on UTC.
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
 * Reads bundled historical fixtures for local/dev promotion signal generation.
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
 * Reads the Supabase server-side cache write configuration from environment.
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
 * Runs the local worker wrapper and optionally writes the generated payload to Supabase.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const today = getTodayNzDate();
  const outputPath = options.output
    ?? path.join(REPO_ROOT, DEFAULT_OUTPUT_DIR, `current-racing-promotions-${today}.json`);
  const historicalStats = await loadHistoricalStatsFromFixtures();
  const output = await generateCurrentPromotionPayload({
    date: today,
    generatedAt: new Date(),
    historicalStats,
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

  let supabaseWrite = {
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

  if (!options.skipSupabase) {
    try {
      const config = getSupabaseWriteConfig();
      if (config) {
        supabaseWrite = await upsertPromotionSnapshotToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        predictionWrite = await upsertPromotionPredictionsToSupabase({
          output,
          supabaseKey: config.key,
          supabaseUrl: config.url,
        });
        predictionAggregateWrite = await rebuildPredictionAggregatesFromSupabase({
          config,
        });
      } else {
        supabaseWrite = {
          ok: false,
          skipped: true,
          reason: "Supabase URL or server-side key is not configured.",
        };
      }
    } catch (error) {
      if (options.requireSupabase) {
        throw error;
      }

      supabaseWrite = {
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
    predictionWrite,
    summary: output.summary,
    supabaseWrite,
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
