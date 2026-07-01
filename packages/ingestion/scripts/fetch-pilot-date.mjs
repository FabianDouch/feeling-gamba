import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BETCHA_GRAPHQL_ENDPOINT = "https://api.betcha.co.nz/graphql";
const FIXED_WIN_PRODUCT_TYPE_ID = "940b8704-e497-4a76-b390-00918ff7d282";
const FIXED_WIN_PRICE_ID_PATTERNS = [
  `:${FIXED_WIN_PRODUCT_TYPE_ID}:`,
  ":1f48974a-7307-4408-8f06-8a16907d1309:18ba60da-abd2-463c-a34a-dc6368377ac8",
];
const DEFAULT_UNIT_STAKE = 1;
const COVERAGE_MODE_PILOT = "pilot";
const COVERAGE_MODE_ALL_DOMESTIC = "all_domestic";
const SUPPORTED_DOMESTIC_COUNTRIES = new Set(["AUS", "HK", "NZ"]);
const SUPPORTED_RACING_CATEGORIES = new Set(["HORSE", "HARNESS", "GREYHOUND"]);

/**
 * Creates a configured Australian comparison track entry for source matching.
 */
function australianComparisonTrack(canonicalName, aliases = [canonicalName]) {
  return {
    canonicalName,
    country: "AUS",
    includeAsComparison: true,
    aliases,
  };
}

const PILOT_TRACKS = [
  {
    canonicalName: "Ellerslie",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Ellerslie"],
  },
  {
    canonicalName: "New Plymouth",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["New Plymouth", "New Plymouth Raceway", "Pukekura Raceway"],
  },
  {
    canonicalName: "Te Rapa",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Te Rapa"],
  },
  {
    canonicalName: "Addington",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Addington", "Addington Raceway"],
  },
  {
    canonicalName: "Alexandra Park",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Alexandra Park", "Auckland"],
  },
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
  {
    canonicalName: "Wingatui",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Wingatui"],
  },
  {
    canonicalName: "Whanganui",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Whanganui", "Wanganui", "Hatrick"],
  },
  {
    canonicalName: "Cambridge",
    country: "NZ",
    includeAsComparison: false,
    aliases: ["Cambridge", "Cambridge Raceway", "Cambridge (G)"],
  },
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

function parseArgs(argv) {
  const options = {
    allDomestic: false,
    date: null,
    from: null,
    output: null,
    to: null,
    tracks: [],
  };

  for (const arg of argv) {
    if (arg === "--all-domestic" || arg === "--coverage=all-domestic" || arg === "--coverage=all_domestic") {
      options.allDomestic = true;
    } else if (arg === "--pilot-tracks" || arg === "--coverage=pilot") {
      options.allDomestic = false;
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--tracks=") || arg.startsWith("--courses=")) {
      options.tracks = arg.slice(arg.indexOf("=") + 1)
        .split(",")
        .map((track) => track.trim())
        .filter(Boolean);
    }
  }

  if (options.date && (options.from || options.to)) {
    throw new Error("Use either --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD, not both.");
  }

  if (options.date && !isValidDate(options.date)) {
    throw new Error("Pass a date as --date=YYYY-MM-DD.");
  }

  if ((options.from || options.to) && (!isValidDate(options.from) || !isValidDate(options.to))) {
    throw new Error("Pass a range as --from=YYYY-MM-DD --to=YYYY-MM-DD.");
  }

  if (!options.date && !options.from) {
    throw new Error("Pass --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD.");
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
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (start > end) {
    throw new Error("--from must be before or equal to --to.");
  }

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCountry(value) {
  return value === "AU" ? "AUS" : value ?? "Unknown";
}

function getMeetingCountry(meeting) {
  return normalizeCountry(meeting.venue?.country);
}

function getMeetingTrackName(meeting) {
  return meeting.venue?.name ?? meeting.name ?? "Unknown";
}

function matchesTrackFilters(meeting, trackFilters) {
  if (!trackFilters.length) {
    return true;
  }

  const meetingNames = [meeting.name, meeting.venue?.name, meeting.meetingCode]
    .filter(Boolean)
    .map(normalizeName);
  const normalizedFilters = trackFilters.map(normalizeName);

  return normalizedFilters.some((filter) => meetingNames.includes(filter));
}

function isSupportedDomesticMeeting(meeting) {
  return SUPPORTED_DOMESTIC_COUNTRIES.has(getMeetingCountry(meeting))
    && SUPPORTED_RACING_CATEGORIES.has(meeting.category);
}

/**
 * Builds a source-backed track object for broad AU/NZ/HK domestic collection.
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

function selectPilotTracks(trackFilters) {
  if (!trackFilters.length) {
    return PILOT_TRACKS;
  }

  const selected = [];
  const unmatched = [];

  for (const filter of trackFilters) {
    const normalizedFilter = normalizeName(filter);
    const match = PILOT_TRACKS.find((track) =>
      normalizeName(track.canonicalName) === normalizedFilter
        || track.aliases.some((alias) => normalizeName(alias) === normalizedFilter),
    );

    if (match) {
      selected.push(match);
    } else {
      unmatched.push(filter);
    }
  }

  if (unmatched.length) {
    throw new Error(
      `Unknown track filter(s): ${unmatched.join(", ")}. Known tracks: ${
        PILOT_TRACKS.map((track) => track.canonicalName).join(", ")
      }.`,
    );
  }

  return Array.from(new Map(selected.map((track) => [track.canonicalName, track])).values());
}

function getTrackFilterSlug(trackFilters) {
  if (!trackFilters.length) {
    return "pilot-tracks";
  }

  return `pilot-tracks-${trackFilters
    .map(normalizeName)
    .map((track) => track.replace(/\s+/g, "-"))
    .join("-")}`;
}

function getCoverageMode(options) {
  return options.allDomestic ? COVERAGE_MODE_ALL_DOMESTIC : COVERAGE_MODE_PILOT;
}

function getOutputSlug(options) {
  if (getCoverageMode(options) === COVERAGE_MODE_ALL_DOMESTIC) {
    if (!options.tracks.length) {
      return "all-domestic";
    }

    return `all-domestic-${options.tracks
      .map(normalizeName)
      .map((track) => track.replace(/\s+/g, "-"))
      .join("-")}`;
  }

  return getTrackFilterSlug(options.tracks);
}

function findPilotTrack(meeting, pilotTracks = PILOT_TRACKS) {
  const meetingNames = [
    meeting.name,
    meeting.venue?.name,
  ].map(normalizeName);

  return pilotTracks.find((track) => {
    if (track.country !== getMeetingCountry(meeting)) {
      return false;
    }

    return track.aliases.some((alias) => meetingNames.includes(normalizeName(alias)));
  });
}

function matchMeetingToCoverage(meeting, { coverageMode, pilotTracks, trackFilters }) {
  if (coverageMode === COVERAGE_MODE_ALL_DOMESTIC) {
    if (!isSupportedDomesticMeeting(meeting) || !matchesTrackFilters(meeting, trackFilters)) {
      return null;
    }

    return createDomesticTrackFromMeeting(meeting);
  }

  return findPilotTrack(meeting, pilotTracks);
}

function toRaceCardId(racingRaceId) {
  return String(racingRaceId).replace(/^RacingRace:/, "RacingRaceCard:");
}

async function graphql(operationName, query, variables) {
  const response = await fetch(BETCHA_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`${operationName} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    const messages = payload.errors.map((error) => error.message).join("; ");
    throw new Error(`${operationName} returned GraphQL errors: ${messages}`);
  }

  return payload;
}

/**
 * Selects the source-backed fixed-win price row across NZ/AUS and HK product IDs.
 */
function getFixedWinPrice(runner) {
  const price = runner.prices?.find((candidate) =>
    FIXED_WIN_PRICE_ID_PATTERNS.some((pattern) => String(candidate.id).includes(pattern)),
  );

  return price?.odds?.decimal ?? null;
}

function getResultRows(raceCard) {
  const result = raceCard.results?.find(
    (entry) => entry.__typename === "RacingResults" && Array.isArray(entry.runnerRows),
  );

  return result?.runnerRows ?? [];
}

function parseDividendValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWinDividend(resultRow) {
  const winDividend = resultRow?.winPlaceDividends?.find((dividend) => dividend.label === "Win");
  return parseDividendValue(winDividend?.value);
}

/**
 * Applies AU/NZ/HK place-style bet-back terms from the final starter count.
 */
function getBonusBetCredit(resultPosition, starterCount) {
  if (resultPosition === 2 && starterCount >= 5) {
    return DEFAULT_UNIT_STAKE;
  }

  if (resultPosition === 3 && starterCount >= 8) {
    return DEFAULT_UNIT_STAKE;
  }

  return 0;
}

/**
 * Derives favourite, market mover, result, and unit-stake outcome fields.
 */
function deriveRaceInsights(raceCard) {
  const runnerRows = raceCard.finalField?.runnerRows ?? [];
  const activeRunners = runnerRows.filter(
    (runner) => !runner.scratchedTimestamp && normalizeName(runner.name) !== "vacant box",
  );
  const resultRows = getResultRows(raceCard);
  const resultByEntrantId = new Map(resultRows.map((row) => [row.id, row]));
  const runnersWithFixedWin = activeRunners
    .map((runner) => ({
      id: runner.id,
      number: runner.number,
      name: runner.name,
      fixedWinPrice: getFixedWinPrice(runner),
      resultPosition: resultByEntrantId.get(runner.id)?.position ?? null,
      winDividend: getWinDividend(resultByEntrantId.get(runner.id)),
      isMarketMover: Boolean(runner.isMarketMover),
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
        number: runner?.number ?? null,
        name: runner?.name ?? null,
        winDividend: getWinDividend(row),
      };
    });

  return {
    activeStarterCount: activeRunners.length,
    scratchedCount: runnerRows.length - activeRunners.length,
    fixedWinPriceIdPatterns: FIXED_WIN_PRICE_ID_PATTERNS,
    fixedWinProductTypeId: FIXED_WIN_PRODUCT_TYPE_ID,
    unitStake: DEFAULT_UNIT_STAKE,
    fixedWinFavouritePrice: shortestFixedWinPrice,
    favourites: favourites.map((runner) => {
      const oneDollarWinReturn = runner.resultPosition === 1 ? runner.fixedWinPrice : 0;
      const oneDollarBonusBetCredit = getBonusBetCredit(
        runner.resultPosition,
        activeRunners.length,
      );

      return {
        ...runner,
        oneDollarWinReturn,
        oneDollarBonusBetCredit,
        oneDollarTotalValueWithBonusCredit: oneDollarWinReturn + oneDollarBonusBetCredit,
      };
    }),
    marketMovers,
    winners,
    hasResultRows: resultRows.length > 0,
  };
}

function summarizeMeetings(meetings) {
  return meetings.map((meeting) => ({
    canonicalTrack: meeting.canonicalTrack,
    sourceTrack: meeting.source.name,
    sourceVenue: meeting.source.venue?.name ?? null,
    country: meeting.source.venue?.country ?? null,
    category: meeting.source.category,
    races: meeting.races.length,
  }));
}

function toRaceCode(category) {
  const mapping = {
    HORSE: "horse",
    HARNESS: "harness",
    GREYHOUND: "greyhound",
  };

  return mapping[category] ?? String(category ?? "").toLowerCase();
}

function createFavouriteBucket(label) {
  return {
    label,
    favouriteSelections: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    totalStake: 0,
    totalReturn: 0,
    totalBonusBetCredit: 0,
    totalValueWithBonusCredit: 0,
    profitLoss: 0,
    profitLossWithBonusCredit: 0,
    averageReturnPerDollar: 0,
    averageValuePerDollarWithBonusCredit: 0,
    bonusBetCredits: 0,
  };
}

function addFavouriteToBucket(bucket, favourite) {
  bucket.favouriteSelections += 1;
  bucket.wins += favourite.resultPosition === 1 ? 1 : 0;
  bucket.seconds += favourite.resultPosition === 2 ? 1 : 0;
  bucket.thirds += favourite.resultPosition === 3 ? 1 : 0;
  bucket.totalStake += 1;
  bucket.totalReturn += favourite.oneDollarWinReturn;
  bucket.totalBonusBetCredit += favourite.oneDollarBonusBetCredit;
  bucket.totalValueWithBonusCredit += favourite.oneDollarTotalValueWithBonusCredit;
  bucket.bonusBetCredits += favourite.oneDollarBonusBetCredit > 0 ? 1 : 0;
}

function finalizeFavouriteBucket(bucket) {
  return {
    ...bucket,
    winPercentage: bucket.favouriteSelections
      ? Number(((bucket.wins / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    secondPercentage: bucket.favouriteSelections
      ? Number(((bucket.seconds / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    thirdPercentage: bucket.favouriteSelections
      ? Number(((bucket.thirds / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    bonusBetCreditPercentage: bucket.favouriteSelections
      ? Number(((bucket.bonusBetCredits / bucket.favouriteSelections) * 100).toFixed(2))
      : 0,
    totalReturn: Number(bucket.totalReturn.toFixed(2)),
    totalBonusBetCredit: Number(bucket.totalBonusBetCredit.toFixed(2)),
    totalValueWithBonusCredit: Number(bucket.totalValueWithBonusCredit.toFixed(2)),
    profitLoss: Number((bucket.totalReturn - bucket.totalStake).toFixed(2)),
    profitLossWithBonusCredit: Number(
      (bucket.totalValueWithBonusCredit - bucket.totalStake).toFixed(2),
    ),
    averageReturnPerDollar: bucket.totalStake
      ? Number((bucket.totalReturn / bucket.totalStake).toFixed(3))
      : 0,
    averageValuePerDollarWithBonusCredit: bucket.totalStake
      ? Number((bucket.totalValueWithBonusCredit / bucket.totalStake).toFixed(3))
      : 0,
  };
}

/**
 * Aggregates favourite outcomes from races that have settled result positions.
 */
function summarizeFavouriteOutcomes(meetings) {
  const overall = createFavouriteBucket("overall");
  const byDiscipline = new Map();
  const byStarterCount = new Map();

  for (const meeting of meetings) {
    const raceCode = toRaceCode(meeting.source.category);

    for (const race of meeting.races) {
      const starterCount = race.derived?.activeStarterCount ?? null;

      for (const favourite of race.derived?.favourites ?? []) {
        if (favourite.resultPosition === null) {
          continue;
        }

        const disciplineBucket = byDiscipline.get(raceCode) ?? createFavouriteBucket(raceCode);
        const starterBucketKey = String(starterCount);
        const starterBucket = byStarterCount.get(starterBucketKey) ?? createFavouriteBucket(starterBucketKey);

        addFavouriteToBucket(overall, favourite);
        addFavouriteToBucket(disciplineBucket, favourite);
        addFavouriteToBucket(starterBucket, favourite);

        byDiscipline.set(raceCode, disciplineBucket);
        byStarterCount.set(starterBucketKey, starterBucket);
      }
    }
  }

  return {
    note: "Counts are favourite selections, not necessarily unique races, so co-favourites would create multiple selections. Bonus bet credit assumes a $1 face-value bonus bet when the favourite finishes 2nd or 3rd; it is not converted to cash value.",
    overall: finalizeFavouriteBucket(overall),
    byDiscipline: Array.from(byDiscipline.values()).map(finalizeFavouriteBucket),
    byStarterCount: Array.from(byStarterCount.values())
      .map(finalizeFavouriteBucket)
      .sort((left, right) => Number(left.label) - Number(right.label)),
  };
}

async function fetchDate({ coverageMode, date, outputPath, pilotTracks, trackFilters }) {
  const discoveryResponse = await graphql("RacingHomeMeetingsDesktopScreen", DISCOVERY_QUERY, {
    date,
    categories: ["HORSE", "HARNESS", "GREYHOUND"],
    regions: ["DOMESTIC"],
  });

  const allMeetings = discoveryResponse.data?.racingDay?.meetings ?? [];
  const matchedMeetingEntries = allMeetings
    .map((meeting) => ({
      meeting,
      pilotTrack: matchMeetingToCoverage(meeting, { coverageMode, pilotTracks, trackFilters }),
    }))
    .filter((entry) => entry.pilotTrack);

  const meetings = [];

  for (const entry of matchedMeetingEntries) {
    const races = [];

    for (const race of entry.meeting.races?.nodes ?? []) {
      const raceCardId = toRaceCardId(race.id);
      const raceCardResponse = await graphql("RaceCardLite", RACE_CARD_QUERY, {
        id: raceCardId,
      });
      const raceCard = raceCardResponse.data?.raceCard;

      races.push({
        sourceRace: race,
        raceCardId,
        raceCard,
        derived: raceCard ? deriveRaceInsights(raceCard) : null,
      });
    }

    meetings.push({
      canonicalTrack: entry.pilotTrack.canonicalName,
      includeAsComparison: entry.pilotTrack.includeAsComparison,
      source: entry.meeting,
      races,
    });
  }

  const matchedCanonicalTracks = new Set(meetings.map((meeting) => meeting.canonicalTrack));
  const unmatchedPilotTracks = coverageMode === COVERAGE_MODE_PILOT
    ? pilotTracks
      .filter((track) => !matchedCanonicalTracks.has(track.canonicalName))
      .map((track) => track.canonicalName)
    : [];
  const output = {
    generatedAt: new Date().toISOString(),
    testDate: date,
    dateBasis: "Manual local historical collection.",
    source: {
      name: "betcha_graphql",
      endpoint: BETCHA_GRAPHQL_ENDPOINT,
      discoveryOperation: "RacingHomeMeetingsDesktopScreen",
      raceCardOperation: "RaceCardLite",
      note: "Betcha GraphQL is used for historical race-card discovery and detail fixtures.",
    },
    filters: {
      categories: ["HORSE", "HARNESS", "GREYHOUND"],
      coverageMode,
      regions: ["DOMESTIC"],
      pilotTracks: coverageMode === COVERAGE_MODE_PILOT ? pilotTracks : [],
      trackFilters,
    },
    counts: {
      meetingsMatched: meetings.length,
      racesMatched: meetings.reduce((total, meeting) => total + meeting.races.length, 0),
      sourceMeetingsDiscovered: allMeetings.length,
      pilotMeetingsMatched: meetings.length,
      pilotRacesMatched: meetings.reduce((total, meeting) => total + meeting.races.length, 0),
    },
    unmatchedPilotTracks,
    ignoredSourceMeetings: allMeetings
      .filter((meeting) => !matchMeetingToCoverage(meeting, { coverageMode, pilotTracks, trackFilters }))
      .map((meeting) => ({
        name: meeting.name,
        category: meeting.category,
        country: meeting.venue?.country ?? null,
        state: meeting.venue?.state ?? null,
        races: meeting.races?.nodes?.length ?? 0,
      })),
    summary: {
      meetings: summarizeMeetings(meetings),
      favouriteOutcomes: summarizeFavouriteOutcomes(meetings),
    },
    meetings,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  return {
    output,
    outputPath,
  };
}

function summarizeCollectionResult(date, outputPath, output) {
  return {
    coverageMode: output.filters.coverageMode,
    date,
    outputPath,
    counts: output.counts,
    meetings: output.summary.meetings,
    favouriteOutcomes: output.summary.favouriteOutcomes.overall,
    unmatchedPilotTracks: output.unmatchedPilotTracks,
  };
}

function summarizeRange(results, { coverageMode, pilotTracks, trackFilters }) {
  const byTrack = new Map();
  const totals = {
    sourceMeetingsDiscovered: 0,
    meetingsMatched: 0,
    racesMatched: 0,
    pilotMeetingsMatched: 0,
    pilotRacesMatched: 0,
  };

  for (const result of results) {
    totals.sourceMeetingsDiscovered += result.counts.sourceMeetingsDiscovered;
    totals.meetingsMatched += result.counts.meetingsMatched ?? result.counts.pilotMeetingsMatched;
    totals.racesMatched += result.counts.racesMatched ?? result.counts.pilotRacesMatched;
    totals.pilotMeetingsMatched += result.counts.pilotMeetingsMatched;
    totals.pilotRacesMatched += result.counts.pilotRacesMatched;

    for (const meeting of result.meetings) {
      const current = byTrack.get(meeting.canonicalTrack) ?? {
        canonicalTrack: meeting.canonicalTrack,
        categories: new Set(),
        meetings: 0,
        races: 0,
      };

      current.categories.add(meeting.category);
      current.meetings += 1;
      current.races += meeting.races;
      byTrack.set(meeting.canonicalTrack, current);
    }
  }

  return {
    totals,
    byDate: results,
    byTrack: Array.from(byTrack.values()).map((track) => ({
      ...track,
      categories: Array.from(track.categories).sort(),
    })),
    filteredPilotTracks: coverageMode === COVERAGE_MODE_PILOT
      ? pilotTracks.map((track) => track.canonicalName)
      : [],
    trackFilters,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const coverageMode = getCoverageMode(options);
  const pilotTracks = coverageMode === COVERAGE_MODE_PILOT ? selectPilotTracks(options.tracks) : PILOT_TRACKS;
  const outputSlug = getOutputSlug(options);
  const dates = options.date ? [options.date] : listDates(options.from, options.to);

  const results = [];

  for (const date of dates) {
    const outputPath = path.resolve(
      repoRoot,
      dates.length === 1 && options.output
        ? options.output
        : `data/raw/betcha-graphql/${outputSlug}-${date}.json`,
    );
    const { output, outputPath: writtenPath } = await fetchDate({
      coverageMode,
      date,
      outputPath,
      pilotTracks,
      trackFilters: options.tracks,
    });

    results.push(summarizeCollectionResult(date, writtenPath, output));
    console.log(JSON.stringify({
      date,
      outputPath: writtenPath,
      counts: output.counts,
      meetings: output.summary.meetings,
      unmatchedPilotTracks: output.unmatchedPilotTracks,
      coverageMode,
    }, null, 2));
  }

  if (dates.length > 1) {
    const manifestPath = path.resolve(
      repoRoot,
      options.output ?? `data/raw/betcha-graphql/${outputSlug}-${dates[0]}-to-${dates.at(-1)}.manifest.json`,
    );
    const manifest = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        from: dates[0],
        to: dates.at(-1),
        dates,
      },
      source: {
        name: "betcha_graphql",
        endpoint: BETCHA_GRAPHQL_ENDPOINT,
      },
      filters: {
        coverageMode,
        tracks: coverageMode === COVERAGE_MODE_PILOT ? pilotTracks.map((track) => ({
          canonicalName: track.canonicalName,
          aliases: track.aliases,
          country: track.country,
        })) : [],
        trackFilters: options.tracks,
        categories: ["HORSE", "HARNESS", "GREYHOUND"],
        regions: ["DOMESTIC"],
      },
      summary: summarizeRange(results, { coverageMode, pilotTracks, trackFilters: options.tracks }),
    };

    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({
      manifestPath,
      totals: manifest.summary.totals,
      byTrack: manifest.summary.byTrack,
    }, null, 2));
    return;
  }

  const [result] = results;
  console.log(JSON.stringify({
    outputPath: result.outputPath,
    counts: result.counts,
    meetings: result.meetings,
    favouriteOutcomes: result.favouriteOutcomes,
    unmatchedPilotTracks: result.unmatchedPilotTracks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
