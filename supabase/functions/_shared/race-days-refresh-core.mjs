const BETCHA_GRAPHQL_ENDPOINT = "https://api.betcha.co.nz/graphql";
const FIXED_WIN_PRODUCT_TYPE_ID = "940b8704-e497-4a76-b390-00918ff7d282";
const SOURCE_NAME = "betcha_graphql";
const SOURCE_TIME_ZONE = "Pacific/Auckland";
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_COLLECTION_START = "2025-12-15";
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LOCK_TTL_MINUTES = 15;
const RACE_NOT_FOUND_GRACE_HOURS = 24;
const COVERAGE_MODE_ALL_DOMESTIC = "all_domestic";
const COVERAGE_MODE_PILOT = "pilot";
const SUPPORTED_DOMESTIC_COUNTRIES = new Set(["AUS", "NZ"]);
const SUPPORTED_RACING_CATEGORIES = new Set(["HORSE", "HARNESS", "GREYHOUND"]);
const DEFAULT_DOMESTIC_COUNTRIES = ["NZ", "AUS"];
const DEFAULT_RACING_CATEGORIES = ["HORSE", "HARNESS", "GREYHOUND"];

/**
 * Creates a configured Australian comparison track entry for source matching.
 */
function australianComparisonTrack(canonicalName, aliases = [canonicalName]) {
  return {
    aliases,
    canonicalName,
    country: "AUS",
    includeAsComparison: true,
  };
}

const PILOT_TRACKS = [
  { aliases: ["Ellerslie"], canonicalName: "Ellerslie", country: "NZ", includeAsComparison: false },
  { aliases: ["New Plymouth", "New Plymouth Raceway", "Pukekura Raceway"], canonicalName: "New Plymouth", country: "NZ", includeAsComparison: false },
  { aliases: ["Te Rapa"], canonicalName: "Te Rapa", country: "NZ", includeAsComparison: false },
  { aliases: ["Addington", "Addington Raceway"], canonicalName: "Addington", country: "NZ", includeAsComparison: false },
  { aliases: ["Alexandra Park", "Auckland"], canonicalName: "Alexandra Park", country: "NZ", includeAsComparison: false },
  australianComparisonTrack("Ascot"),
  australianComparisonTrack("Sunshine Coast"),
  australianComparisonTrack("Ipswich"),
  australianComparisonTrack("Eagle Farm"),
  australianComparisonTrack("Pakenham"),
  australianComparisonTrack("Doomben"),
  australianComparisonTrack("Morphettville"),
  australianComparisonTrack("Newcastle"),
  australianComparisonTrack("Gold Coast"),
  australianComparisonTrack("Toowoomba"),
  australianComparisonTrack("Townsville"),
  australianComparisonTrack("Cranbourne"),
  australianComparisonTrack("Albion Park"),
  australianComparisonTrack("Redcliffe"),
  australianComparisonTrack("Globe Derby"),
  australianComparisonTrack("Gloucester Park"),
  australianComparisonTrack("Menangle"),
  australianComparisonTrack("Melton"),
  australianComparisonTrack("Bathurst"),
  australianComparisonTrack("Pinjarra"),
  australianComparisonTrack("Penrith"),
  australianComparisonTrack("Shepparton"),
  australianComparisonTrack("Mildura"),
  australianComparisonTrack("Q1 Lakeside"),
  australianComparisonTrack("Mandurah"),
  australianComparisonTrack("Angle Park"),
  australianComparisonTrack("Richmond"),
  australianComparisonTrack("Healesville"),
  australianComparisonTrack("Warragul"),
  australianComparisonTrack("The Gardens"),
  australianComparisonTrack("Ballarat"),
  australianComparisonTrack("Geelong"),
  australianComparisonTrack("Taree"),
  australianComparisonTrack("Q Straight"),
  australianComparisonTrack("Q2 Parklands"),
  australianComparisonTrack("Nowra"),
  australianComparisonTrack("Warrnambool"),
  { aliases: ["Wingatui"], canonicalName: "Wingatui", country: "NZ", includeAsComparison: false },
  { aliases: ["Whanganui", "Wanganui", "Hatrick"], canonicalName: "Whanganui", country: "NZ", includeAsComparison: false },
  { aliases: ["Cambridge", "Cambridge Raceway", "Cambridge (G)"], canonicalName: "Cambridge", country: "NZ", includeAsComparison: false },
];

const DISCOVERY_QUERY = `
  query RacingHomeMeetingsDesktopScreen(
    $date: Date!
    $categories: [RacingCategory!]
    $regions: [Region!]
  ) {
    racingDay(date: $date, categories: $categories, regions: $regions) {
      meetings: nodes {
        id
        name
        category
        meetingCode
        venue {
          name
          country
          state
        }
        races: racesConnection {
          nodes {
            id
            name
            number
            advertisedStart
            finalFieldMarket {
              id
              status
            }
            resultsSummary
          }
        }
      }
    }
  }
`;

const RACE_CARD_QUERY = `
  query RaceCardLite($id: ID!) {
    raceCard: node(id: $id) {
      __typename
      ... on RacingRaceCard {
        id
        name
        number
        status
        advertisedStart
        distance
        trackCondition
        finalField(baseAvailability: true) {
          runnerRows(baseAvailability: true) {
            id
            number
            name
            scratchedTimestamp
            isMarketMover
            prices(baseAvailability: true) {
              id
              odds {
                decimal
                numerator
                denominator
              }
            }
          }
        }
        results {
          __typename
          ... on RacingResults {
            title
            runnerRows {
              id
              position
              winPlaceDividends {
                label
                value
              }
              toteDividends(includePlaceDividendsForFirstPosition: true) {
                label
                value
              }
            }
          }
          ... on RacingExoticResults {
            title
            results {
              name
              entrantLabelSummary
              toteOdds
            }
          }
          ... on RacingMarginResults {
            title
            runnerRows {
              id
              margin
            }
          }
        }
      }
    }
  }
`;

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

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

// Normalizes caller-provided country slices before source fetches are narrowed.
function normalizeCountryFilter(countries = DEFAULT_DOMESTIC_COUNTRIES) {
  const values = Array.isArray(countries) && countries.length ? countries : DEFAULT_DOMESTIC_COUNTRIES;
  const normalized = values.map(normalizeCountry);

  for (const country of normalized) {
    if (!SUPPORTED_DOMESTIC_COUNTRIES.has(country)) {
      throw new Error(`Unsupported country filter: ${country}.`);
    }
  }

  return [...new Set(normalized)];
}

// Normalizes source racing-code slices so large refresh jobs can be split safely.
function normalizeCategoryFilter(categories = DEFAULT_RACING_CATEGORIES) {
  const values = Array.isArray(categories) && categories.length ? categories : DEFAULT_RACING_CATEGORIES;
  const normalized = values.map((category) => String(category).toUpperCase());

  for (const category of normalized) {
    if (!SUPPORTED_RACING_CATEGORIES.has(category)) {
      throw new Error(`Unsupported racing category filter: ${category}.`);
    }
  }

  return [...new Set(normalized)];
}

function listDates(from, to) {
  const dates = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (start > end) {
    throw new Error("from must be before or equal to to.");
  }

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function getTodayInSourceTimeZone() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getDefaultWindow(lookbackDays) {
  const yesterday = addDays(getTodayInSourceTimeZone(), -1);

  return {
    from: addDays(yesterday, -(lookbackDays - 1)),
    to: yesterday,
  };
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

function getMeetingCountry(meeting) {
  return normalizeCountry(meeting.venue?.country);
}

function getMeetingTrackName(meeting) {
  return meeting.venue?.name ?? meeting.name ?? "Unknown";
}

function isSupportedDomesticMeeting(meeting) {
  return SUPPORTED_DOMESTIC_COUNTRIES.has(getMeetingCountry(meeting))
    && SUPPORTED_RACING_CATEGORIES.has(meeting.category);
}

/**
 * Builds a track descriptor directly from source meeting metadata for broad AU/NZ collection.
 */
function createDomesticTrackFromMeeting(meeting) {
  const canonicalName = getMeetingTrackName(meeting);

  return {
    aliases: [canonicalName, meeting.name, meeting.meetingCode].filter(Boolean),
    canonicalName,
    country: getMeetingCountry(meeting),
    includeAsComparison: getMeetingCountry(meeting) === "AUS",
  };
}

function toRaceCardId(racingRaceId) {
  return String(racingRaceId).replace(/^RacingRace:/, "RacingRaceCard:");
}

function isVacantRunner(runner) {
  return normalizeName(runner?.name) === "vacant box";
}

function getActiveRunnerRows(raceCard) {
  return (raceCard?.finalField?.runnerRows ?? []).filter((runner) =>
    !runner.scratchedTimestamp && !isVacantRunner(runner),
  );
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

function getWinDividend(resultRow) {
  return getNamedDividend(resultRow?.winPlaceDividends, "Win");
}

function getBonusBetCredit(resultPosition, starterCount) {
  if (resultPosition === 2 && starterCount >= 5) {
    return 1;
  }

  if (resultPosition === 3 && starterCount >= 8) {
    return 1;
  }

  return 0;
}

function deriveRaceInsights(raceCard) {
  const runnerRows = raceCard.finalField?.runnerRows ?? [];
  const activeRunners = runnerRows.filter((runner) => !runner.scratchedTimestamp && !isVacantRunner(runner));
  const resultRows = getResultRows(raceCard);
  const resultByEntrantId = new Map(resultRows.map((row) => [row.id, row]));
  const runnersWithFixedWin = activeRunners
    .map((runner) => ({
      fixedWinPrice: getFixedWinPrice(runner),
      id: runner.id,
      isMarketMover: Boolean(runner.isMarketMover),
      name: runner.name,
      number: runner.number,
      resultPosition: resultByEntrantId.get(runner.id)?.position ?? null,
      winDividend: getWinDividend(resultByEntrantId.get(runner.id)),
    }))
    .filter((runner) => runner.fixedWinPrice !== null);

  const shortestFixedWinPrice = runnersWithFixedWin.reduce((minimum, runner) => {
    if (minimum === null || runner.fixedWinPrice < minimum) {
      return runner.fixedWinPrice;
    }

    return minimum;
  }, null);
  const favourites = shortestFixedWinPrice === null
    ? []
    : runnersWithFixedWin.filter((runner) => runner.fixedWinPrice === shortestFixedWinPrice);
  const marketMovers = runnersWithFixedWin.filter((runner) => runner.isMarketMover);
  const winners = resultRows
    .filter((row) => row.position === 1)
    .map((row) => {
      const runner = runnerRows.find((candidate) => candidate.id === row.id);

      return {
        id: row.id,
        name: runner?.name ?? null,
        number: runner?.number ?? null,
        winDividend: getWinDividend(row),
      };
    });

  return {
    activeStarterCount: activeRunners.length,
    favourites: favourites.map((runner) => {
      const oneDollarWinReturn = runner.resultPosition === 1 ? runner.fixedWinPrice : 0;
      const oneDollarBonusBetCredit = getBonusBetCredit(runner.resultPosition, activeRunners.length);

      return {
        ...runner,
        oneDollarBonusBetCredit,
        oneDollarTotalValueWithBonusCredit: oneDollarWinReturn + oneDollarBonusBetCredit,
        oneDollarWinReturn,
      };
    }),
    fixedWinFavouritePrice: shortestFixedWinPrice,
    hasResultRows: resultRows.length > 0,
    marketMovers,
    scratchedCount: runnerRows.length - activeRunners.length,
    winners,
  };
}

function findPilotTrack(meeting, pilotTracks = PILOT_TRACKS) {
  const meetingNames = [meeting.name, meeting.venue?.name].map(normalizeName);

  return pilotTracks.find((track) => {
    if (track.country !== getMeetingCountry(meeting)) {
      return false;
    }

    return track.aliases.some((alias) => meetingNames.includes(normalizeName(alias)));
  });
}

function matchMeetingToCoverage(meeting, coverageMode) {
  if (coverageMode === COVERAGE_MODE_ALL_DOMESTIC) {
    return isSupportedDomesticMeeting(meeting) ? createDomesticTrackFromMeeting(meeting) : null;
  }

  return findPilotTrack(meeting);
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

function getSourceStatus(race) {
  if (!race.raceCard) {
    return "missing_race_card";
  }

  if (!race.derived?.hasResultRows) {
    return "missing_result";
  }

  return "settled";
}

async function graphql(operationName, query, variables) {
  const response = await fetch(BETCHA_GRAPHQL_ENDPOINT, {
    body: JSON.stringify({ operationName, query, variables }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(`${operationName} returned GraphQL errors: ${payload.errors.map((error) => error.message).join("; ")}`);
  }

  return payload;
}

async function fetchDate(date, { categories = DEFAULT_RACING_CATEGORIES, countries = DEFAULT_DOMESTIC_COUNTRIES, coverageMode = COVERAGE_MODE_ALL_DOMESTIC } = {}) {
  const categoryFilter = normalizeCategoryFilter(categories);
  const countryFilter = normalizeCountryFilter(countries);
  const discoveryResponse = await graphql("RacingHomeMeetingsDesktopScreen", DISCOVERY_QUERY, {
    categories: categoryFilter,
    date,
    regions: ["DOMESTIC"],
  });
  const allMeetings = discoveryResponse.data?.racingDay?.meetings ?? [];
  const matchedMeetingEntries = allMeetings
    .map((meeting) => ({ meeting, pilotTrack: matchMeetingToCoverage(meeting, coverageMode) }))
    .filter((entry) => entry.pilotTrack && countryFilter.includes(getMeetingCountry(entry.meeting)));
  const meetings = [];
  const errors = [];

  for (const entry of matchedMeetingEntries) {
    const races = [];

    for (const race of entry.meeting.races?.nodes ?? []) {
      const raceCardId = toRaceCardId(race.id);

      try {
        const raceCardResponse = await graphql("RaceCardLite", RACE_CARD_QUERY, { id: raceCardId });
        const raceCard = raceCardResponse.data?.raceCard;
        races.push({
          derived: raceCard ? deriveRaceInsights(raceCard) : null,
          raceCard,
          raceCardId,
          sourceRace: race,
        });
      } catch (error) {
        errors.push({
          date,
          message: error instanceof Error ? error.message : "Unknown race-card fetch error.",
          raceCardId,
        });
        races.push({
          derived: null,
          raceCard: null,
          raceCardId,
          sourceRace: race,
        });
      }
    }

    meetings.push({
      canonicalTrack: entry.pilotTrack.canonicalName,
      includeAsComparison: entry.pilotTrack.includeAsComparison,
      races,
      source: entry.meeting,
    });
  }

  return {
    date,
    errors,
    fixture: {
      counts: {
        meetingsMatched: meetings.length,
        pilotMeetingsMatched: meetings.length,
        pilotRacesMatched: meetings.reduce((total, meeting) => total + meeting.races.length, 0),
        racesMatched: meetings.reduce((total, meeting) => total + meeting.races.length, 0),
        sourceMeetingsDiscovered: allMeetings.length,
      },
      filters: {
        categories: categoryFilter,
        countries: countryFilter,
        coverageMode,
        regions: ["DOMESTIC"],
      },
      generatedAt: new Date().toISOString(),
      meetings,
      source: {
        discoveryOperation: "RacingHomeMeetingsDesktopScreen",
        endpoint: BETCHA_GRAPHQL_ENDPOINT,
        name: "betcha_graphql",
        raceCardOperation: "RaceCardLite",
      },
      testDate: date,
    },
  };
}

export async function fetchRaceDayFixtures({ categories = DEFAULT_RACING_CATEGORIES, countries = DEFAULT_DOMESTIC_COUNTRIES, coverageMode = COVERAGE_MODE_ALL_DOMESTIC, from, to }) {
  const fixtures = [];
  const errors = [];

  for (const date of listDates(from, to)) {
    const result = await fetchDate(date, { categories, countries, coverageMode });
    fixtures.push(result.fixture);
    errors.push(...result.errors);
  }

  return { errors, fixtures };
}

export function buildRaceRowsFromFixtures(fixtures) {
  const meetings = [];
  const races = [];
  const runners = [];
  const oddsSnapshots = [];
  const raceResults = [];
  const raceDividends = [];
  const raceMarketStates = [];
  const raceDayEntries = [];
  const sourceFetches = [];

  for (const fixture of fixtures) {
    sourceFetches.push({
      error_message: null,
      fetched_at: fixture.generatedAt ?? new Date().toISOString(),
      method: "EDGE_FUNCTION",
      parser_version: "refresh-race-days-and-insights/v1",
      raw: {
        counts: fixture.counts,
        generatedAt: fixture.generatedAt,
        source: fixture.source,
        testDate: fixture.testDate,
      },
      raw_storage_path: null,
      request_key: `edge-refresh-${fixture.testDate}`,
      source: SOURCE_NAME,
      status_code: 200,
      success: true,
      url: BETCHA_GRAPHQL_ENDPOINT,
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
          raw: { raceCardId: race.raceCardId, sourceRace },
          scratched_count: race.derived?.scratchedCount ?? null,
          source_form_id: null,
          source_race_card_id: race.raceCardId ?? raceCard.id ?? null,
          source_race_id: sourceRace.id ?? null,
          starter_count: race.derived?.activeStarterCount ?? activeRunners.length,
          status: raceCard.status ?? sourceRace.finalFieldMarket?.status ?? null,
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
            raw: { prices: runner.prices, scratchedTimestamp: runner.scratchedTimestamp ?? null },
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
            raw: { fixedWinProductTypeId: FIXED_WIN_PRODUCT_TYPE_ID, sourceRunnerId: runner.id },
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
      }
    }
  }

  return {
    meetings: dedupeRows(meetings, (row) => getMeetingKey({
      country: row.country,
      courseSlug: row.course_slug,
      meetingDate: row.meeting_date,
      raceCode: row.race_code,
    })),
    oddsSnapshots: dedupeRows(oddsSnapshots, (row) => getOddsSnapshotKey({
      raceKey: row.race_key,
      runnerKey: row.runner_key,
      snapshotAt: row.snapshot_at,
      source: row.source,
    })),
    raceDayEntries,
    raceDividends,
    raceMarketStates: dedupeRows(raceMarketStates, (row) => row.race_key),
    raceResults: dedupeRows(raceResults, (row) => `${row.race_key}|${row.runner_key}`),
    races: dedupeRows(races, (row) => getRaceKey({ meetingKey: row.meeting_key, raceNumber: row.race_number })),
    runners: dedupeRows(runners, (row) => getRunnerKey({ raceKey: row.race_key, runnerNumber: row.runner_number })),
    sourceFetches,
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

export function createSupabaseRestClient(config, batchSize = DEFAULT_BATCH_SIZE) {
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
        ...(options.headers ?? {}),
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
        search: { on_conflict: onConflict },
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
      const result = await request(table, { body: batch, method: "POST", prefer });

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
      search: { id: `eq.${id}` },
    });
  }

  async function deleteByIn(table, column, values) {
    const uniqueValues = [...new Set(values)].filter(Boolean);

    for (const batch of chunk(uniqueValues, batchSize)) {
      await request(table, {
        expectJson: false,
        method: "DELETE",
        prefer: "return=minimal",
        search: { [column]: `in.(${batch.join(",")})` },
      });
    }
  }

  async function selectAll(table, search, select = "*") {
    const rows = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const page = await request(table, {
        headers: { range: `${offset}-${offset + pageSize - 1}` },
        search: {
          select,
          ...search,
        },
      });

      rows.push(...(page ?? []));

      if (!Array.isArray(page) || page.length < pageSize) {
        return rows;
      }

      offset += pageSize;
    }
  }

  return { deleteByIn, insert, patch, request, selectAll, upsert };
}

export async function writeRaceRowsToSupabase(rows, { batchSize = DEFAULT_BATCH_SIZE, config, from, to, triggeredBy = "edge" }) {
  const supabase = createSupabaseRestClient(config, batchSize);
  const [run] = await supabase.insert("ingestion_runs", [{
    function_name: "refresh-race-days-and-insights",
    started_at: new Date().toISOString(),
    summary: { sourceDateFrom: from, sourceDateTo: to },
    triggered_by: triggeredBy,
  }]);

  try {
    const meetingRows = await supabase.upsert("meetings", rows.meetings, "race_code,country,course_slug,meeting_date");
    const meetingIds = mapReturnedRows(meetingRows, (row) => getMeetingKey({
      country: row.country,
      courseSlug: row.course_slug,
      meetingDate: row.meeting_date,
      raceCode: row.race_code,
    }));
    const meetingKeyById = new Map(Array.from(meetingIds.entries()).map(([key, id]) => [id, key]));

    const raceRows = await supabase.upsert("races", replaceKeysWithIds(rows.races, {
      meeting_id: (row) => meetingIds.get(row.meeting_key),
    }), "meeting_id,race_number");
    const raceIds = mapReturnedRows(raceRows, (row) => {
      const meetingKey = meetingKeyById.get(row.meeting_id);
      return getRaceKey({ meetingKey, raceNumber: row.race_number });
    });
    const raceKeyById = new Map(Array.from(raceIds.entries()).map(([key, id]) => [id, key]));

    const runnerRows = await supabase.upsert("runners", replaceKeysWithIds(rows.runners, {
      race_id: (row) => raceIds.get(row.race_key),
    }), "race_id,runner_number");
    const runnerIds = mapReturnedRows(runnerRows, (row) => {
      const raceKey = raceKeyById.get(row.race_id);
      return getRunnerKey({ raceKey, runnerNumber: row.runner_number });
    });
    const runnerKeyById = new Map(Array.from(runnerIds.entries()).map(([key, id]) => [id, key]));

    const oddsRows = await supabase.upsert("odds_snapshots", replaceKeysWithIds(rows.oddsSnapshots, {
      race_id: (row) => raceIds.get(row.race_key),
      runner_id: (row) => runnerIds.get(row.runner_key),
    }), "race_id,runner_id,source,snapshot_at");
    const oddsSnapshotIds = mapReturnedRows(oddsRows, (row) => {
      const raceKey = raceKeyById.get(row.race_id);
      const runnerKey = runnerKeyById.get(row.runner_id);
      return getOddsSnapshotKey({ raceKey, runnerKey, snapshotAt: row.snapshot_at, source: row.source });
    });

    await supabase.upsert("race_results", replaceKeysWithIds(rows.raceResults, {
      race_id: (row) => raceIds.get(row.race_key),
      runner_id: (row) => runnerIds.get(row.runner_key),
    }), "race_id,runner_id");

    const raceIdsForDividends = [...new Set(rows.raceDividends.map((row) => raceIds.get(row.race_key)).filter(Boolean))];
    await supabase.deleteByIn("race_dividends", "race_id", raceIdsForDividends);
    await supabase.insert("race_dividends", replaceKeysWithIds(rows.raceDividends, {
      race_id: (row) => raceIds.get(row.race_key),
    }), "return=minimal");

    await supabase.upsert("race_market_state", replaceKeysWithIds(rows.raceMarketStates, {
      favourite_runner_id: (row) => row.favourite_runner_key ? runnerIds.get(row.favourite_runner_key) : null,
      market_mover_runner_id: (row) => row.market_mover_runner_key ? runnerIds.get(row.market_mover_runner_key) : null,
      race_id: (row) => raceIds.get(row.race_key),
      selected_snapshot_id: (row) => row.selected_snapshot_key ? oddsSnapshotIds.get(row.selected_snapshot_key) : null,
    }), "race_id", "resolution=merge-duplicates,return=minimal");

    await supabase.upsert("race_day_entries", replaceKeysWithIds(rows.raceDayEntries, {
      favourite_runner_id: (row) => row.favourite_runner_key ? runnerIds.get(row.favourite_runner_key) : null,
      market_mover_runner_id: (row) => row.market_mover_runner_key ? runnerIds.get(row.market_mover_runner_key) : null,
      meeting_id: (row) => meetingIds.get(row.meeting_key),
      race_id: (row) => raceIds.get(row.race_key),
      winner_runner_id: (row) => row.winner_runner_key ? runnerIds.get(row.winner_runner_key) : null,
    }), "race_id", "resolution=merge-duplicates,return=minimal");

    await supabase.insert("source_fetches", rows.sourceFetches.map((row) => ({
      ...row,
      ingestion_run_id: run.id,
    })), "return=minimal");

    const summary = summarizeRows(rows);
    await supabase.patch("ingestion_runs", run.id, {
      finished_at: new Date().toISOString(),
      success: true,
      summary,
    });

    return { ok: true, runId: run.id, summary };
  } catch (error) {
    await supabase.patch("ingestion_runs", run.id, {
      error_message: error instanceof Error ? error.message : "Unknown refresh write failure.",
      finished_at: new Date().toISOString(),
      success: false,
    });
    throw error;
  }
}

function summarizeRows(rows) {
  return {
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

function getAggregateScopes(race) {
  return [
    { scopeKey: "overall", scopeType: "overall" },
    { country: race.country, scopeKey: `country:${race.country}`, scopeType: "country" },
    { raceCode: race.raceCode, scopeKey: `race_code:${race.raceCode}`, scopeType: "race_code" },
    { country: race.country, raceCode: race.raceCode, scopeKey: `country_race_code:${race.country}:${race.raceCode}`, scopeType: "country_race_code" },
    { country: race.country, courseName: race.courseName, courseSlug: race.courseSlug, scopeKey: `course:${race.country}:${race.courseSlug}`, scopeType: "course" },
    { country: race.country, courseName: race.courseName, courseSlug: race.courseSlug, raceCode: race.raceCode, scopeKey: `course_race_code:${race.country}:${race.courseSlug}:${race.raceCode}`, scopeType: "course_race_code" },
    { starterCount: race.starterCount, scopeKey: `starter_count:all:${race.starterCount}`, scopeType: "starter_count" },
    { country: race.country, starterCount: race.starterCount, scopeKey: `starter_count:country:${race.country}:${race.starterCount}`, scopeType: "starter_count" },
    { raceCode: race.raceCode, starterCount: race.starterCount, scopeKey: `starter_count:race_code:${race.raceCode}:${race.starterCount}`, scopeType: "starter_count" },
    { country: race.country, raceCode: race.raceCode, starterCount: race.starterCount, scopeKey: `starter_count:country_race_code:${race.country}:${race.raceCode}:${race.starterCount}`, scopeType: "starter_count" },
    { country: race.country, courseName: race.courseName, courseSlug: race.courseSlug, starterCount: race.starterCount, scopeKey: `starter_count:course:${race.country}:${race.courseSlug}:${race.starterCount}`, scopeType: "starter_count" },
  ].filter((scope) => scope.scopeType !== "starter_count" || (scope.starterCount !== null && scope.starterCount !== undefined));
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

function getFavouritePriceBucketScopes(race, favouritePrice) {
  if (!Number.isFinite(favouritePrice)) {
    return [];
  }

  const priceBucketStart = getPriceBucketStart(favouritePrice);
  const priceBucketEnd = priceBucketStart + 0.49;
  const priceBucketLabel = getPriceBucketLabel(priceBucketStart);

  return [
    { priceBucketEnd, priceBucketLabel, priceBucketStart, scopeKey: `price_bucket:all:${priceBucketStart.toFixed(2)}`, scopeType: "price_bucket" },
    { country: race.country, priceBucketEnd, priceBucketLabel, priceBucketStart, scopeKey: `price_bucket:country:${race.country}:${priceBucketStart.toFixed(2)}`, scopeType: "price_bucket" },
    { priceBucketEnd, priceBucketLabel, priceBucketStart, raceCode: race.raceCode, scopeKey: `price_bucket:race_code:${race.raceCode}:${priceBucketStart.toFixed(2)}`, scopeType: "price_bucket" },
    { country: race.country, priceBucketEnd, priceBucketLabel, priceBucketStart, raceCode: race.raceCode, scopeKey: `price_bucket:country_race_code:${race.country}:${race.raceCode}:${priceBucketStart.toFixed(2)}`, scopeType: "price_bucket" },
    { country: race.country, courseName: race.courseName, courseSlug: race.courseSlug, priceBucketEnd, priceBucketLabel, priceBucketStart, scopeKey: `price_bucket:course:${race.country}:${race.courseSlug}:${priceBucketStart.toFixed(2)}`, scopeType: "price_bucket" },
  ];
}

function addRaceToAggregate(bucket, race) {
  bucket.raceKeys.add(race.raceKey);
  bucket.missingFavouriteCount += race.missingFavourite ? 1 : 0;
  bucket.missingPriceCount += race.missingPrice ? 1 : 0;
  bucket.missingResultCount += race.missingResult ? 1 : 0;
}

function addFavouriteToAggregate(bucket, race) {
  if (
    race.favouriteResultPosition === null
    || race.favouriteResultPosition === undefined
    || !Number.isFinite(race.favouritePrice)
  ) {
    return;
  }

  bucket.favouriteSelections += 1;
  bucket.totalStake += 1;
  bucket.totalReturn += race.favouriteWinReturn ?? 0;
  bucket.totalBonusCredit += race.favouriteBonusCredit ?? 0;
  bucket.totalValueWithBonusCredit += race.favouriteTotalValueWithBonusCredit ?? 0;
  bucket.wins += race.favouriteResultPosition === 1 ? 1 : 0;
  bucket.seconds += race.favouriteResultPosition === 2 ? 1 : 0;
  bucket.thirds += race.favouriteResultPosition === 3 ? 1 : 0;
  bucket.bonusCreditHits += (race.favouriteBonusCredit ?? 0) > 0 ? 1 : 0;
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

function quotePostgrestInValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function buildInsightAggregatesFromRaceDayEntries(rows, dateFrom, dateTo) {
  const buckets = new Map();

  function getBucket(scope) {
    const bucket = buckets.get(scope.scopeKey) ?? createAggregateBucket(scope);
    buckets.set(scope.scopeKey, bucket);
    return bucket;
  }

  for (const row of rows) {
    const race = {
      country: row.country,
      courseName: row.course_name,
      courseSlug: row.course_slug,
      distanceBand: getDistanceBand(row.distance_m),
      favouriteBonusCredit: Number(row.favourite_bonus_credit ?? 0),
      favouritePrice: row.favourite_price === null ? null : Number(row.favourite_price),
      favouriteResultPosition: row.favourite_result_position,
      favouriteTotalValueWithBonusCredit: Number(row.favourite_total_value_with_bonus_credit ?? 0),
      favouriteWinReturn: Number(row.favourite_win_return ?? 0),
      missingFavourite: Boolean(row.missing_favourite),
      missingPrice: Boolean(row.missing_price),
      missingResult: Boolean(row.missing_result),
      raceCode: row.race_code,
      raceKey: row.race_id,
      starterCount: row.starter_count,
      trackConditionGroup: getTrackConditionGroup(row.track_condition),
    };

    for (const scope of getAggregateScopes(race)) {
      addRaceToAggregate(getBucket(scope), race);
    }

    for (const scope of getAggregateScopes(race)) {
      addFavouriteToAggregate(getBucket(scope), race);
    }

    for (const scope of getDistanceConditionScopes(race)) {
      const bucket = getBucket(scope);
      addRaceToAggregate(bucket, race);
      addFavouriteToAggregate(bucket, race);
    }

    for (const scope of getFavouritePriceBucketScopes(race, race.favouritePrice)) {
      const bucket = getBucket(scope);
      addRaceToAggregate(bucket, race);
      addFavouriteToAggregate(bucket, race);
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundMoney(bucket.totalStake);
    const totalReturn = roundMoney(bucket.totalReturn);
    const totalValueWithBonusCredit = roundMoney(bucket.totalValueWithBonusCredit);
    const netReturn = roundMoney(totalReturn - totalStake);

    return {
      average_return_per_dollar: totalStake ? roundRatio(totalReturn / totalStake) : 0,
      average_value_per_dollar_with_bonus_credit: totalStake ? roundRatio(totalValueWithBonusCredit / totalStake) : 0,
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

export async function rebuildInsightAggregatesFromSupabase({ batchSize = DEFAULT_BATCH_SIZE, collectionStart = DEFAULT_COLLECTION_START, config, sourceMaxDate, triggeredBy = "edge" }) {
  const supabase = createSupabaseRestClient(config, batchSize);
  const rows = await supabase.selectAll(
    "race_day_entries",
    {
      meeting_date: `gte.${collectionStart}`,
      order: "meeting_date.asc,advertised_start.asc",
    },
    [
      "race_id",
      "meeting_date",
      "country",
      "race_code",
      "course_name",
      "course_slug",
      "distance_m",
      "starter_count",
      "track_condition",
      "favourite_price",
      "favourite_result_position",
      "favourite_win_return",
      "favourite_bonus_credit",
      "favourite_total_value_with_bonus_credit",
      "missing_favourite",
      "missing_price",
      "missing_result",
    ].join(","),
  );
  const dateTo = sourceMaxDate ?? rows.at(-1)?.meeting_date ?? collectionStart;
  const aggregates = buildInsightAggregatesFromRaceDayEntries(rows, collectionStart, dateTo);
  const [aggregateRun] = await supabase.insert("insight_aggregate_runs", [{
    finished_at: new Date().toISOString(),
    source: "edge_race_day_refresh",
    source_max_date: dateTo,
    source_min_date: collectionStart,
    started_at: new Date().toISOString(),
    success: true,
    summary: {
      aggregateRows: aggregates.length,
      raceDayEntries: rows.length,
    },
    triggered_by: triggeredBy,
  }]);

  await supabase.upsert("insight_aggregates", aggregates.map((row) => ({
    ...row,
    aggregate_run_id: aggregateRun.id,
  })), "scope_key", "resolution=merge-duplicates,return=minimal");

  return {
    aggregateRunId: aggregateRun.id,
    insightAggregates: aggregates.length,
    raceDayEntries: rows.length,
  };
}

function createPredictionOutcomePatch(prediction, race, runner, result) {
  const starterCount = race?.starter_count ?? prediction.predicted_starter_count ?? null;

  if (!race) {
    if (shouldKeepPredictionPendingWithoutRace(prediction)) {
      return {
        outcome_missing_result: false,
        outcome_missing_runner: false,
        outcome_status: "pending",
        outcome_updated_at: new Date().toISOString(),
      };
    }

    return {
      outcome_missing_result: true,
      outcome_missing_runner: false,
      outcome_status: "race_not_found",
      outcome_updated_at: new Date().toISOString(),
    };
  }

  if (!runner) {
    return {
      outcome_missing_result: true,
      outcome_missing_runner: true,
      outcome_race_id: race.id,
      outcome_status: "missing_runner",
      outcome_starter_count: starterCount,
      outcome_updated_at: new Date().toISOString(),
    };
  }

  if (!result || result.finish_position === null || result.finish_position === undefined) {
    return {
      outcome_missing_result: true,
      outcome_missing_runner: false,
      outcome_race_id: race.id,
      outcome_runner_id: runner.id,
      outcome_status: "missing_result",
      outcome_starter_count: starterCount,
      outcome_updated_at: new Date().toISOString(),
    };
  }

  const resultPosition = Number(result.finish_position);
  const winReturn = resultPosition === 1 ? Number(prediction.predicted_fixed_win_price ?? 0) : 0;
  const bonusCredit = getBonusBetCredit(resultPosition, starterCount ?? 0);

  return {
    outcome_bonus_credit: roundMoney(bonusCredit),
    outcome_missing_result: false,
    outcome_missing_runner: false,
    outcome_race_id: race.id,
    outcome_result_position: resultPosition,
    outcome_runner_id: runner.id,
    outcome_starter_count: starterCount,
    outcome_status: "settled",
    outcome_total_value_with_bonus_credit: roundMoney(winReturn + bonusCredit),
    outcome_updated_at: new Date().toISOString(),
    outcome_win_return: roundMoney(winReturn),
  };
}

function shouldKeepPredictionPendingWithoutRace(prediction, now = Date.now()) {
  const advertisedStart = Date.parse(prediction.advertised_start ?? "");

  if (!Number.isFinite(advertisedStart)) {
    return false;
  }

  return advertisedStart > now - RACE_NOT_FOUND_GRACE_HOURS * 60 * 60 * 1000;
}

async function selectRowsByIn(supabase, table, column, values, select, extraSearch = {}) {
  const uniqueValues = [...new Set(values)].filter(Boolean);

  if (!uniqueValues.length) {
    return [];
  }

  const rows = [];

  for (const batch of chunk(uniqueValues, 100)) {
    rows.push(...await supabase.selectAll(table, {
      ...extraSearch,
      [column]: `in.(${batch.map(quotePostgrestInValue).join(",")})`,
    }, select));
  }

  return rows;
}

/**
 * Matches stored Betcha candidate predictions to refreshed race results and stores outcomes.
 */
export async function reconcilePromotionPredictionOutcomesFromSupabase({ batchSize = DEFAULT_BATCH_SIZE, config }) {
  const supabase = createSupabaseRestClient(config, batchSize);
  const predictions = await supabase.selectAll("promotion_predictions", {
    order: "advertised_start.asc",
    outcome_status: "neq.settled",
    source: "eq.betcha",
  }, [
    "id",
    "advertised_start",
    "prediction_model",
    "source_race_card_id",
    "predicted_runner_number",
    "predicted_fixed_win_price",
    "predicted_starter_count",
  ].join(","));

  if (!predictions.length) {
    return {
      checked: 0,
      missingResults: 0,
      missingRunners: 0,
      pending: 0,
      raceNotFound: 0,
      settled: 0,
    };
  }

  const races = await selectRowsByIn(supabase, "races", "source_race_card_id", predictions.map((row) => row.source_race_card_id), [
    "id",
    "source_race_card_id",
    "starter_count",
    "status",
  ].join(","));
  const raceBySourceRaceCardId = new Map(races.map((race) => [race.source_race_card_id, race]));
  const runners = await selectRowsByIn(supabase, "runners", "race_id", races.map((race) => race.id), [
    "id",
    "race_id",
    "runner_number",
    "runner_name",
    "scratched",
  ].join(","));
  const runnerByRaceAndNumber = new Map(runners.map((runner) => [
    `${runner.race_id}:${runner.runner_number}`,
    runner,
  ]));
  const results = await selectRowsByIn(supabase, "race_results", "runner_id", runners.map((runner) => runner.id), [
    "runner_id",
    "finish_position",
    "finish_status",
  ].join(","));
  const resultByRunnerId = new Map(results.map((result) => [result.runner_id, result]));
  const summary = {
    checked: predictions.length,
    missingResults: 0,
    missingRunners: 0,
    pending: 0,
    raceNotFound: 0,
    settled: 0,
  };

  for (const prediction of predictions) {
    const race = raceBySourceRaceCardId.get(prediction.source_race_card_id) ?? null;
    const runner = race
      ? runnerByRaceAndNumber.get(`${race.id}:${prediction.predicted_runner_number}`) ?? null
      : null;
    const result = runner ? resultByRunnerId.get(runner.id) ?? null : null;
    const patch = createPredictionOutcomePatch(prediction, race, runner, result);

    await supabase.patch("promotion_predictions", prediction.id, patch);

    if (patch.outcome_status === "settled") {
      summary.settled += 1;
    } else if (patch.outcome_status === "pending") {
      summary.pending += 1;
    } else if (patch.outcome_status === "missing_runner") {
      summary.missingRunners += 1;
    } else if (patch.outcome_status === "race_not_found") {
      summary.raceNotFound += 1;
    } else {
      summary.missingResults += 1;
    }
  }

  return summary;
}

function createUserRaceBetOutcomePatch(bet, race, runner, result) {
  const starterCount = race?.starter_count ?? bet.selected_starter_count ?? null;

  if (!race) {
    return {
      outcome_missing_result: true,
      outcome_missing_runner: false,
      outcome_status: "race_not_found",
      outcome_updated_at: new Date().toISOString(),
    };
  }

  if (!runner) {
    return {
      outcome_missing_result: false,
      outcome_missing_runner: true,
      outcome_race_id: race.id,
      outcome_status: "missing_runner",
      outcome_updated_at: new Date().toISOString(),
    };
  }

  if (!result || !Number.isFinite(Number(result.finish_position))) {
    return {
      outcome_missing_result: true,
      outcome_missing_runner: false,
      outcome_race_id: race.id,
      outcome_runner_id: runner.id,
      outcome_starter_count: starterCount,
      outcome_status: "missing_result",
      outcome_updated_at: new Date().toISOString(),
    };
  }

  const resultPosition = Number(result.finish_position);
  const winReturn = resultPosition === 1 ? Number(bet.selected_fixed_win_price ?? 0) : 0;
  const bonusCredit = starterCount >= 8 && [2, 3].includes(resultPosition)
    ? 1
    : starterCount >= 5 && resultPosition === 2
      ? 1
      : 0;

  return {
    outcome_bonus_credit: bonusCredit,
    outcome_missing_result: false,
    outcome_missing_runner: false,
    outcome_race_id: race.id,
    outcome_result_position: resultPosition,
    outcome_runner_id: runner.id,
    outcome_starter_count: starterCount,
    outcome_status: "settled",
    outcome_total_value_with_bonus_credit: winReturn + bonusCredit,
    outcome_updated_at: new Date().toISOString(),
    outcome_win_return: winReturn,
  };
}

/**
 * Matches manually logged promo bets to refreshed race results and stores personal outcomes.
 */
export async function reconcileUserRaceBetOutcomesFromSupabase({ batchSize = DEFAULT_BATCH_SIZE, config }) {
  const supabase = createSupabaseRestClient(config, batchSize);
  const bets = await supabase.selectAll("user_race_bets", {
    order: "advertised_start.asc",
    outcome_status: "neq.settled",
  }, [
    "id",
    "source_race_card_id",
    "selected_runner_number",
    "selected_fixed_win_price",
    "selected_starter_count",
  ].join(","));

  if (!bets.length) {
    return {
      checked: 0,
      missingResults: 0,
      missingRunners: 0,
      raceNotFound: 0,
      settled: 0,
    };
  }

  const races = await selectRowsByIn(supabase, "races", "source_race_card_id", bets.map((row) => row.source_race_card_id), [
    "id",
    "source_race_card_id",
    "starter_count",
    "status",
  ].join(","));
  const raceBySourceRaceCardId = new Map(races.map((race) => [race.source_race_card_id, race]));
  const runners = await selectRowsByIn(supabase, "runners", "race_id", races.map((race) => race.id), [
    "id",
    "race_id",
    "runner_number",
    "runner_name",
    "scratched",
  ].join(","));
  const runnerByRaceAndNumber = new Map(runners.map((runner) => [
    `${runner.race_id}:${runner.runner_number}`,
    runner,
  ]));
  const results = await selectRowsByIn(supabase, "race_results", "runner_id", runners.map((runner) => runner.id), [
    "runner_id",
    "finish_position",
    "finish_status",
  ].join(","));
  const resultByRunnerId = new Map(results.map((result) => [result.runner_id, result]));
  const summary = {
    checked: bets.length,
    missingResults: 0,
    missingRunners: 0,
    raceNotFound: 0,
    settled: 0,
  };

  for (const bet of bets) {
    const race = raceBySourceRaceCardId.get(bet.source_race_card_id) ?? null;
    const runner = race
      ? runnerByRaceAndNumber.get(`${race.id}:${bet.selected_runner_number}`) ?? null
      : null;
    const result = runner ? resultByRunnerId.get(runner.id) ?? null : null;
    const patch = createUserRaceBetOutcomePatch(bet, race, runner, result);

    await supabase.patch("user_race_bets", bet.id, patch);

    if (patch.outcome_status === "settled") {
      summary.settled += 1;
    } else if (patch.outcome_status === "missing_runner") {
      summary.missingRunners += 1;
    } else if (patch.outcome_status === "race_not_found") {
      summary.raceNotFound += 1;
    } else {
      summary.missingResults += 1;
    }
  }

  return summary;
}

function createPredictionAggregateBucket(scope) {
  return {
    ...scope,
    bonusCreditHits: 0,
    missingResultCount: 0,
    missingRunnerCount: 0,
    pendingCount: 0,
    predictionModel: scope.predictionModel,
    predictionCount: 0,
    seconds: 0,
    settledCount: 0,
    thirds: 0,
    totalBonusCredit: 0,
    totalReturn: 0,
    totalStake: 0,
    totalValueWithBonusCredit: 0,
    wins: 0,
  };
}

function addPredictionToAggregate(bucket, prediction) {
  bucket.predictionCount += 1;

  if (prediction.outcome_status === "pending") {
    bucket.pendingCount += 1;
  }

  if (prediction.outcome_status === "missing_runner") {
    bucket.missingRunnerCount += 1;
  }

  if (["missing_result", "race_not_found"].includes(prediction.outcome_status)) {
    bucket.missingResultCount += 1;
  }

  if (prediction.outcome_status !== "settled") {
    return;
  }

  const position = Number(prediction.outcome_result_position);

  bucket.settledCount += 1;
  bucket.totalStake += 1;
  bucket.totalReturn += Number(prediction.outcome_win_return ?? 0);
  bucket.totalBonusCredit += Number(prediction.outcome_bonus_credit ?? 0);
  bucket.totalValueWithBonusCredit += Number(prediction.outcome_total_value_with_bonus_credit ?? 0);
  bucket.wins += position === 1 ? 1 : 0;
  bucket.seconds += position === 2 ? 1 : 0;
  bucket.thirds += position === 3 ? 1 : 0;
  bucket.bonusCreditHits += Number(prediction.outcome_bonus_credit ?? 0) > 0 ? 1 : 0;
}

export function buildPredictionAggregatesFromPredictionRows(rows) {
  const buckets = new Map();
  const sourceDates = rows.map((row) => row.source_date).filter(Boolean).sort();

  function getBucket(scope) {
    const bucket = buckets.get(scope.scopeKey) ?? createPredictionAggregateBucket(scope);
    buckets.set(scope.scopeKey, bucket);
    return bucket;
  }

  for (const row of rows) {
    const predictionModel = row.prediction_model ?? "global_bucket_blend_v1";
    const scopes = [
      { predictionModel, scopeKey: `${predictionModel}:overall`, scopeType: "overall" },
      { predictionModel, raceCode: row.race_code, scopeKey: `${predictionModel}:race_code:${row.race_code}`, scopeType: "race_code" },
    ];

    for (const scope of scopes) {
      addPredictionToAggregate(getBucket(scope), row);
    }
  }

  return Array.from(buckets.values()).map((bucket) => {
    const totalStake = roundMoney(bucket.totalStake);
    const totalReturn = roundMoney(bucket.totalReturn);
    const totalValueWithBonusCredit = roundMoney(bucket.totalValueWithBonusCredit);
    const netReturn = roundMoney(totalReturn - totalStake);

    return {
      average_return_per_dollar: totalStake ? roundRatio(totalReturn / totalStake) : 0,
      average_value_per_dollar_with_bonus_credit: totalStake ? roundRatio(totalValueWithBonusCredit / totalStake) : 0,
      bonus_credit_percentage: percentage(bucket.bonusCreditHits, bucket.settledCount),
      date_from: sourceDates[0] ?? null,
      date_to: sourceDates.at(-1) ?? null,
      missing_result_count: bucket.missingResultCount,
      missing_runner_count: bucket.missingRunnerCount,
      net_return: netReturn,
      pending_count: bucket.pendingCount,
      prediction_model: bucket.predictionModel,
      prediction_count: bucket.predictionCount,
      race_code: bucket.raceCode ?? null,
      roi_percentage: percentage(netReturn, totalStake),
      scope_key: bucket.scopeKey,
      scope_type: bucket.scopeType,
      second_percentage: percentage(bucket.seconds, bucket.settledCount),
      seconds: bucket.seconds,
      settled_count: bucket.settledCount,
      third_percentage: percentage(bucket.thirds, bucket.settledCount),
      thirds: bucket.thirds,
      total_bonus_credit: roundMoney(bucket.totalBonusCredit),
      total_return: totalReturn,
      total_stake: totalStake,
      total_value_with_bonus_credit: totalValueWithBonusCredit,
      win_percentage: percentage(bucket.wins, bucket.settledCount),
      wins: bucket.wins,
    };
  });
}

/**
 * Rebuilds the app-facing Predictions aggregate read model from stored prediction outcomes.
 */
export async function rebuildPredictionAggregatesFromSupabase({ batchSize = DEFAULT_BATCH_SIZE, config }) {
  const supabase = createSupabaseRestClient(config, batchSize);
  const rows = await supabase.selectAll("promotion_predictions", {
    order: "source_date.asc,advertised_start.asc",
  }, [
    "prediction_model",
    "source_date",
    "race_code",
    "outcome_status",
    "outcome_result_position",
    "outcome_win_return",
    "outcome_bonus_credit",
    "outcome_total_value_with_bonus_credit",
  ].join(","));
  const aggregates = buildPredictionAggregatesFromPredictionRows(rows);

  await supabase.upsert("prediction_aggregates", aggregates, "scope_key", "resolution=merge-duplicates,return=minimal");

  return {
    predictionAggregates: aggregates.length,
    predictions: rows.length,
  };
}

async function acquireLock(supabase, { force = false, lockKey, runId, ttlMinutes = DEFAULT_LOCK_TTL_MINUTES }) {
  const existing = await supabase.selectAll("ingestion_locks", { lock_key: `eq.${lockKey}`, limit: "1" });
  const active = existing[0];

  if (active && !force && new Date(active.expires_at).valueOf() > Date.now()) {
    throw new Error(`Refresh lock ${lockKey} is active until ${active.expires_at}.`);
  }

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await supabase.upsert("ingestion_locks", [{
    expires_at: expiresAt,
    lock_key: lockKey,
    locked_at: new Date().toISOString(),
    run_id: runId ?? null,
  }], "lock_key", "resolution=merge-duplicates,return=minimal");

  return expiresAt;
}

async function releaseLock(supabase, lockKey) {
  await supabase.deleteByIn("ingestion_locks", "lock_key", [lockKey]);
}

export function resolveRefreshWindow({ from, lookbackDays = DEFAULT_LOOKBACK_DAYS, to }) {
  const window = from || to
    ? { from, to }
    : getDefaultWindow(lookbackDays);

  if (!isValidDate(window.from) || !isValidDate(window.to)) {
    throw new Error("Refresh window requires from/to dates as YYYY-MM-DD.");
  }

  return window;
}

export async function runRaceDaysAndInsightsRefresh({
  batchSize = DEFAULT_BATCH_SIZE,
  categories = DEFAULT_RACING_CATEGORIES,
  collectionStart = DEFAULT_COLLECTION_START,
  config,
  countries = DEFAULT_DOMESTIC_COUNTRIES,
  coverageMode = COVERAGE_MODE_ALL_DOMESTIC,
  dryRun = false,
  force = false,
  from,
  lockKey = "refresh-race-days-and-insights",
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  refreshRaceData = true,
  reconcileOutcomes = true,
  rebuildInsights = true,
  to,
  triggeredBy = "edge",
} = {}) {
  const window = resolveRefreshWindow({ from, lookbackDays, to });
  const categoryFilter = normalizeCategoryFilter(categories);
  const countryFilter = normalizeCountryFilter(countries);

  if (dryRun) {
    return {
      dryRun: true,
      categories: categoryFilter,
      countries: countryFilter,
      coverageMode,
      lookbackDays,
      refreshRaceData,
      reconcileOutcomes,
      rebuildInsights,
      sourceTimeZone: SOURCE_TIME_ZONE,
      window,
    };
  }

  const supabase = createSupabaseRestClient(config, batchSize);
  let lockExpiresAt = null;

  try {
    lockExpiresAt = await acquireLock(supabase, { force, lockKey, ttlMinutes: DEFAULT_LOCK_TTL_MINUTES });
    const fetched = refreshRaceData
      ? await fetchRaceDayFixtures({
          ...window,
          categories: categoryFilter,
          countries: countryFilter,
          coverageMode,
        })
      : { errors: [], fixtures: [] };
    const raceWrite = refreshRaceData
      ? await writeRaceRowsToSupabase(buildRaceRowsFromFixtures(fetched.fixtures), {
          batchSize,
          config,
          from: window.from,
          to: window.to,
          triggeredBy,
        })
      : null;
    const insightWrite = rebuildInsights
      ? await rebuildInsightAggregatesFromSupabase({
          batchSize,
          collectionStart,
          config,
          sourceMaxDate: window.to,
          triggeredBy,
        })
      : null;
    const predictionOutcomeWrite = reconcileOutcomes
      ? await reconcilePromotionPredictionOutcomesFromSupabase({
          batchSize,
          config,
        })
      : null;
    const userRaceBetOutcomeWrite = reconcileOutcomes
      ? await reconcileUserRaceBetOutcomesFromSupabase({
          batchSize,
          config,
        })
      : null;
    const predictionAggregateWrite = reconcileOutcomes
      ? await rebuildPredictionAggregatesFromSupabase({
          batchSize,
          config,
        })
      : null;

    return {
      errors: fetched.errors,
      insightWrite,
      lockExpiresAt,
      predictionAggregateWrite,
      predictionOutcomeWrite,
      raceWrite,
      sourceSummary: {
        categories: categoryFilter,
        countries: countryFilter,
        coverageMode,
        dataRefreshed: refreshRaceData,
        fixtures: fetched.fixtures.length,
        meetings: fetched.fixtures.reduce((total, fixture) => total + (fixture.counts?.meetingsMatched ?? fixture.counts?.pilotMeetingsMatched ?? 0), 0),
        races: fetched.fixtures.reduce((total, fixture) => total + (fixture.counts?.racesMatched ?? fixture.counts?.pilotRacesMatched ?? 0), 0),
      },
      userRaceBetOutcomeWrite,
      window,
    };
  } finally {
    await releaseLock(supabase, lockKey).catch(() => null);
  }
}
