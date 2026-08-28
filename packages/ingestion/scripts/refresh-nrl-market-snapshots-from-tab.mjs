import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_EVENT_COUNT = 20;
const MATCH_WINDOW_HOURS = 4;
const NRL_CATEGORY = "RUGBY_LEAGUE";
const NRL_COMPETITION_SLUG = "nrl";
const NRL_FIXED_WIN_MARKET_NAME = "match betting";
const TAB_SOURCE = {
  endpoint: "https://api.tab.co.nz/graphql",
  label: "NRL market source",
  source: "tab",
};

const NRL_COMPETITION_QUERY = `
  query SportingCompetitionScreen(
    $category: SportingCategory!
    $competitionSlug: String!
    $upcomingEventsCount: Int
  ) {
    league: sportingCompetitionBySlug(
      category: $category
      competitionSlug: $competitionSlug
      statuses: [OPEN]
    ) {
      id
      name
      url
    }
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
            first: 240
            status: [OPEN]
            excludeSuspended: true
          ) {
            nodes {
              id
              name
              marketTypeId
              status
              entrantCount
              entrants: entrantsConnection(first: 8, matchCard: true) {
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
 * Parses the NRL fixed-win snapshot options for the current market source.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    eventCount: DEFAULT_EVENT_COUNT,
    requireSupabase: false,
    source: "tab",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (options.source !== "tab") {
    throw new Error("--source must be tab.");
  }

  if (!Number.isInteger(options.eventCount) || options.eventCount < 1) {
    throw new Error("--event-count must be a positive integer.");
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

function getEventSourceId(event) {
  return String(event?.id ?? "").replace(/^SportingEvent:/, "");
}

function findFixedWinMarket(event) {
  return (event.markets?.nodes ?? []).find((market) =>
    normalizeName(market?.name) === NRL_FIXED_WIN_MARKET_NAME);
}

function findEntrantByRole(market, role) {
  return (market.entrants?.nodes ?? []).find((entrant) =>
    entrant?.role === role && entrant?.isSuspended !== true);
}

function getFavourite(homeTeamName, homePrice, awayTeamName, awayPrice) {
  if (!Number.isFinite(homePrice) || !Number.isFinite(awayPrice) || homePrice === awayPrice) {
    return {
      favouriteFixedWinPrice: null,
      favouriteTeamName: null,
    };
  }

  return homePrice < awayPrice
    ? {
        favouriteFixedWinPrice: homePrice,
        favouriteTeamName: homeTeamName,
      }
    : {
        favouriteFixedWinPrice: awayPrice,
        favouriteTeamName: awayTeamName,
      };
}

function addHours(isoString, hours) {
  const date = new Date(isoString);

  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function isWithinMatchWindow(snapshotStart, matchKickoff) {
  const snapshotDate = new Date(snapshotStart);
  const matchDate = new Date(matchKickoff);

  if (Number.isNaN(snapshotDate.valueOf()) || Number.isNaN(matchDate.valueOf())) {
    return false;
  }

  return Math.abs(snapshotDate.valueOf() - matchDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * Prevents fixed-win market rows from being captured after advertised kickoff.
 */
function isBeforeAdvertisedStart(event, generatedAt) {
  const start = new Date(event?.advertisedStart);
  const snapshot = new Date(generatedAt);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(snapshot.valueOf())) {
    return false;
  }

  return snapshot.valueOf() < start.valueOf();
}

function namesMatch(left, right) {
  const leftName = normalizeName(left);
  const rightName = normalizeName(right);

  if (!leftName || !rightName) {
    return false;
  }

  if (leftName === rightName) {
    return true;
  }

  return leftName.endsWith(` ${rightName}`) || rightName.endsWith(` ${leftName}`);
}

function sameTeams(snapshot, match) {
  return namesMatch(snapshot.home_team_name, match.home_team_name)
    && namesMatch(snapshot.away_team_name, match.away_team_name);
}

function matchExistingNrlMatch(snapshot, matches) {
  const candidates = matches.filter((match) =>
    sameTeams(snapshot, match) && isWithinMatchWindow(snapshot.advertised_start_at, match.kickoff_at));

  return candidates.length === 1 ? candidates[0] : null;
}

function mapSnapshot(source, event, generatedAt, officialMatches) {
  if (!isBeforeAdvertisedStart(event, generatedAt)) {
    return null;
  }

  const market = findFixedWinMarket(event);

  if (!market) {
    return null;
  }

  const home = findEntrantByRole(market, "HOME");
  const away = findEntrantByRole(market, "AWAY");
  const homePrice = fractionalOddsToDecimal(home?.price?.odds);
  const awayPrice = fractionalOddsToDecimal(away?.price?.odds);

  if (!home?.name || !away?.name || homePrice === null || awayPrice === null) {
    return null;
  }

  const favourite = getFavourite(home.name, homePrice, away.name, awayPrice);
  const sourceEventId = getEventSourceId(event);
  const snapshot = {
    advertised_start_at: event.advertisedStart ?? null,
    away_fixed_win_price: awayPrice,
    away_team_name: away.name,
    favourite_fixed_win_price: favourite.favouriteFixedWinPrice,
    favourite_team_name: favourite.favouriteTeamName,
    home_fixed_win_price: homePrice,
    home_team_name: home.name,
    market_name: market.name,
    raw: {
      bettingStatus: event.bettingStatus ?? null,
      entrantIds: {
        away: away.id ?? null,
        home: home.id ?? null,
      },
      eventName: event.name ?? null,
      eventStatus: event.status ?? null,
      marketTypeId: market.marketTypeId ?? null,
      odds: {
        away: away.price?.odds ?? null,
        home: home.price?.odds ?? null,
      },
    },
    snapshot_at: generatedAt,
    source: source.source,
    source_event_id: sourceEventId,
    source_event_url: event.url ?? null,
    source_market_id: String(market.id ?? "").replace(/^SportingMarket:/, "") || null,
    source_snapshot_key: [
      source.source,
      sourceEventId,
      String(market.id ?? "match-betting").replace(/^SportingMarket:/, ""),
      generatedAt,
    ].join(":"),
  };
  const matchedMatch = matchExistingNrlMatch(snapshot, officialMatches);

  return {
    ...snapshot,
    matched_nrl_match_id: matchedMatch?.id ?? null,
  };
}

/**
 * Fetches current NRL fixed-win snapshots from the selected public market source.
 */
async function fetchSnapshots(options, officialMatches) {
  const generatedAt = new Date().toISOString();
  const rows = [];
  const sources = [];

  for (const source of [TAB_SOURCE]) {
    const response = await graphql(source, "SportingCompetitionScreen", NRL_COMPETITION_QUERY, {
      category: NRL_CATEGORY,
      competitionSlug: NRL_COMPETITION_SLUG,
      upcomingEventsCount: options.eventCount,
    });
    const events = response.data?.upcomingEvents?.events?.nodes ?? [];
    const snapshots = events
      .map((event) => mapSnapshot(source, event, generatedAt, officialMatches))
      .filter(Boolean);

    sources.push({
      errors: events.length - snapshots.length,
      eventCount: events.length,
      fixedWinSnapshots: snapshots.length,
      label: source.label,
      source: source.source,
    });
    rows.push(...snapshots);
  }

  return {
    generatedAt,
    rows,
    sources,
  };
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for NRL market snapshot reads and writes.
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
    upsert,
  };
}

async function fetchOfficialMatchesForWindow(config, rows, batchSize) {
  if (!config || !rows.length) {
    return [];
  }

  const starts = rows
    .map((row) => row.advertised_start_at)
    .filter(Boolean)
    .sort();

  if (!starts.length) {
    return [];
  }

  const from = addHours(starts[0], -MATCH_WINDOW_HOURS);
  const to = addHours(starts[starts.length - 1], MATCH_WINDOW_HOURS);

  if (!from || !to) {
    return [];
  }

  const supabase = createSupabaseRestClient(config, batchSize);

  return await supabase.request("nrl_matches", {
    search: {
      and: `(kickoff_at.gte.${from},kickoff_at.lte.${to})`,
      order: "kickoff_at.asc",
      select: "id,source,source_match_id,kickoff_at,home_team_name,away_team_name",
      source: "eq.official_nrl",
    },
  });
}

async function rematchRows(config, rows, batchSize) {
  const officialMatches = await fetchOfficialMatchesForWindow(config, rows, batchSize);

  if (!officialMatches.length) {
    return {
      matchedRows: rows,
      officialMatches,
    };
  }

  return {
    matchedRows: rows.map((row) => ({
      ...row,
      matched_nrl_match_id: matchExistingNrlMatch(row, officialMatches)?.id ?? null,
    })),
    officialMatches,
  };
}

async function writeRows(rows, options) {
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

  const { matchedRows, officialMatches } = await rematchRows(config, rows, options.batchSize);
  const supabase = createSupabaseRestClient(config, options.batchSize);

  await supabase.upsert("nrl_market_snapshots", matchedRows, "source_snapshot_key");

  return {
    matchedSnapshots: matchedRows.filter((row) => row.matched_nrl_match_id).length,
    nrlMarketSnapshots: matchedRows.length,
    officialMatchesChecked: officialMatches.length,
    ok: true,
    skipped: false,
  };
}

function summarize(snapshotResult, officialMatches) {
  return {
    generatedAt: snapshotResult.generatedAt,
    matchedSnapshots: snapshotResult.rows.filter((row) => row.matched_nrl_match_id).length,
    nrlMarketSnapshots: snapshotResult.rows.length,
    officialMatchesChecked: officialMatches.length,
    sources: snapshotResult.sources,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const config = getSupabaseWriteConfig();
  const snapshotResult = await fetchSnapshots(options, []);
  const { matchedRows, officialMatches } = await rematchRows(config, snapshotResult.rows, options.batchSize);
  const matchedSnapshotResult = {
    ...snapshotResult,
    rows: matchedRows,
  };
  const summary = summarize(matchedSnapshotResult, officialMatches);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: matchedRows.slice(0, 5).map((row) => ({
        advertisedStart: row.advertised_start_at,
        away: {
          name: row.away_team_name,
          price: row.away_fixed_win_price,
        },
        favourite: {
          name: row.favourite_team_name,
          price: row.favourite_fixed_win_price,
        },
        home: {
          name: row.home_team_name,
          price: row.home_fixed_win_price,
        },
        matchedNrlMatchId: row.matched_nrl_match_id,
        source: row.source,
        sourceEventId: row.source_event_id,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(matchedRows, options);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
