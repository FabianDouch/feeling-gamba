import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_SOURCE_JSON = "packages/ingestion/data/pfl-bookmakers-review-2026-07-31.json";

/**
 * Parses the small PFL seed-import CLI surface.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    requireSupabase: false,
    sourceJson: DEFAULT_SOURCE_JSON,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--source-json=")) {
      options.sourceJson = arg.slice("--source-json=".length);
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

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

/**
 * Converts American moneyline odds into decimal fixed-win price including stake.
 */
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

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceFightKey(seed, fight) {
  return [
    "pfl",
    seed.eventDate,
    normalizeName(seed.eventName),
    normalizeName(fight.fighterOneName),
    normalizeName(fight.fighterTwoName),
  ].join("|");
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

/**
 * Picks the median displayed bookmaker fixed-win price for one fighter.
 */
function derivePriceState(fight, side) {
  const key = side === "fighter_one" ? "fighterOneBookmakerMoneylines" : "fighterTwoBookmakerMoneylines";
  const openingKey = side === "fighter_one" ? "fighterOneOpeningMoneyline" : "fighterTwoOpeningMoneyline";
  const moneylines = (fight[key] ?? []).map(toNullableNumber).filter((value) => value !== null);
  const decimals = moneylines.map(americanToDecimal).filter((value) => value !== null);
  const fixedWinPrice = median(decimals);

  return {
    fixedWinPrice: fixedWinPrice === null ? null : roundNumber(fixedWinPrice),
    openingMoneyline: toNullableNumber(fight[openingKey]),
    selectedMoneyline: median(moneylines),
    sourceCount: moneylines.length,
  };
}

/**
 * Converts source-backed PFL seed fights into the persisted read model shape.
 */
function buildFightEntries(seed) {
  return (seed.fights ?? []).map((fight) => {
    const fighterOne = derivePriceState(fight, "fighter_one");
    const fighterTwo = derivePriceState(fight, "fighter_two");
    const missingPrice = !Number.isFinite(fighterOne.fixedWinPrice) || !Number.isFinite(fighterTwo.fixedWinPrice);
    const winnerName = fight.winnerName ?? null;
    const winnerSide = winnerName && normalizeName(winnerName) === normalizeName(fight.fighterOneName)
      ? "fighter_one"
      : winnerName && normalizeName(winnerName) === normalizeName(fight.fighterTwoName)
        ? "fighter_two"
        : "unknown";
    const priceMatchStatus = missingPrice ? "result_only" : "bookmakers_review_priced";
    const equalPrice = !missingPrice && fighterOne.fixedWinPrice === fighterTwo.fixedWinPrice;
    const favouriteSide = missingPrice || equalPrice
      ? null
      : fighterOne.fixedWinPrice < fighterTwo.fixedWinPrice
        ? "fighter_one"
        : "fighter_two";
    const favouriteName = favouriteSide === "fighter_one"
      ? fight.fighterOneName
      : favouriteSide === "fighter_two"
        ? fight.fighterTwoName
        : null;
    const favouritePrice = favouriteSide === "fighter_one"
      ? fighterOne.fixedWinPrice
      : favouriteSide === "fighter_two"
        ? fighterTwo.fixedWinPrice
        : null;
    const otherFighterName = favouriteSide === "fighter_one"
      ? fight.fighterTwoName
      : favouriteSide === "fighter_two"
        ? fight.fighterOneName
        : null;
    const otherFighterPrice = favouriteSide === "fighter_one"
      ? fighterTwo.fixedWinPrice
      : favouriteSide === "fighter_two"
        ? fighterOne.fixedWinPrice
        : null;
    const favouriteWon = favouriteSide !== null ? winnerSide === favouriteSide : null;
    const includedInInsights = !missingPrice && !equalPrice && ["fighter_one", "fighter_two"].includes(winnerSide);

    return {
      event_date: seed.eventDate,
      event_name: seed.eventName,
      favourite_name: favouriteName,
      favourite_price: favouritePrice,
      favourite_side: favouriteSide,
      favourite_win_return: includedInInsights && favouriteWon ? favouritePrice : includedInInsights ? 0 : null,
      favourite_won: favouriteWon,
      fighter_one_fixed_win_price: fighterOne.fixedWinPrice,
      fighter_one_key: normalizeName(fight.fighterOneName),
      fighter_one_name: fight.fighterOneName,
      fighter_one_price_american: fighterOne.selectedMoneyline,
      fighter_two_fixed_win_price: fighterTwo.fixedWinPrice,
      fighter_two_key: normalizeName(fight.fighterTwoName),
      fighter_two_name: fight.fighterTwoName,
      fighter_two_price_american: fighterTwo.selectedMoneyline,
      finish_details: fight.finishDetails ?? null,
      finish_round: toNullableNumber(fight.finishRound),
      finish_type: fight.finishType ?? null,
      included_in_insights: includedInInsights,
      location: seed.location ?? null,
      match_review_required: false,
      missing_price: missingPrice,
      other_fighter_name: otherFighterName,
      other_fighter_price: otherFighterPrice,
      price_bookmaker: "bookmakers_review_displayed_books",
      price_difference: Number.isFinite(favouritePrice) && Number.isFinite(otherFighterPrice)
        ? roundNumber(otherFighterPrice - favouritePrice)
        : null,
      price_match_detail: missingPrice
        ? "Result source found, but no Bookmakers Review fixed-win row was captured in the indexed page."
        : "Median decimal fixed-win price from displayed Bookmakers Review sportsbook moneylines.",
      price_match_status: priceMatchStatus,
      price_region: seed.priceRegion ?? "us",
      price_sample_at: seed.priceSampleAt ?? null,
      price_source: missingPrice ? "missing" : seed.priceSource,
      price_source_count: Math.max(fighterOne.sourceCount, fighterTwo.sourceCount),
      raw: {
        fight,
        priceSourceUrl: seed.priceSourceUrl,
        resultSources: seed.resultSources ?? [],
      },
      result_status: "settled",
      source_fight_key: sourceFightKey(seed, fight),
      source_url: seed.priceSourceUrl ?? null,
      total_fight_time_seconds: toNullableNumber(fight.totalFightTimeSeconds),
      winner_name: winnerName,
      winner_side: winnerSide,
    };
  });
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
      scopeKey: "pfl:overall",
      scopeType: "overall",
    },
    {
      scopeKey: `pfl:price_match_status:${fight.price_match_status}`,
      scopeType: "price_match_status",
    },
  ];

  if (Number.isFinite(fight.favourite_price)) {
    const start = getPriceBucketStart(fight.favourite_price);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `pfl:favourite_price_bucket:${start.toFixed(2)}`,
      scopeType: "favourite_price_bucket",
    });
  }

  if (Number.isFinite(fight.other_fighter_price)) {
    const start = getPriceBucketStart(fight.other_fighter_price);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `pfl:other_fighter_price_bucket:${start.toFixed(2)}`,
      scopeType: "other_fighter_price_bucket",
    });
  }

  if (Number.isFinite(fight.price_difference)) {
    const start = getDifferenceBucketStart(fight.price_difference);
    scopes.push({
      priceBucketEnd: start + 0.49,
      priceBucketLabel: getBucketLabel(start),
      priceBucketStart: start,
      scopeKey: `pfl:price_difference_bucket:${start.toFixed(2)}`,
      scopeType: "price_difference_bucket",
    });
  }

  return scopes;
}

/**
 * Builds app-facing PFL aggregate rows from priced settled fights only.
 */
function buildPflInsightAggregates(fightEntries) {
  const buckets = new Map();
  const dates = fightEntries.map((fight) => fight.event_date).filter(Boolean).sort();

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

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for service-role upserts used by local PFL backfills.
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

  await supabase.upsert("pfl_fight_entries", rows.fightEntries, "source_fight_key");
  await supabase.upsert("pfl_insight_aggregates", rows.insightAggregates, "scope_key");

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
    pflFightEntries: fightEntries.length,
    pricedFights: fightEntries.filter((fight) => !fight.missing_price).length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const sourcePath = path.resolve(REPO_ROOT, options.sourceJson);
  const seed = JSON.parse(await readFile(sourcePath, "utf8"));
  const fightEntries = buildFightEntries(seed);
  const insightAggregates = buildPflInsightAggregates(fightEntries);
  const rows = {
    fightEntries,
    insightAggregates,
  };
  const summary = {
    ...summarizeRows(rows),
    dateRange: {
      from: insightAggregates.find((row) => row.scope_key === "pfl:overall")?.date_from ?? null,
      to: insightAggregates.find((row) => row.scope_key === "pfl:overall")?.date_to ?? null,
    },
    sourceJson: path.relative(REPO_ROOT, sourcePath),
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sampleFightEntries: fightEntries.slice(0, 3),
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
