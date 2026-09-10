import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_EVENT_COUNT = 200;
const DEFAULT_MARKETS_FIRST = 80;
const MATCH_WINDOW_HOURS = 6;
const PAGE_SIZE = 1000;
const TAB_SOURCE = {
  endpoint: "https://api.tab.co.nz/graphql",
  source: "tab",
};
const TENNIS_CATEGORY = "TENNIS";
const TENNIS_FIXED_WIN_MARKET_NAME = "match betting";
const SUPPORTED_COMPETITION_ALIASES = new Map([
  ["atp australian open", "tennis_atp_aus_open_singles"],
  ["atp barcelona open", "tennis_atp_barcelona_open"],
  ["atp canadian open", "tennis_atp_canadian_open"],
  ["atp china open", "tennis_atp_china_open"],
  ["atp cincinnati open", "tennis_atp_cincinnati_open"],
  ["atp dubai", "tennis_atp_dubai"],
  ["atp dubai championships", "tennis_atp_dubai"],
  ["atp french open", "tennis_atp_french_open"],
  ["atp halle open", "tennis_atp_halle_open"],
  ["atp hamburg open", "tennis_atp_hamburg_open"],
  ["atp indian wells", "tennis_atp_indian_wells"],
  ["atp italian open", "tennis_atp_italian_open"],
  ["atp madrid open", "tennis_atp_madrid_open"],
  ["atp miami open", "tennis_atp_miami_open"],
  ["atp monte carlo masters", "tennis_atp_monte_carlo_masters"],
  ["atp munich", "tennis_atp_munich"],
  ["atp paris masters", "tennis_atp_paris_masters"],
  ["atp qatar open", "tennis_atp_qatar_open"],
  ["atp queen s club championships", "tennis_atp_queens_club_champ"],
  ["atp shanghai masters", "tennis_atp_shanghai_masters"],
  ["atp us open", "tennis_atp_us_open"],
  ["atp u s open", "tennis_atp_us_open"],
  ["atp washington open", "tennis_atp_washington_open"],
  ["atp wimbledon", "tennis_atp_wimbledon"],
  ["australian open men s singles", "tennis_atp_aus_open_singles"],
  ["french open men s singles", "tennis_atp_french_open"],
  ["u s open men s singles", "tennis_atp_us_open"],
  ["us open men s singles", "tennis_atp_us_open"],
  ["wimbledon men s singles", "tennis_atp_wimbledon"],
  ["wta australian open", "tennis_wta_aus_open_singles"],
  ["wta bad homburg open", "tennis_wta_bad_homburg_open"],
  ["wta canadian open", "tennis_wta_canadian_open"],
  ["wta charleston open", "tennis_wta_charleston_open"],
  ["wta china open", "tennis_wta_china_open"],
  ["wta cincinnati open", "tennis_wta_cincinnati_open"],
  ["wta dubai", "tennis_wta_dubai"],
  ["wta dubai championships", "tennis_wta_dubai"],
  ["wta french open", "tennis_wta_french_open"],
  ["wta german open", "tennis_wta_german_open"],
  ["wta indian wells", "tennis_wta_indian_wells"],
  ["wta italian open", "tennis_wta_italian_open"],
  ["wta madrid open", "tennis_wta_madrid_open"],
  ["wta miami open", "tennis_wta_miami_open"],
  ["wta monterrey open", "tennis_wta_monterrey_open"],
  ["wta qatar open", "tennis_wta_qatar_open"],
  ["wta queen s club championships", "tennis_wta_queens_club_champ"],
  ["wta strasbourg", "tennis_wta_strasbourg"],
  ["wta internationaux de strasbourg", "tennis_wta_strasbourg"],
  ["wta stuttgart open", "tennis_wta_stuttgart_open"],
  ["wta us open", "tennis_wta_us_open"],
  ["wta u s open", "tennis_wta_us_open"],
  ["wta washington open", "tennis_wta_washington_open"],
  ["wta wimbledon", "tennis_wta_wimbledon"],
  ["wta wuhan open", "tennis_wta_wuhan_open"],
  ["australian open women s singles", "tennis_wta_aus_open_singles"],
  ["french open women s singles", "tennis_wta_french_open"],
  ["u s open women s singles", "tennis_wta_us_open"],
  ["us open women s singles", "tennis_wta_us_open"],
  ["wimbledon women s singles", "tennis_wta_wimbledon"],
]);

const TENNIS_COMPETITION_QUERY = `
  query TennisMarketSnapshot(
    $category: SportingCategory!
    $marketsFirst: Int
    $upcomingEventsCount: Int
  ) {
    upcomingEvents: sportingEvents(
      first: $upcomingEventsCount
      category: $category
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
          competition {
            id
            name
            slug
          }
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
              entrants: entrantsConnection(first: 6, matchCard: true) {
                nodes {
                  id
                  name
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
 * Parses the Tennis fixed-win snapshot options for the current TAB market source.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    eventCount: DEFAULT_EVENT_COUNT,
    marketsFirst: DEFAULT_MARKETS_FIRST,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!Number.isInteger(options.eventCount) || options.eventCount < 1) {
    throw new Error("--event-count must be a positive integer.");
  }

  if (!Number.isInteger(options.marketsFirst) || options.marketsFirst < 1) {
    throw new Error("--markets-first must be a positive integer.");
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
 * Reads Supabase service-role write config used by local ingestion scripts.
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
 * Minimal Supabase REST client for Tennis market snapshot writes.
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

/**
 * Builds browser-like headers for the public TAB sports GraphQL request.
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
 * Sends one public TAB sports GraphQL request and surfaces schema errors.
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

  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    throw new Error(`${source.source} GraphQL ${operationName} failed: ${JSON.stringify(payload.errors ?? payload).slice(0, 500)}`);
  }

  return payload.data;
}

/**
 * Converts fractional source odds into decimal fixed-win prices.
 */
function decimalFromOdds(odds) {
  const numerator = Number(odds?.numerator);
  const denominator = Number(odds?.denominator);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator + 1).toFixed(3));
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

function normalizeCompetitionLabel(value) {
  return normalizeName(value)
    .replace(/\bthe\b/g, "")
    .replace(/\bsingles\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps TAB tennis competition names/slugs to supported Odds API tournament keys.
 */
function getOddsApiSportKey(competition) {
  const rawLabels = [
    competition?.slug,
    competition?.name,
    String(competition?.slug ?? "").replace(/-/g, " "),
  ].filter(Boolean);

  for (const label of rawLabels) {
    const mapped = SUPPORTED_COMPETITION_ALIASES.get(normalizeName(label))
      ?? SUPPORTED_COMPETITION_ALIASES.get(normalizeCompetitionLabel(label));

    if (mapped) {
      return mapped;
    }
  }

  return null;
}

function getTourFromSportKey(sportKey) {
  if (String(sportKey).startsWith("tennis_atp_")) {
    return "atp";
  }

  if (String(sportKey).startsWith("tennis_wta_")) {
    return "wta";
  }

  return null;
}

function isDoublesEvent(event) {
  return String(event?.competition?.name ?? "").toLowerCase().includes("doubles")
    || String(event?.competition?.slug ?? "").toLowerCase().includes("doubles")
    || String(event?.name ?? "").includes("/");
}

function isBeforeKickoff(event) {
  const start = new Date(event?.advertisedStart ?? "");

  if (Number.isNaN(start.valueOf())) {
    return false;
  }

  return start.valueOf() > Date.now();
}

function isMatchBettingMarket(market) {
  return normalizeName(market?.name) === TENNIS_FIXED_WIN_MARKET_NAME
    && Number(market?.entrantCount) === 2;
}

function entrantByRole(market, role) {
  return market?.entrants?.nodes?.find((entrant) => entrant.role === role) ?? null;
}

function buildSnapshotKey(source, event, market) {
  return [
    source,
    event.id,
    market.id,
  ].join(":");
}

function selectFavourite(player1, player2) {
  if (!player1.price || !player2.price) {
    return null;
  }

  if (player1.price <= player2.price) {
    return {
      favourite: player1,
      other: player2,
    };
  }

  return {
    favourite: player2,
    other: player1,
  };
}

/**
 * Matches current TAB events against already imported Odds API tennis matches.
 */
function matchExistingTennisMatch(row, matches) {
  const candidates = matches.filter((match) =>
    row.odds_api_sport_key === match.source_sport_key
    && playersMatch(row.player_1_name, match.player_1_name)
    && playersMatch(row.player_2_name, match.player_2_name)
    && isWithinMatchWindow(row.advertised_start_at, match.commence_time));

  return candidates.length === 1 ? candidates[0] : null;
}

function playersMatch(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function isWithinMatchWindow(left, right) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  if (Number.isNaN(leftDate.valueOf()) || Number.isNaN(rightDate.valueOf())) {
    return false;
  }

  return Math.abs(leftDate.valueOf() - rightDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * Fetches already imported Tennis matches for opportunistic snapshot linking.
 */
async function readRecentMatches(supabase) {
  if (!supabase) {
    return [];
  }

  try {
    return await supabase.selectAll("tennis_matches", {
      order: "commence_time.asc",
      select: "id,source_sport_key,commence_time,player_1_name,player_2_name",
      source: "eq.odds_api",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("tennis_matches")) {
      return [];
    }

    throw error;
  }
}

/**
 * Maps TAB tennis Match Betting markets into source-backed fixed-win snapshot rows.
 */
function mapEventToSnapshot(event, officialMatches) {
  if (isDoublesEvent(event) || !isBeforeKickoff(event)) {
    return null;
  }

  const oddsApiSportKey = getOddsApiSportKey(event.competition);
  const tour = getTourFromSportKey(oddsApiSportKey);

  if (!oddsApiSportKey || !tour) {
    return null;
  }

  const market = event.markets?.nodes?.find(isMatchBettingMarket);

  if (!market) {
    return null;
  }

  const player1Entrant = entrantByRole(market, "HOME") ?? market.entrants?.nodes?.[0] ?? null;
  const player2Entrant = entrantByRole(market, "AWAY") ?? market.entrants?.nodes?.[1] ?? null;

  if (!player1Entrant || !player2Entrant || player1Entrant.isSuspended || player2Entrant.isSuspended) {
    return null;
  }

  const player1 = {
    name: player1Entrant.name,
    price: decimalFromOdds(player1Entrant.price?.odds),
  };
  const player2 = {
    name: player2Entrant.name,
    price: decimalFromOdds(player2Entrant.price?.odds),
  };
  const favouritePair = selectFavourite(player1, player2);

  if (!favouritePair) {
    return null;
  }

  const row = {
    advertised_start_at: event.advertisedStart ?? null,
    competition_name: event.competition?.name ?? null,
    competition_slug: event.competition?.slug ?? null,
    favourite_fixed_win_price: favouritePair.favourite.price,
    favourite_player_name: favouritePair.favourite.name,
    market_name: market.name,
    matched_tennis_match_id: null,
    odds_api_sport_key: oddsApiSportKey,
    other_player_fixed_win_price: favouritePair.other.price,
    other_player_name: favouritePair.other.name,
    player_1_fixed_win_price: player1.price,
    player_1_name: player1.name,
    player_2_fixed_win_price: player2.price,
    player_2_name: player2.name,
    raw: {
      competition: event.competition ?? null,
      eventStatus: event.status ?? null,
      marketTypeId: market.marketTypeId ?? null,
    },
    snapshot_at: new Date().toISOString(),
    source: TAB_SOURCE.source,
    source_event_id: event.id,
    source_event_url: event.url ? `https://www.tab.co.nz${event.url}` : null,
    source_market_id: market.id,
    source_snapshot_key: buildSnapshotKey(TAB_SOURCE.source, event, market),
    tour,
  };
  const matchedMatch = matchExistingTennisMatch(row, officialMatches);

  return {
    ...row,
    matched_tennis_match_id: matchedMatch?.id ?? null,
  };
}

/**
 * Fetches current supported TAB Tennis fixed-win snapshots.
 */
async function fetchCurrentSnapshots(options, supabase) {
  const data = await graphql(TAB_SOURCE, "TennisMarketSnapshot", TENNIS_COMPETITION_QUERY, {
    category: TENNIS_CATEGORY,
    marketsFirst: options.marketsFirst,
    upcomingEventsCount: options.eventCount,
  });
  const events = data?.upcomingEvents?.events?.nodes ?? [];
  const officialMatches = await readRecentMatches(supabase);
  const rows = events
    .map((event) => mapEventToSnapshot(event, officialMatches))
    .filter(Boolean);

  return {
    events,
    rows,
  };
}

/**
 * Runs the Tennis TAB fixed-win market snapshot workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const supabaseConfig = getSupabaseWriteConfig();
  const supabase = supabaseConfig
    ? createSupabaseRestClient(supabaseConfig, options.batchSize)
    : null;

  if (options.requireSupabase && !supabase) {
    throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const result = await fetchCurrentSnapshots(options, supabase);

  if (options.dryRun || !supabase) {
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      sample: result.rows.slice(0, 10).map((row) => ({
        competition: row.competition_name,
        favourite: row.favourite_player_name,
        match: `${row.player_1_name} vs ${row.player_2_name}`,
        oddsApiSportKey: row.odds_api_sport_key,
        price: row.favourite_fixed_win_price,
        start: row.advertised_start_at,
      })),
      summary: {
        capturedRows: result.rows.length,
        sourceEvents: result.events.length,
        supportedCompetitions: Array.from(new Set(result.rows.map((row) => row.competition_name))).sort(),
      },
    }, null, 2));
    return;
  }

  await supabase.upsert("tennis_market_snapshots", result.rows, "source_snapshot_key");
  console.log(JSON.stringify({
    summary: {
      sourceEvents: result.events.length,
      tennisMarketSnapshots: result.rows.length,
    },
    supabaseWrite: {
      ok: true,
      skipped: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
