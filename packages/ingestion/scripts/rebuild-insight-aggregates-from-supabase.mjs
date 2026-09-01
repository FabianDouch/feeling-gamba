import {
  rebuildInsightAggregatesFromSupabase,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_COLLECTION_START = "2025-12-15";
const DEFAULT_BATCH_SIZE = 300;
const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");

/**
 * Parses options for rebuilding stored insight aggregates from Supabase rows.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    collectionStart: DEFAULT_COLLECTION_START,
    dryRun: false,
    requireSupabase: false,
    to: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--collection-start=")) {
      options.collectionStart = arg.slice("--collection-start=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    }
  }

  if (!isValidDate(options.collectionStart)) {
    throw new Error("Pass --collection-start as YYYY-MM-DD.");
  }

  if (options.to !== null && !isValidDate(options.to)) {
    throw new Error("Pass --to as YYYY-MM-DD.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeSupabaseProjectUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return String(value).replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

/**
 * Loads local env files for manual aggregate rebuilds without overriding shell vars.
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
 * Reads the service-role write configuration for aggregate rebuilds.
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
 * Rebuilds app-facing insight aggregates outside the Supabase Edge CPU limit.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const summary = {
    batchSize: options.batchSize,
    collectionStart: options.collectionStart,
    dryRun: options.dryRun,
    sourceMaxDate: options.to,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (options.dryRun) {
    return;
  }

  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
    }

    console.log(JSON.stringify({
      skipped: true,
      reason: "Supabase write config missing.",
    }, null, 2));
    return;
  }

  const result = await rebuildInsightAggregatesFromSupabase({
    batchSize: options.batchSize,
    collectionStart: options.collectionStart,
    config,
    sourceMaxDate: options.to,
    triggeredBy: "github_actions",
  });

  console.log(JSON.stringify({
    ok: true,
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
