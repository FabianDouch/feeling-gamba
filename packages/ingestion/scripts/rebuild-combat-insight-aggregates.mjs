import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;
const PRICE_BUCKET_SIZES = [0.5, 0.25];

const SPORT_CONFIG = {
  pfl: {
    fightTable: "pfl_fight_entries",
    insightTable: "pfl_insight_aggregates",
    overallScopeKey: "pfl:overall",
  },
  ufc: {
    fightTable: "ufc_fight_entries",
    insightTable: "ufc_insight_aggregates",
    overallScopeKey: "ufc:overall",
  },
};

/**
 * Parses the combat aggregate rebuild options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    requireSupabase: false,
    sport: "all",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--sport=")) {
      options.sport = arg.slice("--sport=".length);
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!["all", "pfl", "ufc"].includes(options.sport)) {
    throw new Error("--sport must be one of all, pfl, or ufc.");
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

/**
 * Normalizes copied Supabase REST URLs back to the project origin.
 */
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
 * Splits REST writes into stable batches for PostgREST payload limits.
 */
function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for combat aggregate rebuilds.
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
    selectAll,
    upsert,
  };
}

/**
 * Converts nullable database values into aggregation-safe numbers.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rounds decimal bucket boundaries and rates without keeping binary float noise.
 */
function roundNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

/**
 * Rounds betting returns to currency precision.
 */
function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

/**
 * Calculates display percentages while protecting empty denominators.
 */
function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

/**
 * Finds the lower edge of a fixed-win price bucket at the selected granularity.
 */
function getPriceBucketStart(price, bucketSize = 0.5) {
  return roundNumber(1 + Math.floor(Math.max(0, price - 1) / bucketSize) * bucketSize, 2);
}

/**
 * Finds the lower edge of a price-difference bucket from zero upward.
 */
function getDifferenceBucketStart(price, bucketSize = 0.5) {
  return roundNumber(Math.floor(Math.max(0, price) / bucketSize) * bucketSize, 2);
}

/**
 * Formats an exact bucket label using inclusive-looking decimal ranges.
 */
function getBucketLabel(start, bucketSize = 0.5) {
  return `$${start.toFixed(2)} - $${(start + bucketSize - 0.01).toFixed(2)}`;
}

/**
 * Formats a cumulative threshold bucket label.
 */
function getBucketPlusLabel(start) {
  return `$${start.toFixed(2)}+`;
}

/**
 * Preserves legacy 50c exact scope keys while namespacing 25c and plus rows.
 */
function getBucketScopeKey(sport, scopeType, start, bucketSize, isPlus = false) {
  if (!isPlus && bucketSize === 0.5) {
    return `${sport}:${scopeType}:${start.toFixed(2)}`;
  }

  return `${sport}:${scopeType}${isPlus ? "_plus" : ""}:${bucketSize.toFixed(2)}:${start.toFixed(2)}`;
}

/**
 * Creates a mutable accumulator for one combat insight scope.
 */
function createAggregateBucket(scope) {
  return {
    ...scope,
    favouriteSelections: 0,
    favouriteWins: 0,
    fightCount: 0,
    missingPriceCount: 0,
    pricedFightCount: 0,
    resultOnlyCount: 0,
    reviewCandidateCount: 0,
    totalReturn: 0,
    totalStake: 0,
  };
}

/**
 * Adds one fight to an accumulator, counting unpriced rows separately from settled ROI rows.
 */
function addFightToAggregate(bucket, fight) {
  bucket.fightCount += 1;
  bucket.missingPriceCount += fight.missing_price ? 1 : 0;
  bucket.resultOnlyCount += fight.price_match_status === "result_only" ? 1 : 0;
  bucket.reviewCandidateCount += fight.price_match_status === "review_candidate" ? 1 : 0;

  if (!fight.included_in_insights || !Number.isFinite(Number(fight.favourite_price))) {
    return;
  }

  bucket.pricedFightCount += 1;
  bucket.favouriteSelections += 1;
  bucket.favouriteWins += fight.favourite_won ? 1 : 0;
  bucket.totalStake += 1;
  bucket.totalReturn += numeric(fight.favourite_win_return);
}

/**
 * Adds exact and cumulative price scopes for all supported bucket sizes.
 */
function addPriceScopes(scopes, sport, scopeType, price, bucketStart) {
  if (!Number.isFinite(Number(price))) {
    return;
  }

  const value = Number(price);

  for (const bucketSize of PRICE_BUCKET_SIZES) {
    const start = bucketStart(value, bucketSize);
    scopes.push({
      bucketSize,
      priceBucketEnd: roundNumber(start + bucketSize - 0.01, 2),
      priceBucketLabel: getBucketLabel(start, bucketSize),
      priceBucketStart: start,
      scopeKey: getBucketScopeKey(sport, scopeType, start, bucketSize),
      scopeType,
    });

    const firstStart = scopeType === "price_difference_bucket" ? 0 : 1;

    for (let plusStart = firstStart; plusStart <= start + 0.0001; plusStart = roundNumber(plusStart + bucketSize, 2)) {
      scopes.push({
        bucketSize,
        priceBucketEnd: null,
        priceBucketLabel: getBucketPlusLabel(plusStart),
        priceBucketStart: plusStart,
        scopeKey: getBucketScopeKey(sport, scopeType, plusStart, bucketSize, true),
        scopeType: `${scopeType}_plus`,
      });
    }
  }
}

/**
 * Lists every aggregate scope a combat fight contributes to.
 */
function getAggregateScopes(fight, sport) {
  const scopes = [
    {
      bucketSize: 0.5,
      scopeKey: SPORT_CONFIG[sport].overallScopeKey,
      scopeType: "overall",
    },
    {
      bucketSize: 0.5,
      scopeKey: `${sport}:price_match_status:${fight.price_match_status}`,
      scopeType: "price_match_status",
    },
  ];

  addPriceScopes(scopes, sport, "favourite_price_bucket", fight.favourite_price, getPriceBucketStart);
  addPriceScopes(scopes, sport, "other_fighter_price_bucket", fight.other_fighter_price, getPriceBucketStart);
  addPriceScopes(scopes, sport, "price_difference_bucket", fight.price_difference, getDifferenceBucketStart);

  return scopes;
}

/**
 * Builds app-facing combat aggregate rows from stored fight entries.
 */
function buildCombatInsightAggregates(fightEntries, sport) {
  const buckets = new Map();
  const dates = fightEntries.map((fight) => fight.event_date).filter(Boolean).sort();

  function getBucket(scope) {
    const bucket = buckets.get(scope.scopeKey) ?? createAggregateBucket(scope);
    buckets.set(scope.scopeKey, bucket);
    return bucket;
  }

  for (const fight of fightEntries) {
    for (const scope of getAggregateScopes(fight, sport)) {
      addFightToAggregate(getBucket(scope), fight);
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundMoney(bucket.totalStake);
    const totalReturn = roundMoney(bucket.totalReturn);
    const netReturn = roundMoney(totalReturn - totalStake);

    return {
      average_return_per_dollar: totalStake ? roundNumber(totalReturn / totalStake) : 0,
      bucket_size: bucket.bucketSize ?? 0.5,
      date_from: dates[0] ?? null,
      date_to: dates.at(-1) ?? null,
      favourite_selections: bucket.favouriteSelections,
      favourite_win_percentage: percentage(bucket.favouriteWins, bucket.favouriteSelections),
      favourite_wins: bucket.favouriteWins,
      fight_count: bucket.fightCount,
      missing_price_count: bucket.missingPriceCount,
      net_return: netReturn,
      price_bucket_end: bucket.priceBucketEnd ?? null,
      price_bucket_label: bucket.priceBucketLabel ?? null,
      price_bucket_start: bucket.priceBucketStart ?? null,
      priced_fight_count: bucket.pricedFightCount,
      result_only_count: bucket.resultOnlyCount,
      review_candidate_count: bucket.reviewCandidateCount,
      roi_percentage: percentage(netReturn, totalStake),
      scope_key: bucket.scopeKey,
      scope_type: bucket.scopeType,
      total_return: totalReturn,
      total_stake: totalStake,
    };
  });
}

/**
 * Reads stored combat fight entries as the source of truth for rebuilds.
 */
async function readFightEntries(supabase, sport) {
  return supabase.selectAll(SPORT_CONFIG[sport].fightTable, {
    order: "event_date.asc",
    select: [
      "event_date",
      "favourite_price",
      "favourite_win_return",
      "favourite_won",
      "included_in_insights",
      "missing_price",
      "other_fighter_price",
      "price_difference",
      "price_match_status",
    ].join(","),
  });
}

/**
 * Rebuilds one sport's app-facing insight aggregates from stored fight entries.
 */
async function rebuildSport(supabase, sport, options) {
  const fightEntries = await readFightEntries(supabase, sport);
  const insightAggregates = buildCombatInsightAggregates(fightEntries, sport);

  if (!options.dryRun) {
    await supabase.upsert(SPORT_CONFIG[sport].insightTable, insightAggregates, "scope_key");
  }

  return {
    fightEntries: fightEntries.length,
    insightAggregates: insightAggregates.length,
    plusRows: insightAggregates.filter((row) => row.scope_type.endsWith("_plus")).length,
    sport,
  };
}

/**
 * Entrypoint for dry-run and live combat insight aggregate rebuilds.
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
      dryRun: options.dryRun,
      supabaseRead: {
        ok: false,
        reason: "Supabase URL or service-role key is not configured.",
        skipped: true,
      },
    }, null, 2));
    return;
  }

  const supabase = createSupabaseRestClient(config, options.batchSize);
  const sports = options.sport === "all" ? ["ufc", "pfl"] : [options.sport];
  const summary = [];

  for (const sport of sports) {
    summary.push(await rebuildSport(supabase, sport, options));
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
