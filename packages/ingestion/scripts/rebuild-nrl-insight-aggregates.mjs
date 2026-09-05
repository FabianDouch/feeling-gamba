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
 * Parses NRL aggregate rebuild options.
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
 * Minimal Supabase REST client for NRL aggregate rebuilds.
 */
function createSupabaseRestClient(config, batchSize) {
  /**
   * Sends one authenticated Supabase REST request and parses JSON responses.
   */
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

  /**
   * Reads all matching rows from a Supabase REST table.
   */
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

  /**
   * Upserts rows through PostgREST using an explicit conflict target.
   */
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
 * Converts nullable numeric database values to numbers for aggregate math.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Returns true when a nullable value is a usable decimal price.
 */
function hasPrice(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

/**
 * Rounds aggregate metrics to a stable precision before writing.
 */
function roundNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

/**
 * Gets the official match date used for NRL aggregate date ranges.
 */
function getMatchDate(match, fallbackTimestamp) {
  const value = match?.kickoff_at ?? fallbackTimestamp;
  return value ? String(value).slice(0, 10) : null;
}

/**
 * Creates an initialized aggregate bucket.
 */
function createAggregateBucket({
  insightType,
  scopeKey,
  scopeType,
  date,
  playerName = null,
  playerSourceId = null,
  bucketSize = 0.5,
  priceBucketEnd = null,
  priceBucketLabel = null,
  priceBucketStart = null,
  roundNumber = null,
  season = null,
  selectionType = null,
  source = null,
  teamName = null,
  teamSourceId = null,
}) {
  return {
    date_from: date,
    date_to: date,
    event_count: 0,
    insight_type: insightType,
    missing_price_count: 0,
    missing_result_count: 0,
    net_return: 0,
    pending_count: 0,
    player_name: playerName,
    player_source_id: playerSourceId,
    bucket_size: bucketSize,
    price_bucket_end: priceBucketEnd,
    price_bucket_label: priceBucketLabel,
    price_bucket_start: priceBucketStart,
    roi_percentage: 0,
    round_number: roundNumber,
    scope_key: scopeKey,
    scope_type: scopeType,
    season,
    selection_count: 0,
    selection_type: selectionType,
    source,
    team_name: teamName,
    team_source_id: teamSourceId,
    total_return: 0,
    total_stake: 0,
    total_tries: 0,
    unmatched_count: 0,
    win_count: 0,
    win_percentage: 0,
  };
}

/**
 * Adds date range, pending, and unresolved counts shared by aggregate types.
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
 * Adds one fixed-win selection to an aggregate bucket.
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
 * Adds one player appearance to a try-scorer percentage aggregate bucket.
 */
function addTryScorerAppearance(bucket, record) {
  addEvent(bucket, record);

  if (record.outcomeStatus !== "settled") {
    return;
  }

  bucket.selection_count += 1;
  bucket.total_tries += record.tryCount;

  if (record.tryCount > 0) {
    bucket.win_count += 1;
  }
}

/**
 * Adds one priced player try-scorer market selection to an aggregate bucket.
 */
function addTryScorerMarketSelection(bucket, record) {
  addEvent(bucket, record);

  if (record.outcomeStatus === "missing_price") {
    bucket.missing_price_count += 1;
    return;
  }

  if (record.outcomeStatus !== "settled") {
    return;
  }

  bucket.selection_count += 1;
  bucket.total_stake += 1;
  bucket.total_tries += record.tryCount;

  if (record.tryCount > 0) {
    bucket.win_count += 1;
    bucket.total_return += record.returnValue;
  }
}

/**
 * Adds one same-game multi result to an aggregate bucket.
 */
function addSameGameMultiSelection(bucket, record) {
  addEvent(bucket, record);

  if (record.outcomeStatus === "missing_price") {
    bucket.missing_price_count += 1;
    return;
  }

  if (record.outcomeStatus !== "settled") {
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
function addToBucket(buckets, bucketConfig, record, addRecord) {
  const existing = buckets.get(bucketConfig.scopeKey);

  if (existing) {
    addRecord(existing, record);
    return;
  }

  const next = createAggregateBucket({
    ...bucketConfig,
    date: record.date,
  });
  buckets.set(bucketConfig.scopeKey, next);
  addRecord(next, record);
}

/**
 * Formats signed price bucket boundaries consistently for display rows.
 */
function formatPriceBucketBoundary(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Creates decimal-price buckets for the selected display granularity.
 */
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

/**
 * Creates buckets for the price gap between selected team and opponent.
 */
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

/**
 * Calculates the opponent-minus-selected price gap when both prices are known.
 */
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
 * Builds selection-level records from home, away, and favourite fixed-win rows.
 */
function buildFixedWinRecords(results, matchesById) {
  const sideRecords = [];
  const favouriteRecords = [];

  for (const row of results) {
    const match = row.matched_nrl_match_id ? matchesById.get(row.matched_nrl_match_id) : null;
    const base = {
      date: getMatchDate(match, row.advertised_start_at ?? row.snapshot_at),
      outcomeStatus: row.outcome_status,
      roundNumber: match?.round_number ?? null,
      season: match?.season ?? null,
      source: row.source,
    };

    sideRecords.push({
      ...base,
      otherPrice: row.away_fixed_win_price,
      price: row.home_fixed_win_price,
      priceDifference: getSelectionPriceDifference(row.home_fixed_win_price, row.away_fixed_win_price),
      returnValue: numeric(row.home_win_return),
      selectionType: "home",
      teamName: row.home_team_name,
      teamSourceId: match?.home_team_source_id ?? null,
      won: row.home_team_won === true,
    });
    sideRecords.push({
      ...base,
      otherPrice: row.home_fixed_win_price,
      price: row.away_fixed_win_price,
      priceDifference: getSelectionPriceDifference(row.away_fixed_win_price, row.home_fixed_win_price),
      returnValue: numeric(row.away_win_return),
      selectionType: "away",
      teamName: row.away_team_name,
      teamSourceId: match?.away_team_source_id ?? null,
      won: row.away_team_won === true,
    });

    if (row.favourite_team_name) {
      const favouriteIsHome = row.favourite_team_name === row.home_team_name;
      const favouriteIsAway = row.favourite_team_name === row.away_team_name;
      const favouriteVenueSelectionType = favouriteIsHome
        ? "favourite_home"
        : favouriteIsAway
          ? "favourite_away"
          : null;
      const otherPrice = favouriteIsHome
        ? row.away_fixed_win_price
        : favouriteIsAway
          ? row.home_fixed_win_price
          : null;

      favouriteRecords.push({
        ...base,
        otherPrice,
        price: row.favourite_fixed_win_price,
        priceDifference: getSelectionPriceDifference(row.favourite_fixed_win_price, otherPrice),
        favouriteVenueSelectionType,
        returnValue: numeric(row.favourite_win_return),
        selectionType: "favourite",
        teamName: row.favourite_team_name,
        teamSourceId: row.favourite_team_name === row.home_team_name
          ? match?.home_team_source_id ?? null
          : match?.away_team_source_id ?? null,
        won: row.favourite_won === true,
      });
    }
  }

  return {
    favouriteRecords,
    sideRecords,
  };
}

/**
 * Builds fixed-win aggregate rows across side, role-specific price buckets, season, and round.
 */
function buildFixedWinAggregates(results, matchesById) {
  const buckets = new Map();
  const canonicalResults = selectCanonicalFixedWinResults(results);
  const { favouriteRecords, sideRecords } = buildFixedWinRecords(canonicalResults, matchesById);
  const allRecords = [...sideRecords, ...favouriteRecords];

  for (const record of favouriteRecords) {
    addToBucket(buckets, {
      insightType: "fixed_win_single",
      scopeKey: "nrl:fixed_win_single:overall:favourite",
      scopeType: "overall",
      selectionType: "favourite",
    }, record, addFixedWinSelection);

    if (record.season) {
      addToBucket(buckets, {
        insightType: "fixed_win_single",
        scopeKey: `nrl:fixed_win_single:season:${record.season}:favourite`,
        scopeType: "season",
        season: record.season,
        selectionType: "favourite",
      }, record, addFixedWinSelection);
    }

    if (record.season && record.roundNumber) {
      addToBucket(buckets, {
        insightType: "fixed_win_single",
        roundNumber: record.roundNumber,
        scopeKey: `nrl:fixed_win_single:season_round:${record.season}:${record.roundNumber}:favourite`,
        scopeType: "season_round",
        season: record.season,
        selectionType: "favourite",
      }, record, addFixedWinSelection);
    }
  }

  for (const record of allRecords) {
    addToBucket(buckets, {
      insightType: "fixed_win_single",
      scopeKey: `nrl:fixed_win_single:selection_type:${record.selectionType}`,
      scopeType: "selection_type",
      selectionType: record.selectionType,
    }, record, addFixedWinSelection);

  }

  for (const record of favouriteRecords) {
    if (!record.favouriteVenueSelectionType) {
      continue;
    }

    addToBucket(buckets, {
      insightType: "fixed_win_single",
      scopeKey: `nrl:fixed_win_single:favourite_venue:${record.favouriteVenueSelectionType}`,
      scopeType: "favourite_venue",
      selectionType: record.favouriteVenueSelectionType,
    }, record, addFixedWinSelection);
  }

  for (const record of allRecords) {
    for (const bucketSize of PRICE_BUCKET_SIZES) {
      const priceBucket = getPriceBucket(record.price, bucketSize);

      if (!priceBucket) {
        continue;
      }

      addToBucket(buckets, {
        bucketSize: priceBucket.bucketSize,
        insightType: "fixed_win_single",
        priceBucketEnd: priceBucket.end,
        priceBucketLabel: priceBucket.label,
        priceBucketStart: priceBucket.start,
        scopeKey: `nrl:fixed_win_single:price_bucket:${priceBucket.bucketSize.toFixed(2)}:${record.selectionType}:${priceBucket.start.toFixed(2)}`,
        scopeType: "price_bucket",
        selectionType: record.selectionType,
      }, record, addFixedWinSelection);
    }

  }

  for (const record of allRecords) {
    for (const bucketSize of PRICE_BUCKET_SIZES) {
      const otherPriceBucket = getPriceBucket(record.otherPrice, bucketSize);

      if (otherPriceBucket) {
        addToBucket(buckets, {
          bucketSize: otherPriceBucket.bucketSize,
          insightType: "fixed_win_single",
          priceBucketEnd: otherPriceBucket.end,
          priceBucketLabel: otherPriceBucket.label,
          priceBucketStart: otherPriceBucket.start,
          scopeKey: `nrl:fixed_win_single:other_team_price_bucket:${otherPriceBucket.bucketSize.toFixed(2)}:${record.selectionType}:${otherPriceBucket.start.toFixed(2)}`,
          scopeType: "other_team_price_bucket",
          selectionType: record.selectionType,
        }, record, addFixedWinSelection);
      }

      const differenceBucket = getPriceDifferenceBucket(record.priceDifference, bucketSize);

      if (differenceBucket) {
        addToBucket(buckets, {
          bucketSize: differenceBucket.bucketSize,
          insightType: "fixed_win_single",
          priceBucketEnd: differenceBucket.end,
          priceBucketLabel: differenceBucket.label,
          priceBucketStart: differenceBucket.start,
          scopeKey: `nrl:fixed_win_single:price_difference_bucket:${differenceBucket.bucketSize.toFixed(2)}:${record.selectionType}:${differenceBucket.start.toFixed(2)}`,
          scopeType: "price_difference_bucket",
          selectionType: record.selectionType,
        }, record, addFixedWinSelection);
      }
    }
  }

  return finalizeAggregates(buckets);
}

/**
 * Builds selection-level records from home/home, away/away, and favourite HT/FT rows.
 */
function buildHalfTimeFullTimeRecords(results, matchesById) {
  const sideRecords = [];
  const favouriteRecords = [];

  for (const row of selectCanonicalFixedWinResults(results)) {
    const match = row.matched_nrl_match_id ? matchesById.get(row.matched_nrl_match_id) : null;
    const base = {
      date: getMatchDate(match, row.advertised_start_at ?? row.snapshot_at),
      outcomeStatus: row.outcome_status,
      roundNumber: match?.round_number ?? null,
      season: match?.season ?? null,
      source: row.source,
    };

    sideRecords.push({
      ...base,
      price: row.home_home_fixed_win_price,
      returnValue: numeric(row.home_win_return),
      selectionType: "home",
      teamName: row.home_team_name,
      teamSourceId: match?.home_team_source_id ?? null,
      won: row.home_team_won === true,
    });
    sideRecords.push({
      ...base,
      price: row.away_away_fixed_win_price,
      returnValue: numeric(row.away_win_return),
      selectionType: "away",
      teamName: row.away_team_name,
      teamSourceId: match?.away_team_source_id ?? null,
      won: row.away_team_won === true,
    });

    if (row.favourite_team_name) {
      const favouriteIsHome = row.favourite_team_name === row.home_team_name;
      const favouriteIsAway = row.favourite_team_name === row.away_team_name;
      const favouriteVenueSelectionType = favouriteIsHome
        ? "favourite_home"
        : favouriteIsAway
          ? "favourite_away"
          : null;

      favouriteRecords.push({
        ...base,
        favouriteVenueSelectionType,
        price: row.favourite_fixed_win_price,
        returnValue: numeric(row.favourite_win_return),
        selectionType: "favourite",
        teamName: row.favourite_team_name,
        teamSourceId: row.favourite_team_name === row.home_team_name
          ? match?.home_team_source_id ?? null
          : match?.away_team_source_id ?? null,
        won: row.favourite_won === true,
      });
    }
  }

  return {
    favouriteRecords,
    sideRecords,
  };
}

/**
 * Builds HT/FT double aggregate rows across selection type, favourite venue, season, and round.
 */
function buildHalfTimeFullTimeAggregates(results, matchesById) {
  const buckets = new Map();
  const { favouriteRecords, sideRecords } = buildHalfTimeFullTimeRecords(results, matchesById);
  const allRecords = [...sideRecords, ...favouriteRecords];

  for (const record of favouriteRecords) {
    addToBucket(buckets, {
      insightType: "half_time_full_time_double",
      scopeKey: "nrl:half_time_full_time_double:overall:favourite",
      scopeType: "overall",
      selectionType: "favourite",
    }, record, addFixedWinSelection);

    if (record.season) {
      addToBucket(buckets, {
        insightType: "half_time_full_time_double",
        scopeKey: `nrl:half_time_full_time_double:season:${record.season}:favourite`,
        scopeType: "season",
        season: record.season,
        selectionType: "favourite",
      }, record, addFixedWinSelection);
    }

    if (record.season && record.roundNumber) {
      addToBucket(buckets, {
        insightType: "half_time_full_time_double",
        roundNumber: record.roundNumber,
        scopeKey: `nrl:half_time_full_time_double:season_round:${record.season}:${record.roundNumber}:favourite`,
        scopeType: "season_round",
        season: record.season,
        selectionType: "favourite",
      }, record, addFixedWinSelection);
    }
  }

  for (const record of allRecords) {
    addToBucket(buckets, {
      insightType: "half_time_full_time_double",
      scopeKey: `nrl:half_time_full_time_double:selection_type:${record.selectionType}`,
      scopeType: "selection_type",
      selectionType: record.selectionType,
    }, record, addFixedWinSelection);
  }

  for (const record of favouriteRecords) {
    if (!record.favouriteVenueSelectionType) {
      continue;
    }

    addToBucket(buckets, {
      insightType: "half_time_full_time_double",
      scopeKey: `nrl:half_time_full_time_double:favourite_venue:${record.favouriteVenueSelectionType}`,
      scopeType: "favourite_venue",
      selectionType: record.favouriteVenueSelectionType,
    }, record, addFixedWinSelection);
  }

  return finalizeAggregates(buckets);
}

/**
 * Builds appearance-level try-scorer records from official rosters and try events.
 */
function buildTryScorerRecords(appearances, tryScorers, matchesBySourceKey) {
  const tryCounts = new Map();

  for (const row of tryScorers) {
    const key = `${row.source}:${row.source_match_id}:${row.source_player_id}`;
    tryCounts.set(key, (tryCounts.get(key) ?? 0) + 1);
  }

  return appearances.map((appearance) => {
    const match = matchesBySourceKey.get(`${appearance.source}:${appearance.source_match_id}`) ?? null;
    const tryKey = `${appearance.source}:${appearance.source_match_id}:${appearance.source_player_id}`;

    return {
      date: getMatchDate(match, null),
      outcomeStatus: match?.result_status ?? appearance.result_status,
      playerName: appearance.player_name,
      playerSourceId: appearance.source_player_id,
      roundNumber: match?.round_number ?? null,
      season: match?.season ?? null,
      source: appearance.source,
      teamName: appearance.team_name,
      teamSourceId: appearance.source_team_id,
      tryCount: tryCounts.get(tryKey) ?? 0,
    };
  });
}

/**
 * Builds priced try-scorer market records with official NRL settlement.
 */
function buildTryScorerMarketRecords(tryScorerPrices, tryScorers, matchesById) {
  const tryCounts = new Map();

  for (const row of tryScorers) {
    const key = `${row.source}:${row.source_match_id}:${row.source_player_id}`;
    tryCounts.set(key, (tryCounts.get(key) ?? 0) + 1);
  }

  return tryScorerPrices.map((row) => {
    const match = row.matched_nrl_match_id ? matchesById.get(row.matched_nrl_match_id) : null;
    const tryKey = match && row.player_source_id
      ? `${match.source}:${match.source_match_id}:${row.player_source_id}`
      : null;
    const tryCount = tryKey ? tryCounts.get(tryKey) ?? 0 : 0;
    const price = numeric(row.fixed_win_price);
    let outcomeStatus = match?.result_status ?? "unmatched";

    if (outcomeStatus === "settled" && !row.player_source_id) {
      outcomeStatus = "unmatched";
    } else if (outcomeStatus === "settled" && !hasPrice(row.fixed_win_price)) {
      outcomeStatus = "missing_price";
    } else if (outcomeStatus !== "pending" && outcomeStatus !== "settled" && outcomeStatus !== "unmatched") {
      outcomeStatus = "missing_result";
    }

    return {
      date: getMatchDate(match, row.advertised_start_at ?? row.snapshot_at),
      outcomeStatus,
      playerName: row.player_name,
      playerSourceId: row.player_source_id,
      price,
      returnValue: tryCount > 0 ? price : 0,
      roundNumber: match?.round_number ?? null,
      season: match?.season ?? null,
      source: row.source,
      teamName: row.team_name,
      teamSourceId: row.team_source_id,
      tryCount,
    };
  });
}

/**
 * Builds try-scorer aggregate rows from official appearances and captured prices.
 */
function buildTryScorerAggregates(appearances, tryScorers, matchesById, matchesBySourceKey, tryScorerPrices) {
  const buckets = new Map();
  const records = buildTryScorerRecords(appearances, tryScorers, matchesBySourceKey);
  const marketRecords = buildTryScorerMarketRecords(tryScorerPrices, tryScorers, matchesById);

  for (const record of records) {
    addToBucket(buckets, {
      insightType: "try_scorer_percentage",
      scopeKey: "nrl:try_scorer_percentage:overall",
      scopeType: "overall",
      source: record.source,
    }, record, addTryScorerAppearance);

    if (record.teamName) {
      addToBucket(buckets, {
        insightType: "try_scorer_percentage",
        scopeKey: `nrl:try_scorer_percentage:team:${record.teamSourceId ?? record.teamName}`,
        scopeType: "team",
        source: record.source,
        teamName: record.teamName,
        teamSourceId: record.teamSourceId,
      }, record, addTryScorerAppearance);
    }

    if (record.playerName) {
      addToBucket(buckets, {
        insightType: "try_scorer_percentage",
        playerName: record.playerName,
        playerSourceId: record.playerSourceId,
        scopeKey: `nrl:try_scorer_percentage:player:${record.playerSourceId}`,
        scopeType: "player",
        source: record.source,
      }, record, addTryScorerAppearance);
    }

    if (record.playerName && record.teamName) {
      addToBucket(buckets, {
        insightType: "try_scorer_percentage",
        playerName: record.playerName,
        playerSourceId: record.playerSourceId,
        scopeKey: `nrl:try_scorer_percentage:player_team:${record.teamSourceId}:${record.playerSourceId}`,
        scopeType: "player_team",
        source: record.source,
        teamName: record.teamName,
        teamSourceId: record.teamSourceId,
      }, record, addTryScorerAppearance);
    }

    if (record.season) {
      addToBucket(buckets, {
        insightType: "try_scorer_percentage",
        scopeKey: `nrl:try_scorer_percentage:season:${record.season}`,
        scopeType: "season",
        season: record.season,
        source: record.source,
      }, record, addTryScorerAppearance);
    }

    if (record.season && record.roundNumber) {
      addToBucket(buckets, {
        insightType: "try_scorer_percentage",
        roundNumber: record.roundNumber,
        scopeKey: `nrl:try_scorer_percentage:season_round:${record.season}:${record.roundNumber}`,
        scopeType: "season_round",
        season: record.season,
        source: record.source,
      }, record, addTryScorerAppearance);
    }
  }

  for (const record of marketRecords) {
    for (const bucketSize of PRICE_BUCKET_SIZES) {
      const priceBucket = getPriceBucket(record.price, bucketSize);

      if (!priceBucket) {
        continue;
      }

      addToBucket(buckets, {
        bucketSize: priceBucket.bucketSize,
        insightType: "try_scorer_percentage",
        priceBucketEnd: priceBucket.end,
        priceBucketLabel: priceBucket.label,
        priceBucketStart: priceBucket.start,
        scopeKey: `nrl:try_scorer_percentage:price_bucket:${priceBucket.bucketSize.toFixed(2)}:${priceBucket.start.toFixed(2)}`,
        scopeType: "price_bucket",
      }, record, addTryScorerMarketSelection);
    }
  }

  return finalizeAggregates(buckets);
}

/**
 * Builds same-game multi aggregate rows from stored tracked multi outcomes.
 */
function buildSameGameMultiAggregates(results) {
  const buckets = new Map();

  for (const row of results) {
    const record = {
      date: getMatchDate(null, row.advertised_start_at ?? row.snapshot_at),
      outcomeStatus: row.outcome_status,
      returnValue: numeric(row.outcome_win_return),
      roundNumber: row.round_number ?? null,
      season: row.season ?? null,
      selectionType: "favourite",
      source: row.source,
      teamName: row.selected_team_name,
      teamSourceId: row.selected_team_source_id,
      won: Number(row.outcome_win_return) > 0,
    };

    addToBucket(buckets, {
      insightType: "same_game_multi_percentage",
      scopeKey: "nrl:same_game_multi_percentage:overall:favourite_top2_try_scorers",
      scopeType: "overall",
      selectionType: "favourite",
    }, record, addSameGameMultiSelection);

    if (record.season) {
      addToBucket(buckets, {
        insightType: "same_game_multi_percentage",
        scopeKey: `nrl:same_game_multi_percentage:season:${record.season}:favourite_top2_try_scorers`,
        scopeType: "season",
        season: record.season,
        selectionType: "favourite",
      }, record, addSameGameMultiSelection);
    }

    if (record.season && record.roundNumber) {
      addToBucket(buckets, {
        insightType: "same_game_multi_percentage",
        roundNumber: record.roundNumber,
        scopeKey: `nrl:same_game_multi_percentage:season_round:${record.season}:${record.roundNumber}:favourite_top2_try_scorers`,
        scopeType: "season_round",
        season: record.season,
        selectionType: "favourite",
      }, record, addSameGameMultiSelection);
    }
  }

  return finalizeAggregates(buckets);
}

/**
 * Loads all source rows needed for NRL insight rebuilds.
 */
async function readSourceRows(supabase) {
  const [fixedWinResults, halfTimeFullTimeResults, matches, appearances, tryScorers, tryScorerPrices, sameGameMultiResults] = await Promise.all([
    supabase.selectAll("nrl_fixed_win_snapshot_results", {
      order: "snapshot_at.asc",
      select: [
        "source",
        "source_snapshot_key",
        "source_event_id",
        "source_market_id",
        "matched_nrl_match_id",
        "snapshot_at",
        "advertised_start_at",
        "home_team_name",
        "away_team_name",
        "home_fixed_win_price",
        "away_fixed_win_price",
        "favourite_team_name",
        "favourite_fixed_win_price",
        "home_team_won",
        "away_team_won",
        "favourite_won",
        "home_win_return",
        "away_win_return",
        "favourite_win_return",
        "outcome_status",
      ].join(","),
    }),
    supabase.selectAll("nrl_half_time_full_time_results", {
      order: "snapshot_at.asc",
      select: [
        "source",
        "source_snapshot_key",
        "source_event_id",
        "source_market_id",
        "matched_nrl_match_id",
        "snapshot_at",
        "advertised_start_at",
        "home_team_name",
        "away_team_name",
        "home_home_fixed_win_price",
        "away_away_fixed_win_price",
        "favourite_team_name",
        "favourite_fixed_win_price",
        "home_team_won",
        "away_team_won",
        "favourite_won",
        "home_win_return",
        "away_win_return",
        "favourite_win_return",
        "outcome_status",
      ].join(","),
    }),
    supabase.selectAll("nrl_matches", {
      order: "kickoff_at.asc",
      select: [
        "id",
        "source",
        "source_match_id",
        "season",
        "round_number",
        "kickoff_at",
        "result_status",
        "home_team_source_id",
        "away_team_source_id",
      ].join(","),
    }),
    supabase.selectAll("nrl_player_match_appearances", {
      order: "source_match_id.asc,player_name.asc",
      select: [
        "source",
        "source_match_id",
        "source_player_id",
        "player_name",
        "source_team_id",
        "team_name",
        "result_status",
      ].join(","),
    }),
    supabase.selectAll("nrl_try_scorers", {
      order: "source_match_id.asc,game_seconds.asc",
      select: [
        "source",
        "source_match_id",
        "source_player_id",
      ].join(","),
    }),
    supabase.selectAll("nrl_try_scorer_market_snapshots", {
      order: "snapshot_at.asc,fixed_win_price.asc",
      select: [
        "source",
        "source_event_id",
        "matched_nrl_match_id",
        "snapshot_at",
        "advertised_start_at",
        "player_source_id",
        "player_name",
        "team_source_id",
        "team_name",
        "fixed_win_price",
      ].join(","),
    }),
    supabase.selectAll("nrl_same_game_multi_results", {
      order: "advertised_start_at.asc",
      select: [
        "source",
        "snapshot_at",
        "advertised_start_at",
        "selected_team_source_id",
        "selected_team_name",
        "season",
        "round_number",
        "outcome_status",
        "outcome_win_return",
      ].join(","),
    }),
  ]);

  return {
    appearances,
    fixedWinResults,
    halfTimeFullTimeResults,
    matches,
    sameGameMultiResults,
    tryScorerPrices,
    tryScorers,
  };
}

/**
 * Removes previous NRL insight rows before replacing the rebuild output.
 */
async function clearExistingAggregates(supabase) {
  await supabase.request("nrl_insight_aggregates", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      insight_type: "in.(fixed_win_single,try_scorer_percentage,same_game_multi_percentage,half_time_full_time_double)",
    },
  });
}

/**
 * Writes NRL insight aggregate rows to Supabase.
 */
async function writeAggregates(supabase, rows) {
  await clearExistingAggregates(supabase);
  await supabase.upsert("nrl_insight_aggregates", rows, "scope_key");

  return {
    nrlInsightAggregates: rows.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Produces a compact summary for dry runs and writes.
 */
function summarize(sourceRows, fixedWinRows, halfTimeFullTimeRows, tryScorerRows, sameGameMultiRows) {
  return {
    fixedWinAggregateRows: fixedWinRows.length,
    fixedWinSnapshots: sourceRows.fixedWinResults.length,
    halfTimeFullTimeAggregateRows: halfTimeFullTimeRows.length,
    halfTimeFullTimeResults: sourceRows.halfTimeFullTimeResults.length,
    nrlAppearances: sourceRows.appearances.length,
    nrlMatches: sourceRows.matches.length,
    nrlSameGameMultiResults: sourceRows.sameGameMultiResults.length,
    nrlTryScorerMarketSnapshots: sourceRows.tryScorerPrices.length,
    nrlTryScorers: sourceRows.tryScorers.length,
    sameGameMultiAggregateRows: sameGameMultiRows.length,
    tryScorerAggregateRows: tryScorerRows.length,
  };
}

/**
 * Runs the local NRL insight aggregate rebuild workflow.
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
  const sourceRows = await readSourceRows(supabase);
  const matchesById = new Map(sourceRows.matches.map((match) => [match.id, match]));
  const matchesBySourceKey = new Map(sourceRows.matches.map((match) => [
    `${match.source}:${match.source_match_id}`,
    match,
  ]));
  const fixedWinRows = buildFixedWinAggregates(sourceRows.fixedWinResults, matchesById);
  const halfTimeFullTimeRows = buildHalfTimeFullTimeAggregates(sourceRows.halfTimeFullTimeResults, matchesById);
  const tryScorerRows = buildTryScorerAggregates(
    sourceRows.appearances,
    sourceRows.tryScorers,
    matchesById,
    matchesBySourceKey,
    sourceRows.tryScorerPrices,
  );
  const sameGameMultiRows = buildSameGameMultiAggregates(sourceRows.sameGameMultiResults);
  const rows = [...fixedWinRows, ...halfTimeFullTimeRows, ...tryScorerRows, ...sameGameMultiRows];
  const summary = summarize(sourceRows, fixedWinRows, halfTimeFullTimeRows, tryScorerRows, sameGameMultiRows);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.slice(0, 8),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeAggregates(supabase, rows);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
