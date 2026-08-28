const DEFAULT_ENTRANTS_FIRST = 60;
const DEFAULT_EVENT_COUNT = 8;
const DEFAULT_MARKETS_FIRST = 240;
const DEFAULT_SAMPLE_ENTRANTS = 5;
const NRL_CATEGORY = "RUGBY_LEAGUE";
const NRL_COMPETITION_SLUG = "nrl";
const TAB_SOURCE = {
  endpoint: "https://api.tab.co.nz/graphql",
  label: "NRL market source",
  source: "tab",
};
const PRIMARY_TRY_SCORER_MARKET_NAME = "anytime try scorer";
const RELATED_TRY_SCORER_MARKET_KEYWORDS = ["try scorer", "tryscorer", "to score 2", "hat trick"];

const NRL_TRY_SCORER_MARKET_VALIDATION_QUERY = `
  query NrlTryScorerMarketValidation(
    $category: SportingCategory!
    $competitionSlug: String!
    $entrantsFirst: Int!
    $marketsFirst: Int!
    $upcomingEventsCount: Int
  ) {
    upcomingEvents: sportingEvents(
      first: $upcomingEventsCount
      category: $category
      competitionSlug: $competitionSlug
      eventTypes: [MATCH]
      statuses: [OPEN]
      groupBy: UNSPECIFIED
    ) {
      events {
        nodes {
          id
          name
          url
          advertisedStart
          bettingStatus
          status
          markets: marketsConnection(
            first: $marketsFirst
            status: [OPEN]
            excludeSuspended: true
          ) {
            nodes {
              id
              name
              marketTypeId
              status
              entrantCount
              entrants: entrantsConnection(first: $entrantsFirst) {
                nodes {
                  id
                  name
                  handicap
                  isSuspended
                  role
                  price {
                    id
                    odds {
                      numerator
                      denominator
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Parses read-only NRL try-scorer market validation options.
 */
function parseArgs(argv) {
  const options = {
    entrantsFirst: DEFAULT_ENTRANTS_FIRST,
    eventCount: DEFAULT_EVENT_COUNT,
    includeMarketNames: false,
    marketsFirst: DEFAULT_MARKETS_FIRST,
    sampleEntrants: DEFAULT_SAMPLE_ENTRANTS,
    source: "tab",
  };

  for (const arg of argv) {
    if (arg === "--include-market-names") {
      options.includeMarketNames = true;
    } else if (arg.startsWith("--entrants-first=")) {
      options.entrantsFirst = Number(arg.slice("--entrants-first=".length));
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    } else if (arg.startsWith("--sample-entrants=")) {
      options.sampleEntrants = Number(arg.slice("--sample-entrants=".length));
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    }
  }

  if (options.source !== "tab") {
    throw new Error("--source must be tab.");
  }

  if (!Number.isInteger(options.eventCount) || options.eventCount < 1) {
    throw new Error("--event-count must be a positive integer.");
  }

  if (!Number.isInteger(options.marketsFirst) || options.marketsFirst < 1) {
    throw new Error("--markets-first must be a positive integer.");
  }

  if (!Number.isInteger(options.entrantsFirst) || options.entrantsFirst < 1) {
    throw new Error("--entrants-first must be a positive integer.");
  }

  if (!Number.isInteger(options.sampleEntrants) || options.sampleEntrants < 0) {
    throw new Error("--sample-entrants must be zero or a positive integer.");
  }

  return options;
}

/**
 * Builds browser-like headers for the NRL market source request.
 */
function getGraphqlHeaders() {
  const origin = "https://www.tab.co.nz";

  return {
    accept: "*/*",
    "accept-language": "en-NZ,en;q=0.9",
    "content-type": "application/json",
    origin,
    referer: `${origin}/`,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
}

/**
 * Sends one public sports GraphQL request and surfaces schema errors.
 */
async function graphql(source, operationName, query, variables) {
  const response = await fetch(source.endpoint, {
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
    headers: getGraphqlHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${source.label} ${operationName} failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`${source.label} ${operationName} returned an empty response body`);
  }

  const payload = JSON.parse(text);

  if (payload.errors?.length) {
    const messages = payload.errors.map((error) => error.message).join("; ");
    throw new Error(`${source.label} ${operationName} returned GraphQL errors: ${messages}`);
  }

  return payload;
}

/**
 * Normalizes source names for keyword matching.
 */
function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fractionalOddsToDecimal(odds) {
  const numerator = toNullableNumber(odds?.numerator);
  const denominator = toNullableNumber(odds?.denominator);

  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return Number((1 + numerator / denominator).toFixed(3));
}

/**
 * Checks if a market name is the exact player try-scorer price source needed.
 */
function isPrimaryTryScorerMarketName(name) {
  return normalizeName(name) === PRIMARY_TRY_SCORER_MARKET_NAME;
}

/**
 * Checks if a market name is adjacent to player try-scorer access.
 */
function isRelatedTryScorerMarketName(name) {
  const normalized = normalizeName(name);

  return !isPrimaryTryScorerMarketName(name)
    && RELATED_TRY_SCORER_MARKET_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Keeps market summaries compact enough for terminal review.
 */
function mapEntrant(entrant) {
  return {
    decimalOdds: fractionalOddsToDecimal(entrant?.price?.odds),
    handicap: entrant?.handicap ?? null,
    id: entrant?.id ?? null,
    isSuspended: entrant?.isSuspended ?? null,
    name: entrant?.name ?? null,
    priceId: entrant?.price?.id ?? null,
    role: entrant?.role ?? null,
  };
}

/**
 * Summarizes one market and includes entrant samples for candidate markets.
 */
function mapMarket(market, includeEntrants = false, sampleEntrants = DEFAULT_SAMPLE_ENTRANTS) {
  const entrants = market?.entrants?.nodes ?? [];
  const pricedEntrants = entrants.filter((entrant) =>
    fractionalOddsToDecimal(entrant?.price?.odds) !== null);

  return {
    entrantCount: market?.entrantCount ?? null,
    id: market?.id ?? null,
    marketTypeId: market?.marketTypeId ?? null,
    name: market?.name ?? null,
    pricedEntrants: pricedEntrants.length,
    sampleEntrants: includeEntrants ? entrants.slice(0, sampleEntrants).map(mapEntrant) : undefined,
    status: market?.status ?? null,
  };
}

/**
 * Builds a read-only validation summary for each upcoming NRL event.
 */
function mapEvent(event, options) {
  const markets = event?.markets?.nodes ?? [];
  const primaryMarkets = markets.filter((market) => isPrimaryTryScorerMarketName(market?.name));
  const relatedMarkets = markets.filter((market) => isRelatedTryScorerMarketName(market?.name));

  return {
    advertisedStart: event?.advertisedStart ?? null,
    bettingStatus: event?.bettingStatus ?? null,
    id: event?.id ?? null,
    marketCount: markets.length,
    name: event?.name ?? null,
    primaryTryScorerMarketCount: primaryMarkets.length,
    primaryTryScorerMarkets: primaryMarkets.map((market) => mapMarket(market, true, options.sampleEntrants)),
    relatedTryScorerMarketCount: relatedMarkets.length,
    relatedTryScorerMarketNames: uniqueSorted(relatedMarkets.map((market) => market?.name)),
    status: event?.status ?? null,
    url: event?.url ?? null,
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    String(left).localeCompare(String(right)));
}

/**
 * Runs the read-only NRL try-scorer market validation probe.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = await graphql(
    TAB_SOURCE,
    "NrlTryScorerMarketValidation",
    NRL_TRY_SCORER_MARKET_VALIDATION_QUERY,
    {
      category: NRL_CATEGORY,
      competitionSlug: NRL_COMPETITION_SLUG,
      entrantsFirst: options.entrantsFirst,
      marketsFirst: options.marketsFirst,
      upcomingEventsCount: options.eventCount,
    },
  );
  const events = payload.data?.upcomingEvents?.events?.nodes ?? [];
  const marketNames = uniqueSorted(events.flatMap((event) =>
    (event?.markets?.nodes ?? []).map((market) => market?.name)));
  const eventSummaries = events.map((event) => mapEvent(event, options));
  const primaryTryScorerMarketCount = eventSummaries.reduce((total, event) =>
    total + event.primaryTryScorerMarketCount, 0);
  const primaryTryScorerEntrantCount = eventSummaries.reduce((total, event) =>
    total + event.primaryTryScorerMarkets.reduce((marketTotal, market) =>
      marketTotal + Number(market.entrantCount ?? 0), 0), 0);
  const pricedPrimaryTryScorerEntrants = eventSummaries.reduce((total, event) =>
    total + event.primaryTryScorerMarkets.reduce((marketTotal, market) =>
      marketTotal + market.pricedEntrants, 0), 0);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    options,
    result: {
      eventCount: events.length,
      marketNameCount: marketNames.length,
      pricedPrimaryTryScorerEntrants,
      primaryTryScorerEntrantCount,
      primaryTryScorerMarketCount,
      source: TAB_SOURCE.source,
    },
    primaryTryScorerMarketNames: uniqueSorted(eventSummaries.flatMap((event) =>
      event.primaryTryScorerMarkets.map((market) => market.name))),
    events: eventSummaries,
    marketNames: options.includeMarketNames ? marketNames : undefined,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
