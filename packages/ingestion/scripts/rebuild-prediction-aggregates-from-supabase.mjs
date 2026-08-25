import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPredictionAggregatesFromPredictionRows,
} from "../../../supabase/functions/_shared/race-days-refresh-core.mjs";
import {
  normalizeSupabaseProjectUrl,
} from "../../../supabase/functions/_shared/current-promotions-core.mjs";

const DEFAULT_BATCH_SIZE = 300;
const DOT_ENV_FILES = [".env.local", ".env"];
const PAGE_SIZE = 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");

/**
 * Parses options for rebuilding stored prediction aggregates from tracked predictions.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    predictionModel: null,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--prediction-model=")) {
      options.predictionModel = arg.slice("--prediction-model=".length);
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

/**
 * Loads local env files for manual repair runs without overriding shell vars.
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
 * Reads Supabase service-role write config for aggregate repair.
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
 * Minimal Supabase REST client for model-scoped prediction aggregate rebuilds.
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
 * Rebuilds prediction aggregates for all models or one specified model.
 */
async function rebuildPredictionAggregates({ dryRun, predictionModel, supabase }) {
  const rows = await supabase.selectAll("promotion_predictions", {
    ...(predictionModel ? { prediction_model: `eq.${predictionModel}` } : {}),
    order: "source_date.asc,advertised_start.asc",
    select: [
      "prediction_model",
      "source_date",
      "race_code",
      "outcome_status",
      "outcome_result_position",
      "outcome_win_return",
      "outcome_bonus_credit",
      "outcome_total_value_with_bonus_credit",
    ].join(","),
  });
  const aggregates = buildPredictionAggregatesFromPredictionRows(rows);

  if (!dryRun) {
    await supabase.request("prediction_aggregates", {
      expectJson: false,
      method: "DELETE",
      prefer: "return=minimal",
      search: predictionModel ? { prediction_model: `eq.${predictionModel}` } : {},
    });
    await supabase.upsert("prediction_aggregates", aggregates, "scope_key");
  }

  return {
    aggregateRows: aggregates.length,
    predictionModel,
    predictionRows: rows.length,
  };
}

/**
 * Runs the local prediction aggregate repair workflow.
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

  const result = await rebuildPredictionAggregates({
    dryRun: options.dryRun,
    predictionModel: options.predictionModel,
    supabase: createSupabaseRestClient(config, options.batchSize),
  });

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    ok: true,
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
