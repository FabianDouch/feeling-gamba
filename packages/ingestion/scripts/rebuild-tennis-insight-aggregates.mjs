import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;
const PRICE_BUCKET_SIZES = [0.5, 0.25];

/**
 * Parses Tennis aggregate rebuild options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
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

function normalizeSupabaseProjectUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return String(value).replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  }
}

/**
 * Reads Supabase service-role config for local aggregate rebuilds.
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
 * Minimal Supabase REST client for Tennis aggregate rebuilds.
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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasPrice(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function roundNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function getMatchDate(row) {
  const value = row.advertised_start_at ?? row.snapshot_at;
  return value ? String(value).slice(0, 10) : null;
}

/**
 * Creates an initialized Tennis aggregate bucket.
 */
function createAggregateBucket({
  bucketSize = 0.5,
  competitionKey = null,
  competitionName = null,
  date,
  priceBucketEnd = null,
  priceBucketLabel = null,
  priceBucketStart = null,
  scopeKey,
  scopeType,
  source = null,
  tour = null,
}) {
  return {
    average_return_per_dollar: 0,
    bucket_size: bucketSize,
    competition_key: competitionKey,
    competition_name: competitionName,
    date_from: date,
    date_to: date,
    event_count: 0,
    insight_type: "fixed_win_single",
    missing_price_count: 0,
    missing_result_count: 0,
    net_return: 0,
    pending_count: 0,
    price_bucket_end: priceBucketEnd,
    price_bucket_label: priceBucketLabel,
    price_bucket_start: priceBucketStart,
    roi_percentage: 0,
    scope_key: scopeKey,
    scope_type: scopeType,
    selection_count: 0,
    selection_type: "favourite",
    source,
    total_return: 0,
    total_stake: 0,
    tour,
    unmatched_count: 0,
    win_count: 0,
    win_percentage: 0,
  };
}

/**
 * Adds date range, pending, and unresolved counts shared by Tennis aggregate rows.
 */
function addEvent(bucket, record) {
  bucket.event_count += 1;

  if (record.date) {
    bucket.date_from = bucket.date_from && bucket.date_from < record.date
      ? bucket.date_from
      : record.date;
    bucket.date_to = bucket.date_to && bucket.date_to > record.date
      ? bucket.date_to
      : record.date;
  }

  if (record.outcomeStatus === "pending") {
    bucket.pending_count += 1;
  } else if (record.outcomeStatus === "unmatched") {
    bucket.unmatched_count += 1;
  } else if (record.outcomeStatus === "missing_result") {
    bucket.missing_result_count += 1;
  }
}

/**
 * Adds one favourite fixed-win Tennis selection to an aggregate bucket.
 */
function addFixedWinSelection(bucket, record) {
  addEvent(bucket, record);

  if (record.outcomeStatus !== "settled") {
    return;
  }

  if (!hasPrice(record.price)) {
    bucket.missing_price_count += 1;
    return;
  }

  bucket.selection_count += 1;
  bucket.total_stake += 1;
  bucket.total_return += record.returnValue;

  if (record.won) {
    bucket.win_count += 1;
  }
}

/**
 * Finalizes percentage and return metrics on each aggregate row.
 */
function finalizeAggregates(buckets) {
  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundNumber(bucket.total_stake);
    const totalReturn = roundNumber(bucket.total_return);
    const netReturn = roundNumber(totalReturn - totalStake);

    return {
      ...bucket,
      average_return_per_dollar: totalStake > 0 ? roundNumber(totalReturn / totalStake) : 0,
      net_return: netReturn,
      roi_percentage: totalStake > 0 ? roundNumber((netReturn / totalStake) * 100) : 0,
      total_return: totalReturn,
      total_stake: totalStake,
      win_percentage: bucket.selection_count > 0
        ? roundNumber((bucket.win_count / bucket.selection_count) * 100)
        : 0,
    };
  }).sort((left, right) => left.scope_key.localeCompare(right.scope_key));
}

/**
 * Adds a record to an aggregate bucket keyed by its declared dimensions.
 */
function addToBucket(buckets, bucketConfig, record) {
  const existing = buckets.get(bucketConfig.scopeKey);

  if (existing) {
    addFixedWinSelection(existing, record);
    return;
  }

  const next = createAggregateBucket({
    ...bucketConfig,
    date: record.date,
  });
  buckets.set(bucketConfig.scopeKey, next);
  addFixedWinSelection(next, record);
}

function formatPriceBucketBoundary(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function getPriceBucket(price, bucketSize = 0.5) {
  const value = Number(price);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const start = roundNumber(Math.max(1, Math.floor(value / bucketSize) * bucketSize), 2);
  const end = roundNumber(start + bucketSize - 0.01, 2);

  return {
    bucketSize,
    end,
    label: `${formatPriceBucketBoundary(start)} - ${formatPriceBucketBoundary(end)}`,
    start,
  };
}

function getPriceBucketPlusBuckets(price, bucketSize = 0.5) {
  const value = Number(price);

  if (!Number.isFinite(value) || value <= 0) {
    return [];
  }

  const buckets = [];
  const maxStart = roundNumber(Math.max(1, Math.floor(value / bucketSize) * bucketSize), 2);

  for (let start = 1; start <= maxStart + 0.0001; start = roundNumber(start + bucketSize, 2)) {
    buckets.push({
      bucketSize,
      end: null,
      label: `${formatPriceBucketBoundary(start)}+`,
      start,
    });
  }

  return buckets;
}

function getPriceDifferenceBucket(priceDifference, bucketSize = 0.5) {
  const value = Number(priceDifference);

  if (!Number.isFinite(value)) {
    return null;
  }

  const start = roundNumber(Math.floor(value / bucketSize) * bucketSize, 2);
  const end = roundNumber(start + bucketSize - 0.01, 2);

  return {
    bucketSize,
    end,
    label: `${formatPriceBucketBoundary(start)} - ${formatPriceBucketBoundary(end)}`,
    start,
  };
}

function getPriceDifferencePlusBuckets(priceDifference, bucketSize = 0.5) {
  const value = Number(priceDifference);

  if (!Number.isFinite(value) || value < 0) {
    return [];
  }

  const buckets = [];
  const maxStart = roundNumber(Math.floor(value / bucketSize) * bucketSize, 2);

  for (let start = 0; start <= maxStart + 0.0001; start = roundNumber(start + bucketSize, 2)) {
    buckets.push({
      bucketSize,
      end: null,
      label: `${formatPriceBucketBoundary(start)}+`,
      start,
    });
  }

  return buckets;
}

function getSelectionPriceDifference(selectedPrice, otherPrice) {
  return hasPrice(selectedPrice) && hasPrice(otherPrice)
    ? numeric(otherPrice) - numeric(selectedPrice)
    : null;
}

/**
 * Keeps one fixed-win result row per source event/market for calibration.
 */
function selectCanonicalFixedWinResults(results) {
  const latestByMarket = new Map();

  for (const row of results) {
    const key = row.source_event_id
      ? [
          row.source,
          row.source_event_id,
        ].join(":")
      : `${row.source}:snapshot:${row.source_snapshot_key}`;
    const existing = latestByMarket.get(key);

    if (!existing || String(row.snapshot_at ?? "") > String(existing.snapshot_at ?? "")) {
      latestByMarket.set(key, row);
    }
  }

  return Array.from(latestByMarket.values());
}

/**
 * Builds favourite-level records from Tennis fixed-win result rows.
 */
function buildFavouriteRecords(results) {
  return selectCanonicalFixedWinResults(results)
    .filter((row) => row.favourite_player_name)
    .map((row) => ({
      competitionKey: row.odds_api_sport_key ?? row.competition_slug ?? null,
      competitionName: row.competition_name ?? row.odds_api_sport_key ?? null,
      date: getMatchDate(row),
      otherPrice: row.other_player_fixed_win_price,
      outcomeStatus: row.outcome_status,
      price: row.favourite_fixed_win_price,
      priceDifference: getSelectionPriceDifference(row.favourite_fixed_win_price, row.other_player_fixed_win_price),
      returnValue: numeric(row.favourite_win_return),
      source: row.source,
      tour: row.tour,
      won: row.favourite_won === true,
    }));
}

/**
 * Builds app-facing Tennis fixed-win aggregate rows.
 */
function buildFixedWinAggregates(results) {
  const buckets = new Map();
  const records = buildFavouriteRecords(results);

  for (const record of records) {
    addToBucket(buckets, {
      scopeKey: "tennis:fixed_win_single:overall:favourite",
      scopeType: "overall",
    }, record);

    if (record.tour) {
      addToBucket(buckets, {
        scopeKey: `tennis:fixed_win_single:tour:${record.tour}:favourite`,
        scopeType: "tour",
        tour: record.tour,
      }, record);
    }

    if (record.competitionKey) {
      addToBucket(buckets, {
        competitionKey: record.competitionKey,
        competitionName: record.competitionName,
        scopeKey: `tennis:fixed_win_single:competition:${record.competitionKey}:favourite`,
        scopeType: "competition",
        tour: record.tour,
      }, record);
    }

    for (const bucketSize of PRICE_BUCKET_SIZES) {
      const priceBucket = getPriceBucket(record.price, bucketSize);

      if (priceBucket) {
        addToBucket(buckets, {
          bucketSize: priceBucket.bucketSize,
          priceBucketEnd: priceBucket.end,
          priceBucketLabel: priceBucket.label,
          priceBucketStart: priceBucket.start,
          scopeKey: `tennis:fixed_win_single:price_bucket:${priceBucket.bucketSize.toFixed(2)}:favourite:${priceBucket.start.toFixed(2)}`,
          scopeType: "price_bucket",
        }, record);
      }

      for (const priceBucketPlus of getPriceBucketPlusBuckets(record.price, bucketSize)) {
        addToBucket(buckets, {
          bucketSize: priceBucketPlus.bucketSize,
          priceBucketEnd: priceBucketPlus.end,
          priceBucketLabel: priceBucketPlus.label,
          priceBucketStart: priceBucketPlus.start,
          scopeKey: `tennis:fixed_win_single:price_bucket_plus:${priceBucketPlus.bucketSize.toFixed(2)}:favourite:${priceBucketPlus.start.toFixed(2)}`,
          scopeType: "price_bucket_plus",
        }, record);
      }

      const otherPriceBucket = getPriceBucket(record.otherPrice, bucketSize);

      if (otherPriceBucket) {
        addToBucket(buckets, {
          bucketSize: otherPriceBucket.bucketSize,
          priceBucketEnd: otherPriceBucket.end,
          priceBucketLabel: otherPriceBucket.label,
          priceBucketStart: otherPriceBucket.start,
          scopeKey: `tennis:fixed_win_single:other_player_price_bucket:${otherPriceBucket.bucketSize.toFixed(2)}:favourite:${otherPriceBucket.start.toFixed(2)}`,
          scopeType: "other_player_price_bucket",
        }, record);
      }

      for (const otherPriceBucketPlus of getPriceBucketPlusBuckets(record.otherPrice, bucketSize)) {
        addToBucket(buckets, {
          bucketSize: otherPriceBucketPlus.bucketSize,
          priceBucketEnd: otherPriceBucketPlus.end,
          priceBucketLabel: otherPriceBucketPlus.label,
          priceBucketStart: otherPriceBucketPlus.start,
          scopeKey: `tennis:fixed_win_single:other_player_price_bucket_plus:${otherPriceBucketPlus.bucketSize.toFixed(2)}:favourite:${otherPriceBucketPlus.start.toFixed(2)}`,
          scopeType: "other_player_price_bucket_plus",
        }, record);
      }

      const differenceBucket = getPriceDifferenceBucket(record.priceDifference, bucketSize);

      if (differenceBucket) {
        addToBucket(buckets, {
          bucketSize: differenceBucket.bucketSize,
          priceBucketEnd: differenceBucket.end,
          priceBucketLabel: differenceBucket.label,
          priceBucketStart: differenceBucket.start,
          scopeKey: `tennis:fixed_win_single:price_difference_bucket:${differenceBucket.bucketSize.toFixed(2)}:favourite:${differenceBucket.start.toFixed(2)}`,
          scopeType: "price_difference_bucket",
        }, record);
      }

      for (const differenceBucketPlus of getPriceDifferencePlusBuckets(record.priceDifference, bucketSize)) {
        addToBucket(buckets, {
          bucketSize: differenceBucketPlus.bucketSize,
          priceBucketEnd: differenceBucketPlus.end,
          priceBucketLabel: differenceBucketPlus.label,
          priceBucketStart: differenceBucketPlus.start,
          scopeKey: `tennis:fixed_win_single:price_difference_bucket_plus:${differenceBucketPlus.bucketSize.toFixed(2)}:favourite:${differenceBucketPlus.start.toFixed(2)}`,
          scopeType: "price_difference_bucket_plus",
        }, record);
      }
    }
  }

  return finalizeAggregates(buckets);
}

/**
 * Loads Tennis fixed-win result rows for the aggregate rebuild.
 */
async function readSourceRows(supabase) {
  return await supabase.selectAll("tennis_fixed_win_snapshot_results", {
    order: "advertised_start_at.asc",
    select: [
      "source",
      "source_snapshot_key",
      "source_event_id",
      "snapshot_at",
      "advertised_start_at",
      "competition_name",
      "competition_slug",
      "odds_api_sport_key",
      "tour",
      "favourite_player_name",
      "favourite_fixed_win_price",
      "other_player_name",
      "other_player_fixed_win_price",
      "favourite_won",
      "favourite_win_return",
      "outcome_status",
    ].join(","),
  });
}

/**
 * Persists a full replacement of Tennis insight aggregate rows.
 */
async function persistAggregates(supabase, rows) {
  await supabase.request("tennis_insight_aggregates", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      insight_type: "eq.fixed_win_single",
    },
  });
  await supabase.upsert("tennis_insight_aggregates", rows, "scope_key");
}

/**
 * Runs the Tennis insight aggregate rebuild workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const supabaseConfig = getSupabaseWriteConfig();

  if (options.requireSupabase && !supabaseConfig) {
    throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!supabaseConfig) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: "Supabase write config missing.",
    }, null, 2));
    return;
  }

  const supabase = createSupabaseRestClient(supabaseConfig, options.batchSize);
  const results = await readSourceRows(supabase);
  const rows = buildFixedWinAggregates(results);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.slice(0, 12),
      summary: {
        aggregateRows: rows.length,
        fixedWinResults: results.length,
      },
    }, null, 2));
    return;
  }

  await persistAggregates(supabase, rows);

  console.log(JSON.stringify({
    summary: {
      aggregateRows: rows.length,
      fixedWinResults: results.length,
    },
    supabaseWrite: {
      ok: true,
      skipped: false,
      tennisInsightAggregates: rows.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
