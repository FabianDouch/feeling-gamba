const BETCHA_GRAPHQL_ENDPOINT = "https://api.betcha.co.nz/graphql";
const DEFAULT_PREDICTION_MODEL_KEY = "global_bucket_blend_v1";
const DEFAULT_PREDICTION_MODEL_LABEL = "Global bucket blend";
const FIXED_WIN_PRODUCT_TYPE_ID = "940b8704-e497-4a76-b390-00918ff7d282";
const SOURCE_NAME = "betcha_graphql";
const SOURCE_TIME_ZONE = "Pacific/Auckland";

const RACING_DAY_QUERY = `
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
      }
    }
  }
`;

/**
 * Converts race codes used by app filters into Betcha GraphQL categories.
 */
function toBetchaCategory(raceCode) {
  if (raceCode === "horse") {
    return "HORSE";
  }

  if (raceCode === "harness") {
    return "HARNESS";
  }

  if (raceCode === "greyhound") {
    return "GREYHOUND";
  }

  throw new Error("raceCode must be horse, harness, or greyhound.");
}

function toRaceCode(category) {
  if (category === "HORSE") {
    return "horse";
  }

  if (category === "HARNESS") {
    return "harness";
  }

  return "greyhound";
}

function toRaceCardId(raceId) {
  return String(raceId).replace("RacingRace:", "RacingRaceCard:");
}

function toSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Reads today's Auckland source date when the app does not send one.
 */
export function getTodayInSourceTimeZone() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
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

function getFixedWinPrice(runner) {
  const price = runner.prices?.find((candidate) =>
    String(candidate.id).includes(`:${FIXED_WIN_PRODUCT_TYPE_ID}:`),
  );
  const decimal = Number(price?.odds?.decimal);

  return Number.isFinite(decimal) ? decimal : null;
}

function getPriceBucketStart(price) {
  return Math.floor(Number(price) * 2) / 2;
}

function createPriceBucketLabel(start) {
  return `$${start.toFixed(2)}-$${(start + 0.49).toFixed(2)}`;
}

function weightedAverage(entries) {
  const usableEntries = entries.filter(({ value }) => Number.isFinite(value));
  const totalWeight = usableEntries.reduce((total, entry) => total + entry.weight, 0);

  if (!totalWeight) {
    return null;
  }

  return Number((
    usableEntries.reduce((total, entry) => total + (entry.value * entry.weight), 0) / totalWeight
  ).toFixed(3));
}

function createBetBackSignal(score, sampleSize) {
  if (score === null) {
    return {
      detail: "Favourite price is available, but matching historical starter or price bucket data is limited.",
      label: "Limited history",
      tone: "neutral",
    };
  }

  if (sampleSize < 10) {
    return {
      detail: "Historical buckets are available, but the combined sample size is small.",
      label: "Small sample",
      tone: "neutral",
    };
  }

  if (score >= 1.05) {
    return {
      detail: "Default model cash average score is above break-even for the matching favourite price and starter buckets.",
      label: "Positive candidate",
      tone: "positive",
    };
  }

  if (score >= 0.95) {
    return {
      detail: "Default model cash average score is close to break-even for the matching favourite price and starter buckets.",
      label: "Neutral candidate",
      tone: "neutral",
    };
  }

  return {
    detail: "Default model cash average score is below break-even for the matching favourite price and starter buckets.",
    label: "Weak candidate",
    tone: "caution",
  };
}

function getActiveRunners(raceCard) {
  return (raceCard.finalField?.runnerRows ?? []).filter((runner) =>
    !runner.scratchedTimestamp && toSlug(runner.name) !== "vacant-box");
}

function deriveFavouriteContext({ favourite, historicalStats, starterCount }) {
  if (!favourite) {
    return {
      candidate: null,
      historical: {
        historicalDelta: null,
        priceBucket: null,
        starterBucket: historicalStats.byStarterCount[String(starterCount)] ?? null,
      },
      signal: {
        detail: "Fixed-win prices are not currently available, so favourite and price-bucket comparison cannot be calculated yet.",
        label: "Price unavailable",
        tone: "muted",
      },
    };
  }

  const priceBucketLabel = createPriceBucketLabel(getPriceBucketStart(favourite.fixedWinPrice));
  const priceBucket = historicalStats.byPriceBucket[priceBucketLabel] ?? null;
  const starterBucket = historicalStats.byStarterCount[String(starterCount)] ?? null;
  const impliedWinPercentage = Number(((1 / favourite.fixedWinPrice) * 100).toFixed(2));
  const historicalDelta = priceBucket?.winPercentage !== undefined
    ? Number((priceBucket.winPercentage - impliedWinPercentage).toFixed(2))
    : null;
  const blendedCashPlusBonusAverage = weightedAverage([
    {
      value: priceBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.65,
    },
    {
      value: starterBucket?.averageValuePerDollarWithBonusCredit,
      weight: 0.35,
    },
  ]);
  const cashAverageScore = weightedAverage([
    {
      value: priceBucket?.averageReturnPerDollar,
      weight: 0.65,
    },
    {
      value: starterBucket?.averageReturnPerDollar,
      weight: 0.35,
    },
  ]);
  const sampleSize = (priceBucket?.favouriteSelections ?? 0)
    + (starterBucket?.favouriteSelections ?? 0);
  const candidateSignal = createBetBackSignal(cashAverageScore, sampleSize);

  return {
    candidate: {
      blendedCashPlusBonusAverage,
      cashAverageScore,
      detail: candidateSignal.detail,
      label: candidateSignal.label,
      predictionModelKey: DEFAULT_PREDICTION_MODEL_KEY,
      predictionModelLabel: DEFAULT_PREDICTION_MODEL_LABEL,
      sampleSize,
      tone: candidateSignal.tone,
    },
    historical: {
      historicalDelta,
      priceBucket,
      starterBucket,
    },
    signal: candidateSignal,
  };
}

function mapRaceCard(raceCard, historicalStats) {
  const activeRunners = getActiveRunners(raceCard);
  const runners = activeRunners
    .map((runner) => ({
      fixedWinPrice: getFixedWinPrice(runner),
      id: runner.id,
      isFavourite: false,
      isMarketMover: Boolean(runner.isMarketMover),
      name: runner.name,
      number: runner.number,
    }))
    .sort((left, right) => left.number - right.number);
  const pricedRunners = runners.filter((runner) => runner.fixedWinPrice !== null);
  const shortestPrice = pricedRunners.reduce((minimum, runner) => (
    minimum === null || runner.fixedWinPrice < minimum ? runner.fixedWinPrice : minimum
  ), null);

  for (const runner of runners) {
    runner.isFavourite = shortestPrice !== null && runner.fixedWinPrice === shortestPrice;
  }
  const favourite = runners.find((runner) => runner.isFavourite) ?? null;
  const favouriteContext = deriveFavouriteContext({
    favourite,
    historicalStats,
    starterCount: activeRunners.length,
  });

  return {
    advertisedStart: raceCard.advertisedStart,
    candidate: favouriteContext.candidate,
    distance: raceCard.distance ?? null,
    favourite: favourite
      ? {
          ...favourite,
          impliedWinPercentage: Number(((1 / favourite.fixedWinPrice) * 100).toFixed(2)),
          priceBucket: createPriceBucketLabel(getPriceBucketStart(favourite.fixedWinPrice)),
        }
      : null,
    historical: favouriteContext.historical,
    marketMover: runners.find((runner) => runner.isMarketMover) ?? null,
    name: raceCard.name,
    number: raceCard.number,
    raceCardId: raceCard.id,
    runners,
    signal: favouriteContext.signal,
    status: raceCard.status,
    starterCount: activeRunners.length,
    trackCondition: raceCard.trackCondition ?? null,
  };
}

function meetingMatches(meeting, request) {
  if (toRaceCode(meeting.category) !== request.raceCode) {
    return false;
  }

  if (meeting.venue?.country !== request.country) {
    return false;
  }

  const meetingSlugs = [
    meeting.name,
    meeting.venue?.name,
    meeting.meetingCode,
  ].map(toSlug);

  return meetingSlugs.includes(request.courseSlug);
}

/**
 * Fetches public fixed-win odds for either selected race numbers or the full meeting.
 */
export async function fetchTrackRaceOdds(request, historicalStats = {
  byPriceBucket: {},
  byStarterCount: {},
}) {
  const requestedRaceNumbers = request.raceNumbers?.length ? request.raceNumbers : null;
  const sourceDate = request.sourceDate ?? getTodayInSourceTimeZone();
  const racingDay = await graphql("RacingHomeMeetingsDesktopScreen", RACING_DAY_QUERY, {
    categories: [toBetchaCategory(request.raceCode)],
    date: sourceDate,
    regions: ["DOMESTIC"],
  });
  const meetings = racingDay.data?.racingDay?.meetings ?? [];
  const meeting = meetings.find((candidate) => meetingMatches(candidate, {
    ...request,
    sourceDate,
  }));

  if (!meeting) {
    return {
      country: request.country,
      courseSlug: request.courseSlug,
      fetchedAt: new Date().toISOString(),
      meeting: null,
      raceCode: request.raceCode,
      raceNumbers: requestedRaceNumbers ?? [],
      races: [],
      source: SOURCE_NAME,
      sourceDate,
      sourceTimeZone: SOURCE_TIME_ZONE,
      status: "meeting_not_found",
    };
  }

  const sourceRaces = (meeting.races?.nodes ?? [])
    .filter((race) => !requestedRaceNumbers || requestedRaceNumbers.includes(Number(race.number)))
    .sort((left, right) => Number(left.number) - Number(right.number));
  const races = [];

  for (const race of sourceRaces) {
    const response = await graphql("RaceCardLite", RACE_CARD_QUERY, {
      id: toRaceCardId(race.id),
    });
    const raceCard = response.data?.raceCard;

    if (raceCard) {
      races.push(mapRaceCard(raceCard, historicalStats));
    }
  }

  return {
    country: request.country,
    courseSlug: request.courseSlug,
    fetchedAt: new Date().toISOString(),
    meeting: {
      category: meeting.category,
      id: meeting.id,
      name: meeting.name,
      venueCountry: meeting.venue?.country ?? null,
      venueName: meeting.venue?.name ?? null,
    },
    raceCode: request.raceCode,
    raceNumbers: sourceRaces.map((race) => Number(race.number)),
    races,
    source: SOURCE_NAME,
    sourceDate,
    sourceTimeZone: SOURCE_TIME_ZONE,
    status: races.length ? "success" : "races_not_found",
  };
}

/**
 * Builds an audit row for the Supabase request log table.
 */
export function createTrackRaceOddsRequestRow({ errorMessage = null, payload, request, status }) {
  return {
    country: request.country,
    course_slug: request.courseSlug,
    error_message: errorMessage,
    fetched_at: payload?.fetchedAt ?? new Date().toISOString(),
    payload: payload ?? {},
    race_code: request.raceCode,
    race_numbers: payload?.raceNumbers ?? request.raceNumbers ?? [],
    source: SOURCE_NAME,
    source_date: request.sourceDate ?? payload?.sourceDate ?? getTodayInSourceTimeZone(),
    source_time_zone: SOURCE_TIME_ZONE,
    status,
  };
}
