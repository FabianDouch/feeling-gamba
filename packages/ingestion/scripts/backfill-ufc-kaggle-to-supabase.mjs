import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_SOURCE_END_DATE = "2026-07-24";
const DEFAULT_SOURCE_START_DATE = "2021-07-24";
const VALI_SOURCE = "kaggle_valihameed_ufc_master";
const DAILY_ODDS_SOURCE = "kaggle_jerzyszocik_ufc_betting_odds_daily";

/**
 * Parses the UFC Kaggle backfill options and defaults to the agreed five-year window.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    from: DEFAULT_SOURCE_START_DATE,
    masterCsv: null,
    oddsCsv: null,
    requireSupabase: false,
    to: DEFAULT_SOURCE_END_DATE,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--master-csv=")) {
      options.masterCsv = arg.slice("--master-csv=".length);
    } else if (arg.startsWith("--odds-csv=")) {
      options.oddsCsv = arg.slice("--odds-csv=".length);
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!options.masterCsv || !options.oddsCsv) {
    throw new Error("Pass --master-csv=/path/to/ufc-master.csv and --odds-csv=/path/to/UFC_betting_odds.csv.");
  }

  if (!isValidDate(options.from) || !isValidDate(options.to)) {
    throw new Error("Pass --from and --to as YYYY-MM-DD.");
  }

  if (new Date(`${options.from}T00:00:00.000Z`) > new Date(`${options.to}T00:00:00.000Z`)) {
    throw new Error("--from must be before or equal to --to.");
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

/**
 * Loads local env files for manual ingestion runs without overwriting shell values.
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
 * Reads the Supabase service-role write configuration from environment.
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
 * Parses CSV content with quoted values and returns record objects keyed by header.
 */
function parseCsvRecords(contents) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    const nextChar = contents[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const [header = [], ...dataRows] = rows.filter((row) => row.some((value) => value.length > 0));

  return dataRows.map((row) => Object.fromEntries(header.map((name, index) => [
    name,
    row[index] ?? "",
  ])));
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function americanToDecimal(value) {
  const odds = toNullableNumber(value);

  if (odds === null || odds === 0) {
    return null;
  }

  if (odds > 0) {
    return roundNumber(1 + odds / 100);
  }

  return roundNumber(1 + 100 / Math.abs(odds));
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fightPairKey(date, fighterA, fighterB) {
  return [
    date,
    ...[normalizeName(fighterA), normalizeName(fighterB)].sort(),
  ].join("|");
}

function sourceFightKey(date, redFighter, blueFighter) {
  return [
    "ufc",
    date,
    normalizeName(redFighter),
    normalizeName(blueFighter),
  ].join("|");
}

function isInDateWindow(date, from, to) {
  return date >= from && date <= to;
}

function median(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Builds an exact-date odds index with one latest row per bookmaker/source region.
 */
function buildDailyOddsIndex(rows, options) {
  const groups = new Map();

  for (const row of rows) {
    const eventDate = row.event_date;
    const odds1 = toNullableNumber(row.odds_1);
    const odds2 = toNullableNumber(row.odds_2);

    if (!isValidDate(eventDate) || !isInDateWindow(eventDate, options.from, options.to)) {
      continue;
    }

    if (!Number.isFinite(odds1) || !Number.isFinite(odds2)) {
      continue;
    }

    const pairKey = fightPairKey(eventDate, row.fighter_1, row.fighter_2);
    const sourceKey = `${row.source || "unknown"}|${row.region || "unknown"}`;
    const addingDate = row.adding_date || null;
    const normalized = {
      addingDate,
      fightUrl: row.fight_url || null,
      fighter1: row.fighter_1,
      fighter1Key: normalizeName(row.fighter_1),
      fighter1Url: row.fighter_1_url || null,
      fighter2: row.fighter_2,
      fighter2Key: normalizeName(row.fighter_2),
      fighter2Url: row.fighter_2_url || null,
      odds1,
      odds2,
      region: row.region || null,
      source: row.source || null,
    };
    const sourceRows = groups.get(pairKey) ?? new Map();
    const existing = sourceRows.get(sourceKey);

    if (!existing || String(normalized.addingDate ?? "") >= String(existing.addingDate ?? "")) {
      sourceRows.set(sourceKey, normalized);
    }

    groups.set(pairKey, sourceRows);
  }

  return new Map(Array.from(groups.entries()).map(([pairKey, sourceRows]) => [
    pairKey,
    Array.from(sourceRows.values()),
  ]));
}

function alignDailyOddsToMaster(masterRow, dailyRows) {
  const redKey = normalizeName(masterRow.RedFighter);
  const blueKey = normalizeName(masterRow.BlueFighter);
  const redPrices = [];
  const bluePrices = [];
  const sources = new Set();
  const regions = new Set();
  let latestSampleAt = null;
  let fightUrl = null;
  let redFighterSourceId = null;
  let blueFighterSourceId = null;

  for (const row of dailyRows) {
    const rowRedPrice = row.fighter1Key === redKey
      ? row.odds1
      : row.fighter2Key === redKey
        ? row.odds2
        : null;
    const rowBluePrice = row.fighter1Key === blueKey
      ? row.odds1
      : row.fighter2Key === blueKey
        ? row.odds2
        : null;

    if (!Number.isFinite(rowRedPrice) || !Number.isFinite(rowBluePrice)) {
      continue;
    }

    redPrices.push(rowRedPrice);
    bluePrices.push(rowBluePrice);

    if (row.source) {
      sources.add(row.source);
    }

    if (row.region) {
      regions.add(row.region);
    }

    if (!latestSampleAt || String(row.addingDate ?? "") >= String(latestSampleAt)) {
      latestSampleAt = row.addingDate;
      fightUrl = row.fightUrl;
    }

    if (row.fighter1Key === redKey) {
      redFighterSourceId = row.fighter1Url;
      blueFighterSourceId = row.fighter2Url;
    } else if (row.fighter2Key === redKey) {
      redFighterSourceId = row.fighter2Url;
      blueFighterSourceId = row.fighter1Url;
    }
  }

  const redPrice = median(redPrices);
  const bluePrice = median(bluePrices);

  if (!Number.isFinite(redPrice) || !Number.isFinite(bluePrice)) {
    return null;
  }

  return {
    blueFighterSourceId,
    bluePrice: roundNumber(bluePrice),
    fightUrl,
    priceBookmaker: sources.size === 1 ? Array.from(sources)[0] : `median:${sources.size || dailyRows.length}`,
    priceRegion: regions.size === 1 ? Array.from(regions)[0] : regions.size ? "mixed" : null,
    priceSampleAt: latestSampleAt,
    priceSourceCount: redPrices.length,
    redFighterSourceId,
    redPrice: roundNumber(redPrice),
  };
}

function normalizeWinnerSide(value) {
  const normalized = normalizeName(value);

  if (normalized === "red") {
    return "red";
  }

  if (normalized === "blue") {
    return "blue";
  }

  if (normalized.includes("draw")) {
    return "draw";
  }

  if (normalized.includes("no contest") || normalized === "nc") {
    return "no_contest";
  }

  return normalized ? "unknown" : null;
}

function derivePriceState(masterRow, dailyOddsIndex) {
  const redMasterPrice = americanToDecimal(masterRow.RedOdds);
  const blueMasterPrice = americanToDecimal(masterRow.BlueOdds);

  if (Number.isFinite(redMasterPrice) && Number.isFinite(blueMasterPrice)) {
    return {
      blueFixedWinPrice: blueMasterPrice,
      bluePriceAmerican: toNullableNumber(masterRow.BlueOdds),
      fightUrl: null,
      matchReviewRequired: false,
      priceBookmaker: "master_dataset",
      priceMatchDetail: "Vali Hameed RedOdds/BlueOdds converted from American moneyline to decimal fixed-win price.",
      priceMatchStatus: "master_priced",
      priceRegion: null,
      priceSampleAt: null,
      priceSource: VALI_SOURCE,
      priceSourceCount: 1,
      redFixedWinPrice: redMasterPrice,
      redPriceAmerican: toNullableNumber(masterRow.RedOdds),
    };
  }

  const exactDailyRows = dailyOddsIndex.get(fightPairKey(masterRow.Date, masterRow.RedFighter, masterRow.BlueFighter)) ?? [];
  const dailyMatch = alignDailyOddsToMaster(masterRow, exactDailyRows);

  if (dailyMatch) {
    return {
      blueFighterSourceId: dailyMatch.blueFighterSourceId,
      blueFixedWinPrice: dailyMatch.bluePrice,
      bluePriceAmerican: null,
      fightUrl: dailyMatch.fightUrl,
      matchReviewRequired: false,
      priceBookmaker: dailyMatch.priceBookmaker,
      priceMatchDetail: "Exact event_date plus unordered fighter-pair match against daily odds; latest row per source/region, median decimal price.",
      priceMatchStatus: "daily_exact",
      priceRegion: dailyMatch.priceRegion,
      priceSampleAt: dailyMatch.priceSampleAt,
      priceSource: DAILY_ODDS_SOURCE,
      priceSourceCount: dailyMatch.priceSourceCount,
      redFighterSourceId: dailyMatch.redFighterSourceId,
      redFixedWinPrice: dailyMatch.redPrice,
      redPriceAmerican: null,
    };
  }

  return {
    blueFixedWinPrice: null,
    bluePriceAmerican: toNullableNumber(masterRow.BlueOdds),
    fightUrl: null,
    matchReviewRequired: false,
    priceBookmaker: null,
    priceMatchDetail: "No source-backed exact price match in configured five-year window.",
    priceMatchStatus: "result_only",
    priceRegion: null,
    priceSampleAt: null,
    priceSource: "missing",
    priceSourceCount: 0,
    redFixedWinPrice: null,
    redPriceAmerican: toNullableNumber(masterRow.RedOdds),
  };
}

function deriveFavourite(row) {
  const redPrice = row.red_fixed_win_price;
  const bluePrice = row.blue_fixed_win_price;

  if (!Number.isFinite(redPrice) || !Number.isFinite(bluePrice)) {
    return {
      favouriteName: null,
      favouritePrice: null,
      favouriteSide: null,
      favouriteWinReturn: null,
      favouriteWon: null,
      includedInInsights: false,
      missingPrice: true,
      otherFighterName: null,
      otherFighterPrice: null,
      priceDifference: null,
    };
  }

  if (redPrice === bluePrice) {
    return {
      favouriteName: null,
      favouritePrice: null,
      favouriteSide: null,
      favouriteWinReturn: null,
      favouriteWon: null,
      includedInInsights: false,
      missingPrice: false,
      otherFighterName: null,
      otherFighterPrice: null,
      priceDifference: 0,
    };
  }

  const favouriteSide = redPrice < bluePrice ? "red" : "blue";
  const favouritePrice = favouriteSide === "red" ? redPrice : bluePrice;
  const otherFighterPrice = favouriteSide === "red" ? bluePrice : redPrice;
  const favouriteWon = row.winner_side === favouriteSide;
  const hasStandardResult = row.winner_side === "red" || row.winner_side === "blue";

  return {
    favouriteName: favouriteSide === "red" ? row.red_fighter_name : row.blue_fighter_name,
    favouritePrice,
    favouriteSide,
    favouriteWinReturn: hasStandardResult && favouriteWon ? favouritePrice : hasStandardResult ? 0 : null,
    favouriteWon: hasStandardResult ? favouriteWon : null,
    includedInInsights: hasStandardResult,
    missingPrice: false,
    otherFighterName: favouriteSide === "red" ? row.blue_fighter_name : row.red_fighter_name,
    otherFighterPrice,
    priceDifference: roundNumber(otherFighterPrice - favouritePrice),
  };
}

/**
 * Combines result rows with exact daily-odds matches into UFC historical entries.
 */
function buildFightEntries(masterRows, dailyOddsIndex, options) {
  const fightEntries = [];
  const skippedRows = {
    outsideDateWindow: 0,
    missingDate: 0,
    missingFighters: 0,
  };

  for (const masterRow of masterRows) {
    const eventDate = masterRow.Date;

    if (!isValidDate(eventDate)) {
      skippedRows.missingDate += 1;
      continue;
    }

    if (!isInDateWindow(eventDate, options.from, options.to)) {
      skippedRows.outsideDateWindow += 1;
      continue;
    }

    if (!masterRow.RedFighter || !masterRow.BlueFighter) {
      skippedRows.missingFighters += 1;
      continue;
    }

    const priceState = derivePriceState(masterRow, dailyOddsIndex);
    const winnerSide = normalizeWinnerSide(masterRow.Winner);
    const baseRow = {
      blue_fighter_key: normalizeName(masterRow.BlueFighter),
      blue_fighter_name: masterRow.BlueFighter,
      blue_fighter_source_id: priceState.blueFighterSourceId ?? null,
      blue_fixed_win_price: priceState.blueFixedWinPrice,
      blue_price_american: priceState.bluePriceAmerican,
      event_date: eventDate,
      event_name: null,
      fight_url: priceState.fightUrl,
      finish_details: masterRow.FinishDetails || null,
      finish_round: toNullableNumber(masterRow.FinishRound),
      finish_type: masterRow.Finish || null,
      location: masterRow.Location || null,
      match_review_required: priceState.matchReviewRequired,
      price_bookmaker: priceState.priceBookmaker,
      price_match_detail: priceState.priceMatchDetail,
      price_match_status: priceState.priceMatchStatus,
      price_region: priceState.priceRegion,
      price_sample_at: priceState.priceSampleAt,
      price_source: priceState.priceSource,
      price_source_count: priceState.priceSourceCount,
      raw: {
        dailyOddsSource: priceState.priceMatchStatus === "daily_exact" ? DAILY_ODDS_SOURCE : null,
        masterSource: VALI_SOURCE,
        sourceColumns: {
          BlueExpectedValue: masterRow.BlueExpectedValue || null,
          BlueOdds: masterRow.BlueOdds || null,
          RedExpectedValue: masterRow.RedExpectedValue || null,
          RedOdds: masterRow.RedOdds || null,
        },
      },
      red_fighter_key: normalizeName(masterRow.RedFighter),
      red_fighter_name: masterRow.RedFighter,
      red_fighter_source_id: priceState.redFighterSourceId ?? null,
      red_fixed_win_price: priceState.redFixedWinPrice,
      red_price_american: priceState.redPriceAmerican,
      result_status: winnerSide === "red" || winnerSide === "blue" ? "settled" : "non_standard",
      source_fight_key: sourceFightKey(eventDate, masterRow.RedFighter, masterRow.BlueFighter),
      total_fight_time_seconds: toNullableNumber(masterRow.TotalFightTimeSecs),
      winner_name: winnerSide === "red"
        ? masterRow.RedFighter
        : winnerSide === "blue"
          ? masterRow.BlueFighter
          : null,
      winner_side: winnerSide,
    };
    const favourite = deriveFavourite(baseRow);

    fightEntries.push({
      ...baseRow,
      favourite_name: favourite.favouriteName,
      favourite_price: favourite.favouritePrice,
      favourite_side: favourite.favouriteSide,
      favourite_win_return: favourite.favouriteWinReturn,
      favourite_won: favourite.favouriteWon,
      included_in_insights: favourite.includedInInsights,
      missing_price: favourite.missingPrice,
      other_fighter_name: favourite.otherFighterName,
      other_fighter_price: favourite.otherFighterPrice,
      price_difference: favourite.priceDifference,
    });
  }

  return {
    fightEntries,
    skippedRows,
  };
}

function getPriceBucketStart(price) {
  return 1 + Math.floor(Math.max(0, price - 1) / 0.5) * 0.5;
}

function getDifferenceBucketStart(price) {
  return Math.floor(Math.max(0, price) / 0.5) * 0.5;
}

function getBucketLabel(start, prefix = "$") {
  return `${prefix}${start.toFixed(2)} - ${prefix}${(start + 0.49).toFixed(2)}`;
}

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

function addFightToAggregate(bucket, fight) {
  bucket.fightCount += 1;
  bucket.missingPriceCount += fight.missing_price ? 1 : 0;
  bucket.resultOnlyCount += fight.price_match_status === "result_only" ? 1 : 0;
  bucket.reviewCandidateCount += fight.price_match_status === "review_candidate" ? 1 : 0;

  if (!fight.included_in_insights || !Number.isFinite(fight.favourite_price)) {
    return;
  }

  bucket.pricedFightCount += 1;
  bucket.favouriteSelections += 1;
  bucket.favouriteWins += fight.favourite_won ? 1 : 0;
  bucket.totalStake += 1;
  bucket.totalReturn += fight.favourite_win_return ?? 0;
}

function getAggregateScopes(fight) {
  const scopes = [
    {
      scopeKey: "ufc:overall",
      scopeType: "overall",
    },
    {
      scopeKey: `ufc:price_match_status:${fight.price_match_status}`,
      scopeType: "price_match_status",
    },
  ];

  if (Number.isFinite(fight.favourite_price)) {
    const start = getPriceBucketStart(fight.favourite_price);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `ufc:favourite_price_bucket:${start.toFixed(2)}`,
      scopeType: "favourite_price_bucket",
    });
  }

  if (Number.isFinite(fight.other_fighter_price)) {
    const start = getPriceBucketStart(fight.other_fighter_price);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `ufc:other_fighter_price_bucket:${start.toFixed(2)}`,
      scopeType: "other_fighter_price_bucket",
    });
  }

  if (Number.isFinite(fight.price_difference)) {
    const start = getDifferenceBucketStart(fight.price_difference);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `ufc:price_difference_bucket:${start.toFixed(2)}`,
      scopeType: "price_difference_bucket",
    });
  }

  return scopes;
}

/**
 * Builds UFC aggregate read rows from priced fights only, with result-only counts retained.
 */
function buildUfcInsightAggregates(fightEntries, dateFrom, dateTo) {
  const buckets = new Map();

  function getBucket(scope) {
    const bucket = buckets.get(scope.scopeKey) ?? createAggregateBucket(scope);
    buckets.set(scope.scopeKey, bucket);
    return bucket;
  }

  for (const fight of fightEntries) {
    for (const scope of getAggregateScopes(fight)) {
      addFightToAggregate(getBucket(scope), fight);
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundMoney(bucket.totalStake);
    const totalReturn = roundMoney(bucket.totalReturn);
    const netReturn = roundMoney(totalReturn - totalStake);

    return {
      average_return_per_dollar: totalStake ? roundNumber(totalReturn / totalStake) : 0,
      date_from: dateFrom,
      date_to: dateTo,
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

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for service-role upserts used by local UFC backfills.
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

  async function upsert(table, rows, onConflict, prefer = "resolution=merge-duplicates,return=minimal") {
    if (!rows.length) {
      return [];
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
    upsert,
  };
}

async function writeRowsToSupabase(rows, options) {
  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase URL or service-role key is not configured.");
    }

    return {
      ok: false,
      reason: "Supabase URL or service-role key is not configured.",
      skipped: true,
    };
  }

  const supabase = createSupabaseRestClient(config, options.batchSize);

  await supabase.upsert("ufc_fight_entries", rows.fightEntries, "source_fight_key");
  await supabase.upsert("ufc_insight_aggregates", rows.insightAggregates, "scope_key");

  return {
    ok: true,
    skipped: false,
    summary: summarizeRows(rows),
  };
}

function summarizeRows(rows) {
  const fightEntries = rows.fightEntries ?? [];
  const byMatchStatus = fightEntries.reduce((summary, fight) => {
    summary[fight.price_match_status] = (summary[fight.price_match_status] ?? 0) + 1;
    return summary;
  }, {});

  return {
    byMatchStatus,
    includedInInsights: fightEntries.filter((fight) => fight.included_in_insights).length,
    insightAggregates: rows.insightAggregates?.length ?? 0,
    pricedFights: fightEntries.filter((fight) => !fight.missing_price).length,
    ufcFightEntries: fightEntries.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const [masterCsv, oddsCsv] = await Promise.all([
    readFile(path.resolve(REPO_ROOT, options.masterCsv), "utf8"),
    readFile(path.resolve(REPO_ROOT, options.oddsCsv), "utf8"),
  ]);
  const masterRows = parseCsvRecords(masterCsv);
  const oddsRows = parseCsvRecords(oddsCsv);
  const dailyOddsIndex = buildDailyOddsIndex(oddsRows, options);
  const { fightEntries, skippedRows } = buildFightEntries(masterRows, dailyOddsIndex, options);
  const insightAggregates = buildUfcInsightAggregates(fightEntries, options.from, options.to);
  const rows = {
    fightEntries,
    insightAggregates,
  };
  const summary = {
    ...summarizeRows(rows),
    dateRange: {
      from: options.from,
      to: options.to,
    },
    dailyOddsUniqueExactKeys: dailyOddsIndex.size,
    skippedRows,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRowsToSupabase(rows, options);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
