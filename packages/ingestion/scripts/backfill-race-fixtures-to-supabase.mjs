import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXED_WIN_PRODUCT_TYPE_ID = "940b8704-e497-4a76-b390-00918ff7d282";
const SOURCE_NAME = "betcha_graphql_fixture";
const SOURCE_TIME_ZONE = "Pacific/Auckland";
const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_FIXTURES_DIR = "data/raw/betcha-graphql";
const DEFAULT_BATCH_SIZE = 300;
const COVERAGE_MODE_PILOT = "pilot";
const COVERAGE_MODE_ALL_DOMESTIC = "all_domestic";

/**
 * Parses CLI options for a local-fixture-to-Supabase backfill run.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    coverageMode: COVERAGE_MODE_PILOT,
    date: null,
    dryRun: false,
    fixturesDir: DEFAULT_FIXTURES_DIR,
    from: null,
    insightsOnly: false,
    requireSupabase: false,
    to: null,
  };

  for (const arg of argv) {
    if (arg === "--all-domestic" || arg === "--coverage=all-domestic" || arg === "--coverage=all_domestic") {
      options.coverageMode = COVERAGE_MODE_ALL_DOMESTIC;
    } else if (arg === "--pilot-tracks" || arg === "--coverage=pilot") {
      options.coverageMode = COVERAGE_MODE_PILOT;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--insights-only") {
      options.insightsOnly = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--fixtures-dir=")) {
      options.fixturesDir = arg.slice("--fixtures-dir=".length);
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (options.date && (options.from || options.to)) {
    throw new Error("Use either --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD.");
  }

  if (options.date && !isValidDate(options.date)) {
    throw new Error("Pass --date as YYYY-MM-DD.");
  }

  if ((options.from || options.to) && (!isValidDate(options.from) || !isValidDate(options.to))) {
    throw new Error("Pass --from and --to as YYYY-MM-DD.");
  }

  if (!options.date && !options.from) {
    throw new Error("Pass --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD.");
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

function listDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (cursor > end) {
    throw new Error("--from must be before or equal to --to.");
  }

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
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

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function dedupeRows(rows, keyFn) {
  return Array.from(new Map(rows.map((row) => [keyFn(row), row])).values());
}

function normalizeCountry(value) {
  return value === "AU" ? "AUS" : value ?? "Unknown";
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toSlug(value) {
  return normalizeName(value).replace(/\s+/g, "-") || "unknown";
}

function toRaceCode(category) {
  const mapping = {
    GREYHOUND: "greyhound",
    HARNESS: "harness",
    HORSE: "horse",
  };

  return mapping[category] ?? String(category ?? "").toLowerCase();
}

function getRaceCardUuid(id) {
  return String(id ?? "").replace(/^RacingRaceCard:/, "").replace(/^RacingRace:/, "") || null;
}

function getEntrantUuid(id) {
  return String(id ?? "").replace(/^RacingEntrant:/, "") || null;
}

function getFixedWinPrice(runner) {
  const price = runner.prices?.find((candidate) =>
    String(candidate.id).includes(`:${FIXED_WIN_PRODUCT_TYPE_ID}:`),
  );
  const decimal = Number(price?.odds?.decimal);

  return Number.isFinite(decimal) ? decimal : null;
}

function getResultRows(raceCard) {
  const result = raceCard?.results?.find(
    (entry) => entry.__typename === "RacingResults" && Array.isArray(entry.runnerRows),
  );

  return result?.runnerRows ?? [];
}

function getMarginRows(raceCard) {
  const result = raceCard?.results?.find(
    (entry) => entry.__typename === "RacingMarginResults" && Array.isArray(entry.runnerRows),
  );

  return result?.runnerRows ?? [];
}

function parseDividendValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNamedDividend(dividends, label) {
  return parseDividendValue(dividends?.find((dividend) => dividend.label === label)?.value);
}

function isVacantRunner(runner) {
  return normalizeName(runner?.name) === "vacant box";
}

function getActiveRunnerRows(raceCard) {
  return (raceCard?.finalField?.runnerRows ?? []).filter((runner) =>
    !runner.scratchedTimestamp && !isVacantRunner(runner),
  );
}

function getPriceBucketStart(price) {
  return 1 + Math.floor(Math.max(0, price - 1) / 0.5) * 0.5;
}

function getPriceBucketLabel(start) {
  return `$${start.toFixed(2)} - $${(start + 0.49).toFixed(2)}`;
}

function getDistanceBand(distance) {
  const normalizedDistance = Number(distance);

  if (!Number.isFinite(normalizedDistance)) {
    return null;
  }

  if (normalizedDistance <= 350) {
    return "<=350m";
  }

  if (normalizedDistance <= 500) {
    return "351-500m";
  }

  if (normalizedDistance <= 800) {
    return "501-800m";
  }

  if (normalizedDistance <= 1200) {
    return "801-1200m";
  }

  if (normalizedDistance <= 1600) {
    return "1201-1600m";
  }

  if (normalizedDistance <= 2200) {
    return "1601-2200m";
  }

  return "2201m+";
}

function getTrackConditionGroup(trackCondition) {
  const normalizedCondition = normalizeName(trackCondition);

  if (!normalizedCondition) {
    return null;
  }

  if (normalizedCondition.includes("heavy")) {
    return "heavy";
  }

  if (
    normalizedCondition.includes("soft")
    || normalizedCondition.includes("slow")
    || normalizedCondition.includes("dead")
    || normalizedCondition.includes("easy")
    || normalizedCondition.includes("slushy")
  ) {
    return "soft/slow";
  }

  if (
    normalizedCondition.includes("good")
    || normalizedCondition.includes("fast")
    || normalizedCondition.includes("firm")
  ) {
    return "good/fast";
  }

  if (normalizedCondition.includes("synthetic")) {
    return "synthetic";
  }

  return normalizedCondition;
}

function getSourceStatus(race) {
  if (!race.raceCard) {
    return "missing_race_card";
  }

  if (!race.derived?.hasResultRows) {
    return "missing_result";
  }

  return "settled";
}

function fixtureFileNameForDate(date, coverageMode) {
  const prefix = coverageMode === COVERAGE_MODE_ALL_DOMESTIC ? "all-domestic" : "pilot-tracks";

  return `${prefix}-${date}.json`;
}

/**
 * Loads selected daily raw fixtures in date order.
 */
async function loadFixtures(options) {
  const fixturesDir = path.resolve(REPO_ROOT, options.fixturesDir);
  const dates = options.date ? [options.date] : listDates(options.from, options.to);
  const availableFiles = new Set(await readdir(fixturesDir));
  const fixtures = [];

  for (const date of dates) {
    const file = fixtureFileNameForDate(date, options.coverageMode);

    if (!availableFiles.has(file)) {
      throw new Error(`Missing fixture for ${date}: ${path.join(fixturesDir, file)}`);
    }

    fixtures.push({
      file,
      fixture: JSON.parse(await readFile(path.join(fixturesDir, file), "utf8")),
      path: path.join(fixturesDir, file),
    });
  }

  return fixtures;
}

/**
 * Converts fixture meetings and race cards into normalized row batches.
 */
function buildBackfillRows(fixtures) {
  const meetings = [];
  const races = [];
  const runners = [];
  const oddsSnapshots = [];
  const raceResults = [];
  const raceDividends = [];
  const raceMarketStates = [];
  const raceDayEntries = [];
  const sourceFetches = [];
  const aggregateInput = [];

  for (const { file, fixture, path: fixturePath } of fixtures) {
    sourceFetches.push({
      error_message: null,
      fetched_at: fixture.generatedAt ?? new Date().toISOString(),
      method: "LOCAL_FILE",
      parser_version: "backfill-race-fixtures-to-supabase/v1",
      raw: {
        counts: fixture.counts,
        generatedAt: fixture.generatedAt,
        source: fixture.source,
        testDate: fixture.testDate,
      },
      raw_storage_path: path.relative(REPO_ROOT, fixturePath),
      request_key: file,
      source: SOURCE_NAME,
      status_code: 200,
      success: true,
      url: null,
    });

    for (const meeting of fixture.meetings ?? []) {
      const sourceMeeting = meeting.source ?? {};
      const country = normalizeCountry(sourceMeeting.venue?.country);
      const raceCode = toRaceCode(sourceMeeting.category);
      const courseName = meeting.canonicalTrack ?? sourceMeeting.venue?.name ?? sourceMeeting.name ?? "Unknown";
      const courseSlug = toSlug(courseName);
      const meetingKey = getMeetingKey({ country, courseSlug, meetingDate: fixture.testDate, raceCode });

      meetings.push({
        country,
        course_name: courseName,
        course_slug: courseSlug,
        meeting_date: fixture.testDate,
        race_code: raceCode,
        raw: sourceMeeting,
        region: sourceMeeting.venue?.state ?? null,
        source_meeting_id: sourceMeeting.id ?? null,
        source_primary: SOURCE_NAME,
      });

      for (const race of meeting.races ?? []) {
        const raceCard = race.raceCard ?? {};
        const sourceRace = race.sourceRace ?? {};
        const raceNumber = Number(raceCard.number ?? sourceRace.number);
        const raceKey = getRaceKey({ meetingKey, raceNumber });
        const activeRunners = getActiveRunnerRows(raceCard);
        const resultRows = getResultRows(raceCard);
        const resultByEntrantId = new Map(resultRows.map((row) => [row.id, row]));
        const marginByEntrantId = new Map(getMarginRows(raceCard).map((row) => [row.id, row]));
        const favourite = race.derived?.favourites?.[0] ?? null;
        const marketMover = race.derived?.marketMovers?.[0] ?? null;
        const winner = race.derived?.winners?.[0] ?? null;

        races.push({
          advertised_start: raceCard.advertisedStart ?? sourceRace.advertisedStart ?? null,
          declared_runner_count: (raceCard.finalField?.runnerRows ?? []).filter((runner) => !isVacantRunner(runner)).length,
          distance_m: Number.isFinite(Number(raceCard.distance)) ? Number(raceCard.distance) : null,
          meeting_key: meetingKey,
          race_name: raceCard.name ?? sourceRace.name ?? null,
          race_number: raceNumber,
          raw: {
            raceCardId: race.raceCardId,
            sourceRace,
          },
          scratched_count: race.derived?.scratchedCount ?? null,
          source_form_id: null,
          source_race_card_id: race.raceCardId ?? raceCard.id ?? null,
          source_race_id: sourceRace.id ?? null,
          status: raceCard.status ?? sourceRace.finalFieldMarket?.status ?? null,
          starter_count: race.derived?.activeStarterCount ?? activeRunners.length,
          track_condition: raceCard.trackCondition ?? null,
        });

        for (const runner of raceCard.finalField?.runnerRows ?? []) {
          if (isVacantRunner(runner)) {
            continue;
          }

          runners.push({
            barrier: null,
            driver_or_jockey_name: null,
            race_key: raceKey,
            raw: {
              prices: runner.prices,
              scratchedTimestamp: runner.scratchedTimestamp ?? null,
            },
            runner_name: runner.name,
            runner_number: runner.number ?? null,
            scratched: Boolean(runner.scratchedTimestamp),
            source_runner_id: runner.id ?? null,
            trainer_name: null,
          });
        }

        for (const runner of activeRunners) {
          const winPrice = getFixedWinPrice(runner);

          if (winPrice === null) {
            continue;
          }

          oddsSnapshots.push({
            is_favourite: (race.derived?.favourites ?? []).some((candidate) => candidate.id === runner.id),
            is_market_mover: Boolean(runner.isMarketMover),
            race_key: raceKey,
            raw: {
              fixedWinProductTypeId: FIXED_WIN_PRODUCT_TYPE_ID,
              sourceRunnerId: runner.id,
            },
            runner_key: getRunnerKey({ raceKey, runnerNumber: runner.number }),
            snapshot_at: raceCard.advertisedStart ?? sourceRace.advertisedStart ?? fixture.generatedAt,
            source: SOURCE_NAME,
            win_price: winPrice,
          });
        }

        for (const resultRow of resultRows) {
          const resultRunner = (raceCard.finalField?.runnerRows ?? []).find((runner) => runner.id === resultRow.id);

          if (!resultRunner || isVacantRunner(resultRunner)) {
            continue;
          }

          raceResults.push({
            finish_position: Number.isFinite(Number(resultRow.position)) ? Number(resultRow.position) : null,
            finish_status: resultRow.position === null ? "unknown" : "finished",
            margin: marginByEntrantId.get(resultRow.id)?.margin ?? null,
            place_dividend: getNamedDividend(resultRow.winPlaceDividends, "Place"),
            race_key: raceKey,
            raw: resultRow,
            result_time: null,
            runner_key: getRunnerKey({ raceKey, runnerNumber: resultRunner.number }),
            tote_place_dividend: getNamedDividend(resultRow.toteDividends, "Place"),
            tote_win_dividend: getNamedDividend(resultRow.toteDividends, "Win"),
            win_dividend: getNamedDividend(resultRow.winPlaceDividends, "Win"),
          });
        }

        for (const exotic of raceCard.results?.filter((entry) => entry.__typename === "RacingExoticResults") ?? []) {
          for (const result of exotic.results ?? []) {
            raceDividends.push({
              amount: parseDividendValue(result.toteOdds?.[0]),
              combination: result.entrantLabelSummary ?? result.name ?? null,
              product: normalizeName(result.name || exotic.title).replace(/\s+/g, "_") || "exotic",
              race_key: raceKey,
              raw: result,
              raw_text: result.toteOdds?.[0] ?? null,
              source: SOURCE_NAME,
            });
          }
        }

        raceMarketStates.push({
          favourite_runner_key: favourite ? getRunnerKey({ raceKey, runnerNumber: favourite.number }) : null,
          market_mover_runner_key: marketMover ? getRunnerKey({ raceKey, runnerNumber: marketMover.number }) : null,
          race_key: raceKey,
          selected_snapshot_key: favourite ? getOddsSnapshotKey({
            raceKey,
            runnerKey: getRunnerKey({ raceKey, runnerNumber: favourite.number }),
            snapshotAt: raceCard.advertisedStart ?? sourceRace.advertisedStart ?? fixture.generatedAt,
            source: SOURCE_NAME,
          }) : null,
          snapshot_at: raceCard.advertisedStart ?? sourceRace.advertisedStart ?? fixture.generatedAt,
          source: SOURCE_NAME,
        });

        raceDayEntries.push({
          advertised_start: raceCard.advertisedStart ?? sourceRace.advertisedStart ?? null,
          country,
          course_name: courseName,
          course_slug: courseSlug,
          declared_runner_count: (raceCard.finalField?.runnerRows ?? []).filter((runner) => !isVacantRunner(runner)).length,
          distance_m: Number.isFinite(Number(raceCard.distance)) ? Number(raceCard.distance) : null,
          favourite_bonus_credit: favourite?.oneDollarBonusBetCredit ?? null,
          favourite_price: favourite?.fixedWinPrice ?? null,
          favourite_result_position: favourite?.resultPosition ?? null,
          favourite_runner_key: favourite ? getRunnerKey({ raceKey, runnerNumber: favourite.number }) : null,
          favourite_runner_name: favourite?.name ?? null,
          favourite_runner_number: favourite?.number ?? null,
          favourite_total_value_with_bonus_credit: favourite?.oneDollarTotalValueWithBonusCredit ?? null,
          favourite_win_return: favourite?.oneDollarWinReturn ?? null,
          market_mover_runner_key: marketMover ? getRunnerKey({ raceKey, runnerNumber: marketMover.number }) : null,
          market_mover_runner_name: marketMover?.name ?? null,
          market_mover_runner_number: marketMover?.number ?? null,
          meeting_date: fixture.testDate,
          meeting_key: meetingKey,
          missing_favourite: !favourite,
          missing_price: !Number.isFinite(favourite?.fixedWinPrice),
          missing_result: favourite ? favourite.resultPosition === null : !race.derived?.hasResultRows,
          race_code: raceCode,
          race_key: raceKey,
          race_name: raceCard.name ?? sourceRace.name ?? null,
          race_number: raceNumber,
          scratched_count: race.derived?.scratchedCount ?? null,
          source_status: getSourceStatus(race),
          starter_count: race.derived?.activeStarterCount ?? activeRunners.length,
          status: raceCard.status ?? sourceRace.finalFieldMarket?.status ?? null,
          track_condition: raceCard.trackCondition ?? null,
          winner_runner_key: winner ? getRunnerKey({ raceKey, runnerNumber: winner.number }) : null,
          winner_runner_name: winner?.name ?? null,
          winner_runner_number: winner?.number ?? null,
          winner_win_dividend: winner?.winDividend ?? null,
        });

        aggregateInput.push({
          country,
          courseName,
          courseSlug,
          date: fixture.testDate,
          distanceBand: getDistanceBand(raceCard.distance),
          favourites: race.derived?.favourites ?? [],
          missingFavourite: !favourite,
          missingPrice: !Number.isFinite(favourite?.fixedWinPrice),
          missingResult: favourite ? favourite.resultPosition === null : !race.derived?.hasResultRows,
          raceCode,
          raceKey,
          starterCount: race.derived?.activeStarterCount ?? activeRunners.length,
          trackConditionGroup: getTrackConditionGroup(raceCard.trackCondition),
        });
      }
    }
  }

  return {
    aggregateInput,
    meetings: dedupeRows(meetings, (row) =>
      getMeetingKey({
        country: row.country,
        courseSlug: row.course_slug,
        meetingDate: row.meeting_date,
        raceCode: row.race_code,
      }),
    ),
    oddsSnapshots: dedupeRows(oddsSnapshots, (row) =>
      getOddsSnapshotKey({
        raceKey: row.race_key,
        runnerKey: row.runner_key,
        snapshotAt: row.snapshot_at,
        source: row.source,
      }),
    ),
    raceDayEntries,
    raceDividends,
    raceMarketStates: dedupeRows(raceMarketStates, (row) => row.race_key),
    raceResults: dedupeRows(raceResults, (row) => `${row.race_key}|${row.runner_key}`),
    races: dedupeRows(races, (row) => getRaceKey({ meetingKey: row.meeting_key, raceNumber: row.race_number })),
    runners: dedupeRows(runners, (row) => getRunnerKey({ raceKey: row.race_key, runnerNumber: row.runner_number })),
    sourceFetches,
  };
}

function getMeetingKey({ country, courseSlug, meetingDate, raceCode }) {
  return `${raceCode}|${country}|${courseSlug}|${meetingDate}`;
}

function getRaceKey({ meetingKey, raceNumber }) {
  return `${meetingKey}|${raceNumber}`;
}

function getRunnerKey({ raceKey, runnerNumber }) {
  return `${raceKey}|${runnerNumber}`;
}

function getOddsSnapshotKey({ raceKey, runnerKey, snapshotAt, source }) {
  return `${raceKey}|${runnerKey}|${source}|${snapshotAt}`;
}

function createAggregateBucket(scope) {
  return {
    ...scope,
    bonusCreditHits: 0,
    favouriteSelections: 0,
    missingFavouriteCount: 0,
    missingPriceCount: 0,
    missingResultCount: 0,
    raceKeys: new Set(),
    seconds: 0,
    thirds: 0,
    totalBonusCredit: 0,
    totalReturn: 0,
    totalStake: 0,
    totalValueWithBonusCredit: 0,
    wins: 0,
  };
}

function addRaceToAggregate(bucket, race) {
  bucket.raceKeys.add(race.raceKey);
  bucket.missingFavouriteCount += race.missingFavourite ? 1 : 0;
  bucket.missingPriceCount += race.missingPrice ? 1 : 0;
  bucket.missingResultCount += race.missingResult ? 1 : 0;
}

function addFavouriteToAggregate(bucket, favourite) {
  if (
    favourite.resultPosition === null
    || !Number.isFinite(favourite.fixedWinPrice)
  ) {
    return;
  }

  bucket.favouriteSelections += 1;
  bucket.totalStake += 1;
  bucket.totalReturn += favourite.oneDollarWinReturn ?? 0;
  bucket.totalBonusCredit += favourite.oneDollarBonusBetCredit ?? 0;
  bucket.totalValueWithBonusCredit += favourite.oneDollarTotalValueWithBonusCredit ?? 0;
  bucket.wins += favourite.resultPosition === 1 ? 1 : 0;
  bucket.seconds += favourite.resultPosition === 2 ? 1 : 0;
  bucket.thirds += favourite.resultPosition === 3 ? 1 : 0;
  bucket.bonusCreditHits += (favourite.oneDollarBonusBetCredit ?? 0) > 0 ? 1 : 0;
}

function getAggregateScopes(race) {
  return [
    {
      scopeKey: "overall",
      scopeType: "overall",
    },
    {
      country: race.country,
      scopeKey: `country:${race.country}`,
      scopeType: "country",
    },
    {
      raceCode: race.raceCode,
      scopeKey: `race_code:${race.raceCode}`,
      scopeType: "race_code",
    },
    {
      country: race.country,
      raceCode: race.raceCode,
      scopeKey: `country_race_code:${race.country}:${race.raceCode}`,
      scopeType: "country_race_code",
    },
    {
      country: race.country,
      courseName: race.courseName,
      courseSlug: race.courseSlug,
      scopeKey: `course:${race.country}:${race.courseSlug}`,
      scopeType: "course",
    },
    {
      country: race.country,
      courseName: race.courseName,
      courseSlug: race.courseSlug,
      raceCode: race.raceCode,
      scopeKey: `course_race_code:${race.country}:${race.courseSlug}:${race.raceCode}`,
      scopeType: "course_race_code",
    },
    {
      starterCount: race.starterCount,
      scopeKey: `starter_count:all:${race.starterCount}`,
      scopeType: "starter_count",
    },
    {
      country: race.country,
      starterCount: race.starterCount,
      scopeKey: `starter_count:country:${race.country}:${race.starterCount}`,
      scopeType: "starter_count",
    },
    {
      raceCode: race.raceCode,
      starterCount: race.starterCount,
      scopeKey: `starter_count:race_code:${race.raceCode}:${race.starterCount}`,
      scopeType: "starter_count",
    },
    {
      country: race.country,
      raceCode: race.raceCode,
      starterCount: race.starterCount,
      scopeKey: `starter_count:country_race_code:${race.country}:${race.raceCode}:${race.starterCount}`,
      scopeType: "starter_count",
    },
    {
      country: race.country,
      courseName: race.courseName,
      courseSlug: race.courseSlug,
      starterCount: race.starterCount,
      scopeKey: `starter_count:course:${race.country}:${race.courseSlug}:${race.starterCount}`,
      scopeType: "starter_count",
    },
  ].filter((scope) =>
    scope.scopeType !== "starter_count"
    || (scope.starterCount !== null && scope.starterCount !== undefined));
}

function getDistanceConditionScopes(race) {
  return [
    { distanceBand: race.distanceBand, scopeKey: `distance_band:all:${race.distanceBand}`, scopeType: "distance_band" },
    { distanceBand: race.distanceBand, raceCode: race.raceCode, scopeKey: `distance_band:race_code:${race.raceCode}:${race.distanceBand}`, scopeType: "distance_band" },
    { country: race.country, distanceBand: race.distanceBand, raceCode: race.raceCode, scopeKey: `distance_band:country_race_code:${race.country}:${race.raceCode}:${race.distanceBand}`, scopeType: "distance_band" },
    { scopeKey: `track_condition:all:${race.trackConditionGroup}`, scopeType: "track_condition", trackConditionGroup: race.trackConditionGroup },
    { raceCode: race.raceCode, scopeKey: `track_condition:race_code:${race.raceCode}:${race.trackConditionGroup}`, scopeType: "track_condition", trackConditionGroup: race.trackConditionGroup },
    { country: race.country, raceCode: race.raceCode, scopeKey: `track_condition:country_race_code:${race.country}:${race.raceCode}:${race.trackConditionGroup}`, scopeType: "track_condition", trackConditionGroup: race.trackConditionGroup },
  ].filter((scope) =>
    (scope.scopeType !== "distance_band" || Boolean(scope.distanceBand))
    && (scope.scopeType !== "track_condition" || Boolean(scope.trackConditionGroup)));
}

function getFavouritePriceBucketScopes(race, favourite) {
  if (!Number.isFinite(favourite.fixedWinPrice)) {
    return [];
  }

  const priceBucketStart = getPriceBucketStart(favourite.fixedWinPrice);
  const priceBucketEnd = priceBucketStart + 0.49;
  const priceBucketLabel = getPriceBucketLabel(priceBucketStart);

  return [
    {
      priceBucketEnd,
      priceBucketLabel,
      priceBucketStart,
      scopeKey: `price_bucket:all:${priceBucketStart.toFixed(2)}`,
      scopeType: "price_bucket",
    },
    {
      country: race.country,
      priceBucketEnd,
      priceBucketLabel,
      priceBucketStart,
      scopeKey: `price_bucket:country:${race.country}:${priceBucketStart.toFixed(2)}`,
      scopeType: "price_bucket",
    },
    {
      priceBucketEnd,
      priceBucketLabel,
      priceBucketStart,
      raceCode: race.raceCode,
      scopeKey: `price_bucket:race_code:${race.raceCode}:${priceBucketStart.toFixed(2)}`,
      scopeType: "price_bucket",
    },
    {
      country: race.country,
      priceBucketEnd,
      priceBucketLabel,
      priceBucketStart,
      raceCode: race.raceCode,
      scopeKey: `price_bucket:country_race_code:${race.country}:${race.raceCode}:${priceBucketStart.toFixed(2)}`,
      scopeType: "price_bucket",
    },
    {
      country: race.country,
      courseName: race.courseName,
      courseSlug: race.courseSlug,
      priceBucketEnd,
      priceBucketLabel,
      priceBucketStart,
      scopeKey: `price_bucket:course:${race.country}:${race.courseSlug}:${priceBucketStart.toFixed(2)}`,
      scopeType: "price_bucket",
    },
  ];
}

/**
 * Builds stored aggregate rows from the same race-level facts used by the app read model.
 */
function buildInsightAggregates(aggregateInput, dateFrom, dateTo) {
  const buckets = new Map();

  function getBucket(scope) {
    const bucket = buckets.get(scope.scopeKey) ?? createAggregateBucket(scope);
    buckets.set(scope.scopeKey, bucket);
    return bucket;
  }

  for (const race of aggregateInput) {
    for (const scope of getAggregateScopes(race)) {
      addRaceToAggregate(getBucket(scope), race);
    }

    for (const favourite of race.favourites) {
      for (const scope of getAggregateScopes(race)) {
        addFavouriteToAggregate(getBucket(scope), favourite);
      }

      for (const scope of getDistanceConditionScopes(race)) {
        const bucket = getBucket(scope);
        addRaceToAggregate(bucket, race);
        addFavouriteToAggregate(bucket, favourite);
      }

      for (const scope of getFavouritePriceBucketScopes(race, favourite)) {
        const bucket = getBucket(scope);
        addRaceToAggregate(bucket, race);
        addFavouriteToAggregate(bucket, favourite);
      }
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundMoney(bucket.totalStake);
    const totalReturn = roundMoney(bucket.totalReturn);
    const totalValueWithBonusCredit = roundMoney(bucket.totalValueWithBonusCredit);
    const netReturn = roundMoney(totalReturn - totalStake);

    return {
      average_return_per_dollar: totalStake ? roundRatio(totalReturn / totalStake) : 0,
      average_value_per_dollar_with_bonus_credit: totalStake
        ? roundRatio(totalValueWithBonusCredit / totalStake)
        : 0,
      bonus_credit_percentage: percentage(bucket.bonusCreditHits, bucket.favouriteSelections),
      country: bucket.country ?? null,
      course_name: bucket.courseName ?? null,
      course_slug: bucket.courseSlug ?? null,
      date_from: dateFrom,
      date_to: dateTo,
      distance_band: bucket.distanceBand ?? null,
      favourite_selections: bucket.favouriteSelections,
      missing_favourite_count: bucket.missingFavouriteCount,
      missing_price_count: bucket.missingPriceCount,
      missing_result_count: bucket.missingResultCount,
      net_return: netReturn,
      price_bucket_end: bucket.priceBucketEnd ?? null,
      price_bucket_label: bucket.priceBucketLabel ?? null,
      price_bucket_start: bucket.priceBucketStart ?? null,
      race_code: bucket.raceCode ?? null,
      race_count: bucket.raceKeys.size,
      roi_percentage: percentage(netReturn, totalStake),
      scope_key: bucket.scopeKey,
      scope_type: bucket.scopeType,
      second_percentage: percentage(bucket.seconds, bucket.favouriteSelections),
      seconds: bucket.seconds,
      starter_count: bucket.starterCount ?? null,
      third_percentage: percentage(bucket.thirds, bucket.favouriteSelections),
      thirds: bucket.thirds,
      track_condition_group: bucket.trackConditionGroup ?? null,
      total_bonus_credit: roundMoney(bucket.totalBonusCredit),
      total_return: totalReturn,
      total_stake: totalStake,
      total_value_with_bonus_credit: totalValueWithBonusCredit,
      win_percentage: percentage(bucket.wins, bucket.favouriteSelections),
      wins: bucket.wins,
    };
  });
}

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function roundRatio(value) {
  return Number(Number(value).toFixed(3));
}

/**
 * Minimal Supabase REST client for service-role upserts used by local backfills.
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

  async function upsert(table, rows, onConflict, prefer = "resolution=merge-duplicates,return=representation") {
    if (!rows.length) {
      return [];
    }

    const returned = [];

    for (const batch of chunk(rows, batchSize)) {
      const result = await request(table, {
        body: batch,
        method: "POST",
        prefer,
        search: {
          on_conflict: onConflict,
        },
      });

      if (Array.isArray(result)) {
        returned.push(...result);
      }
    }

    return returned;
  }

  async function insert(table, rows, prefer = "return=representation") {
    if (!rows.length) {
      return [];
    }

    const returned = [];

    for (const batch of chunk(rows, batchSize)) {
      const result = await request(table, {
        body: batch,
        method: "POST",
        prefer,
      });

      if (Array.isArray(result)) {
        returned.push(...result);
      }
    }

    return returned;
  }

  async function patch(table, id, body) {
    await request(table, {
      body,
      expectJson: false,
      method: "PATCH",
      prefer: "return=minimal",
      search: {
        id: `eq.${id}`,
      },
    });
  }

  async function deleteByIn(table, column, values) {
    const uniqueValues = [...new Set(values)].filter(Boolean);

    for (const batch of chunk(uniqueValues, batchSize)) {
      await request(table, {
        expectJson: false,
        method: "DELETE",
        prefer: "return=minimal",
        search: {
          [column]: `in.(${batch.join(",")})`,
        },
      });
    }
  }

  return {
    deleteByIn,
    insert,
    patch,
    upsert,
  };
}

function mapReturnedRows(rows, keyFn) {
  return new Map(rows.map((row) => [keyFn(row), row.id]));
}

function replaceKeysWithIds(rows, mappings) {
  return rows.map((row) => {
    const copy = { ...row };

    for (const [key, mapper] of Object.entries(mappings)) {
      const value = mapper(row);
      copy[key] = value === undefined ? null : value;
    }

    for (const key of Object.keys(copy)) {
      if (key.endsWith("_key")) {
        delete copy[key];
      }
    }

    return copy;
  });
}

/**
 * Writes normalized fixture rows and derived read models to Supabase.
 */
async function writeRowsToSupabase(rows, options) {
  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase URL or service-role key is not configured.");
    }

    return {
      ok: false,
      skipped: true,
      reason: "Supabase URL or service-role key is not configured.",
    };
  }

  const supabase = createSupabaseRestClient(config, options.batchSize);
  const [run] = await supabase.insert("ingestion_runs", [{
    function_name: "backfill-race-fixtures-to-supabase",
    started_at: new Date().toISOString(),
    summary: {
      fixtureFiles: options.fixtureFiles,
    },
    triggered_by: "manual",
  }]);

  try {
    const meetingRows = await supabase.upsert(
      "meetings",
      rows.meetings,
      "race_code,country,course_slug,meeting_date",
    );
    const meetingIds = mapReturnedRows(meetingRows, (row) =>
      getMeetingKey({
        country: row.country,
        courseSlug: row.course_slug,
        meetingDate: row.meeting_date,
        raceCode: row.race_code,
      }),
    );
    const meetingKeyById = new Map(Array.from(meetingIds.entries()).map(([key, id]) => [id, key]));

    const races = replaceKeysWithIds(rows.races, {
      meeting_id: (row) => meetingIds.get(row.meeting_key),
    });
    const raceRows = await supabase.upsert("races", races, "meeting_id,race_number");
    const raceIds = mapReturnedRows(raceRows, (row) => {
      const meetingKey = meetingKeyById.get(row.meeting_id);
      return getRaceKey({ meetingKey, raceNumber: row.race_number });
    });
    const raceKeyById = new Map(Array.from(raceIds.entries()).map(([key, id]) => [id, key]));

    const runners = replaceKeysWithIds(rows.runners, {
      race_id: (row) => raceIds.get(row.race_key),
    });
    const runnerRows = await supabase.upsert("runners", runners, "race_id,runner_number");
    const runnerIds = mapReturnedRows(runnerRows, (row) => {
      const raceKey = raceKeyById.get(row.race_id);
      return getRunnerKey({ raceKey, runnerNumber: row.runner_number });
    });
    const runnerKeyById = new Map(Array.from(runnerIds.entries()).map(([key, id]) => [id, key]));

    const oddsSnapshots = replaceKeysWithIds(rows.oddsSnapshots, {
      race_id: (row) => raceIds.get(row.race_key),
      runner_id: (row) => runnerIds.get(row.runner_key),
    });
    const oddsRows = await supabase.upsert(
      "odds_snapshots",
      oddsSnapshots,
      "race_id,runner_id,source,snapshot_at",
    );
    const oddsSnapshotIds = mapReturnedRows(oddsRows, (row) => {
      const raceKey = raceKeyById.get(row.race_id);
      const runnerKey = runnerKeyById.get(row.runner_id);
      return getOddsSnapshotKey({
        raceKey,
        runnerKey,
        snapshotAt: row.snapshot_at,
        source: row.source,
      });
    });

    const raceResults = replaceKeysWithIds(rows.raceResults, {
      race_id: (row) => raceIds.get(row.race_key),
      runner_id: (row) => runnerIds.get(row.runner_key),
    });
    await supabase.upsert("race_results", raceResults, "race_id,runner_id");

    const raceIdsForDividends = [...new Set(rows.raceDividends.map((row) => raceIds.get(row.race_key)).filter(Boolean))];
    await supabase.deleteByIn("race_dividends", "race_id", raceIdsForDividends);
    await supabase.insert("race_dividends", replaceKeysWithIds(rows.raceDividends, {
      race_id: (row) => raceIds.get(row.race_key),
    }), "return=minimal");

    const raceMarketStates = replaceKeysWithIds(rows.raceMarketStates, {
      favourite_runner_id: (row) => row.favourite_runner_key ? runnerIds.get(row.favourite_runner_key) : null,
      market_mover_runner_id: (row) => row.market_mover_runner_key ? runnerIds.get(row.market_mover_runner_key) : null,
      race_id: (row) => raceIds.get(row.race_key),
      selected_snapshot_id: (row) => row.selected_snapshot_key ? oddsSnapshotIds.get(row.selected_snapshot_key) : null,
    });
    await supabase.upsert("race_market_state", raceMarketStates, "race_id", "resolution=merge-duplicates,return=minimal");

    const raceDayEntries = replaceKeysWithIds(rows.raceDayEntries, {
      favourite_runner_id: (row) => row.favourite_runner_key ? runnerIds.get(row.favourite_runner_key) : null,
      market_mover_runner_id: (row) => row.market_mover_runner_key ? runnerIds.get(row.market_mover_runner_key) : null,
      meeting_id: (row) => meetingIds.get(row.meeting_key),
      race_id: (row) => raceIds.get(row.race_key),
      winner_runner_id: (row) => row.winner_runner_key ? runnerIds.get(row.winner_runner_key) : null,
    });
    await supabase.upsert("race_day_entries", raceDayEntries, "race_id", "resolution=merge-duplicates,return=minimal");

    await supabase.insert("source_fetches", rows.sourceFetches.map((row) => ({
      ...row,
      ingestion_run_id: run.id,
    })), "return=minimal");

    const [aggregateRun] = await supabase.insert("insight_aggregate_runs", [{
      finished_at: new Date().toISOString(),
      source: "fixture_backfill",
      source_max_date: options.dateTo,
      source_min_date: options.dateFrom,
      started_at: new Date().toISOString(),
      success: true,
      summary: {
        aggregateRows: rows.insightAggregates.length,
        fixtureFiles: options.fixtureFiles,
      },
      triggered_by: "manual",
    }]);
    await supabase.upsert("insight_aggregates", rows.insightAggregates.map((row) => ({
      ...row,
      aggregate_run_id: aggregateRun.id,
    })), "scope_key", "resolution=merge-duplicates,return=minimal");

    const summary = summarizeRows(rows);
    await supabase.patch("ingestion_runs", run.id, {
      finished_at: new Date().toISOString(),
      success: true,
      summary,
    });

    return {
      ok: true,
      runId: run.id,
      skipped: false,
      summary,
    };
  } catch (error) {
    await supabase.patch("ingestion_runs", run.id, {
      error_message: error.message,
      finished_at: new Date().toISOString(),
      success: false,
    });
    throw error;
  }
}

/**
 * Refreshes only the stored app-facing insight aggregates from fixture-derived rows.
 */
async function writeInsightAggregatesToSupabase(rows, options) {
  const config = getSupabaseWriteConfig();

  if (!config) {
    if (options.requireSupabase) {
      throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
    }

    return {
      ok: false,
      skipped: true,
      reason: "Supabase write config missing.",
    };
  }

  const supabase = createSupabaseRestClient(config, options.batchSize);
  const [aggregateRun] = await supabase.insert("insight_aggregate_runs", [{
    finished_at: new Date().toISOString(),
    source: "fixture_backfill",
    source_max_date: options.dateTo,
    source_min_date: options.dateFrom,
    started_at: new Date().toISOString(),
    success: true,
    summary: {
      aggregateRows: rows.insightAggregates.length,
      fixtureFiles: options.fixtureFiles,
      mode: "insights_only",
    },
    triggered_by: "manual",
  }]);

  await supabase.upsert("insight_aggregates", rows.insightAggregates.map((row) => ({
    ...row,
    aggregate_run_id: aggregateRun.id,
  })), "scope_key", "resolution=merge-duplicates,return=minimal");

  return {
    ok: true,
    runId: aggregateRun.id,
    skipped: false,
    summary: {
      insightAggregates: rows.insightAggregates.length,
    },
  };
}

function summarizeRows(rows) {
  return {
    insightAggregates: rows.insightAggregates.length,
    meetings: rows.meetings.length,
    oddsSnapshots: rows.oddsSnapshots.length,
    raceDayEntries: rows.raceDayEntries.length,
    raceDividends: rows.raceDividends.length,
    raceMarketStates: rows.raceMarketStates.length,
    raceResults: rows.raceResults.length,
    races: rows.races.length,
    runners: rows.runners.length,
    sourceFetches: rows.sourceFetches.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const fixtures = await loadFixtures(options);
  const rows = buildBackfillRows(fixtures);
  const dates = fixtures.map(({ fixture }) => fixture.testDate).sort();
  rows.insightAggregates = buildInsightAggregates(rows.aggregateInput, dates[0], dates.at(-1));

  const summary = summarizeRows(rows);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dateRange: {
        from: dates[0],
        to: dates.at(-1),
      },
      coverageMode: options.coverageMode,
      dryRun: true,
      fixtureFiles: fixtures.map(({ file }) => file),
      summary,
    }, null, 2));
    return;
  }

  const writeOptions = {
    batchSize: options.batchSize,
    dateFrom: dates[0],
    dateTo: dates.at(-1),
    fixtureFiles: fixtures.map(({ file }) => file),
    requireSupabase: options.requireSupabase,
  };
  const result = options.insightsOnly
    ? await writeInsightAggregatesToSupabase(rows, writeOptions)
    : await writeRowsToSupabase(rows, writeOptions);

  console.log(JSON.stringify({
    dateRange: {
      from: dates[0],
      to: dates.at(-1),
    },
    coverageMode: options.coverageMode,
    mode: options.insightsOnly ? "insights_only" : "full_backfill",
    supabaseWrite: result,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
