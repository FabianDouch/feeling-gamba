import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_EVENT_COUNT = 20;
const DEFAULT_LIMIT = 1000;
const DEFAULT_MARKETS_FIRST = 500;
const MATCH_WINDOW_HOURS = 4;
const TAB_SOURCE = {
  endpoint: "https://api.tab.co.nz/graphql",
  source: "tab",
};

const COMPETITION_QUERY = `
  query SportingCompetitionScreen(
    $category: SportingCategory!
    $competitionSlug: String!
    $marketsFirst: Int
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
              entrants: entrantsConnection(first: 24, matchCard: true) {
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
 * Parses shared half-time/full-time market capture options.
 */
function parseCaptureArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    eventCount: DEFAULT_EVENT_COUNT,
    marketsFirst: DEFAULT_MARKETS_FIRST,
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
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
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

  if (!Number.isInteger(options.marketsFirst) || options.marketsFirst < 1) {
    throw new Error("--markets-first must be a positive integer.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

/**
 * Parses shared half-time/full-time settlement reconciliation options.
 */
function parseReconcileArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    limit: DEFAULT_LIMIT,
    requireSupabase: false,
    source: "all",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!["all", "tab"].includes(options.source)) {
    throw new Error("--source must be all or tab.");
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
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

/**
 * Keeps HT/FT market capture to one mutable row per source event.
 */
function getSourceSnapshotKey(source, sourceEventId) {
  return [
    source.source,
    sourceEventId,
  ].join(":");
}

function findFixedWinMarket(event) {
  return (event.markets?.nodes ?? []).find((market) =>
    normalizeName(market?.name) === "match betting");
}

function findHalfTimeFullTimeMarket(event) {
  return (event.markets?.nodes ?? []).find((market) => {
    const name = normalizeName(market?.name);
    return /half.*full.*time/.test(name) || /halftime.*fulltime/.test(name);
  });
}

function findEntrantByRole(market, role) {
  return (market?.entrants?.nodes ?? []).find((entrant) =>
    entrant?.role === role && entrant?.isSuspended !== true);
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

function teamAliases(teamName) {
  const normalized = normalizeName(teamName);
  const parts = normalized.split(" ").filter(Boolean);
  return [
    normalized,
    parts.at(-1) ?? "",
  ].filter(Boolean);
}

function splitDoubleSelectionName(value) {
  return String(value ?? "")
    .split(/\s*(?:\/|\||-|\u2013|\u2014)\s*/u)
    .map(normalizeName)
    .filter(Boolean);
}

function sameTeamDoubleNameMatches(selectionName, teamName, roleName) {
  const normalizedSelection = normalizeName(selectionName);
  const role = normalizeName(roleName);
  const parts = splitDoubleSelectionName(selectionName);

  if (parts.length >= 2) {
    const [halfTimePart, fullTimePart] = parts;
    if (halfTimePart === role && fullTimePart === role) {
      return true;
    }

    return namesMatch(halfTimePart, teamName) && namesMatch(fullTimePart, teamName);
  }

  for (const alias of teamAliases(teamName)) {
    if (normalizedSelection === `${alias} ${alias}`) {
      return true;
    }
  }

  return normalizedSelection === `${role} ${role}`;
}

function findSameTeamDoubleEntrant(market, teamName, roleName) {
  return (market?.entrants?.nodes ?? []).find((entrant) =>
    entrant?.isSuspended !== true && sameTeamDoubleNameMatches(entrant?.name, teamName, roleName));
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

function isBeforeAdvertisedStart(event, generatedAt) {
  const start = new Date(event?.advertisedStart);
  const snapshot = new Date(generatedAt);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(snapshot.valueOf())) {
    return false;
  }

  return snapshot.valueOf() < start.valueOf();
}

function sameTeams(snapshot, match) {
  return namesMatch(snapshot.home_team_name, match.home_team_name)
    && namesMatch(snapshot.away_team_name, match.away_team_name);
}

function matchExistingMatch(snapshot, matches) {
  const candidates = matches.filter((match) =>
    sameTeams(snapshot, match) && isWithinMatchWindow(snapshot.advertised_start_at, match.kickoff_at));

  return candidates.length === 1 ? candidates[0] : null;
}

function getMatchedColumn(sport) {
  return `matched_${sport}_match_id`;
}

/**
 * Converts one open TAB event into the same-team HT/FT double snapshot row.
 */
function mapSnapshot(config, source, event, generatedAt, officialMatches) {
  if (!isBeforeAdvertisedStart(event, generatedAt)) {
    return null;
  }

  const fixedWinMarket = findFixedWinMarket(event);
  const market = findHalfTimeFullTimeMarket(event);

  if (!fixedWinMarket || !market) {
    return null;
  }

  const home = findEntrantByRole(fixedWinMarket, "HOME");
  const away = findEntrantByRole(fixedWinMarket, "AWAY");

  if (!home?.name || !away?.name) {
    return null;
  }

  const homeHome = findSameTeamDoubleEntrant(market, home.name, "home");
  const awayAway = findSameTeamDoubleEntrant(market, away.name, "away");
  const homeHomePrice = fractionalOddsToDecimal(homeHome?.price?.odds);
  const awayAwayPrice = fractionalOddsToDecimal(awayAway?.price?.odds);

  if (homeHomePrice === null || awayAwayPrice === null) {
    return null;
  }

  const favourite = getFavourite(home.name, homeHomePrice, away.name, awayAwayPrice);
  const sourceEventId = getEventSourceId(event);
  const sourceMarketId = String(market.id ?? "").replace(/^SportingMarket:/, "") || null;
  const snapshot = {
    advertised_start_at: event.advertisedStart ?? null,
    away_away_fixed_win_price: awayAwayPrice,
    away_team_name: away.name,
    favourite_fixed_win_price: favourite.favouriteFixedWinPrice,
    favourite_team_name: favourite.favouriteTeamName,
    home_home_fixed_win_price: homeHomePrice,
    home_team_name: home.name,
    market_name: market.name,
    raw: {
      bettingStatus: event.bettingStatus ?? null,
      entrantIds: {
        awayAway: awayAway?.id ?? null,
        fixedAway: away.id ?? null,
        fixedHome: home.id ?? null,
        homeHome: homeHome?.id ?? null,
      },
      entrantNames: {
        awayAway: awayAway?.name ?? null,
        homeHome: homeHome?.name ?? null,
      },
      eventName: event.name ?? null,
      eventStatus: event.status ?? null,
      marketTypeId: market.marketTypeId ?? null,
      odds: {
        awayAway: awayAway?.price?.odds ?? null,
        homeHome: homeHome?.price?.odds ?? null,
      },
    },
    snapshot_at: generatedAt,
    source: source.source,
    source_event_id: sourceEventId,
    source_event_url: event.url ?? null,
    source_market_id: sourceMarketId,
    source_snapshot_key: getSourceSnapshotKey(source, sourceEventId),
  };
  const matchedMatch = matchExistingMatch(snapshot, officialMatches);

  return {
    ...snapshot,
    [getMatchedColumn(config.sport)]: matchedMatch?.id ?? null,
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
 * Minimal Supabase REST client for team-sport HT/FT reads and writes.
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

async function fetchOfficialMatchesForWindow(config, scriptConfig, rows, batchSize) {
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

  return await supabase.request(scriptConfig.matchTable, {
    search: {
      and: `(kickoff_at.gte.${from},kickoff_at.lte.${to})`,
      order: "kickoff_at.asc",
      select: "id,source,source_match_id,kickoff_at,home_team_name,away_team_name",
      source: `eq.${scriptConfig.officialSource}`,
    },
  });
}

async function rematchRows(config, scriptConfig, rows, batchSize) {
  const officialMatches = await fetchOfficialMatchesForWindow(config, scriptConfig, rows, batchSize);

  if (!officialMatches.length) {
    return {
      matchedRows: rows,
      officialMatches,
    };
  }

  return {
    matchedRows: rows.map((row) => ({
      ...row,
      [getMatchedColumn(scriptConfig.sport)]: matchExistingMatch(row, officialMatches)?.id ?? null,
    })),
    officialMatches,
  };
}

async function fetchSnapshots(scriptConfig, options) {
  const generatedAt = new Date().toISOString();
  const rows = [];
  const sources = [];

  for (const source of [{ ...TAB_SOURCE, label: scriptConfig.sourceLabel }]) {
    const response = await graphql(source, "SportingCompetitionScreen", COMPETITION_QUERY, {
      category: scriptConfig.category,
      competitionSlug: scriptConfig.competitionSlug,
      marketsFirst: options.marketsFirst,
      upcomingEventsCount: options.eventCount,
    });
    const events = response.data?.upcomingEvents?.events?.nodes ?? [];
    const fixedWinMarketCount = events.filter((event) => findFixedWinMarket(event)).length;
    const halfTimeFullTimeMarketCount = events.filter((event) => findHalfTimeFullTimeMarket(event)).length;
    const sameTeamDoubleCandidateCount = events.filter((event) => {
      const fixedWinMarket = findFixedWinMarket(event);
      const market = findHalfTimeFullTimeMarket(event);
      const home = findEntrantByRole(fixedWinMarket, "HOME");
      const away = findEntrantByRole(fixedWinMarket, "AWAY");

      return home?.name
        && away?.name
        && findSameTeamDoubleEntrant(market, home.name, "home")
        && findSameTeamDoubleEntrant(market, away.name, "away");
    }).length;
    const snapshots = events
      .map((event) => mapSnapshot(scriptConfig, source, event, generatedAt, []))
      .filter(Boolean);

    sources.push({
      errors: events.length - snapshots.length,
      eventCount: events.length,
      fixedWinMarkets: fixedWinMarketCount,
      halfTimeFullTimeMarkets: halfTimeFullTimeMarketCount,
      halfTimeFullTimeSnapshots: snapshots.length,
      label: source.label,
      sameTeamDoubleCandidates: sameTeamDoubleCandidateCount,
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

async function writeSnapshotRows(scriptConfig, rows, options) {
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

  const { matchedRows, officialMatches } = await rematchRows(config, scriptConfig, rows, options.batchSize);
  const supabase = createSupabaseRestClient(config, options.batchSize);

  await supabase.upsert(scriptConfig.snapshotTable, matchedRows, "source_snapshot_key");

  return {
    [`${scriptConfig.sport}HalfTimeFullTimeSnapshots`]: matchedRows.length,
    matchedSnapshots: matchedRows.filter((row) => row[getMatchedColumn(scriptConfig.sport)]).length,
    officialMatchesChecked: officialMatches.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Runs one team-sport HT/FT double market capture workflow.
 */
export async function runHalfTimeFullTimeCapture(scriptConfig, argv) {
  const options = parseCaptureArgs(argv);
  await loadDotEnvFiles();

  const config = getSupabaseWriteConfig();
  const snapshotResult = await fetchSnapshots(scriptConfig, options);
  const { matchedRows, officialMatches } = await rematchRows(config, scriptConfig, snapshotResult.rows, options.batchSize);
  const matchedSnapshotResult = {
    ...snapshotResult,
    rows: matchedRows,
  };
  const summary = {
    generatedAt: matchedSnapshotResult.generatedAt,
    halfTimeFullTimeSnapshots: matchedSnapshotResult.rows.length,
    matchedSnapshots: matchedSnapshotResult.rows.filter((row) => row[getMatchedColumn(scriptConfig.sport)]).length,
    officialMatchesChecked: officialMatches.length,
    sources: matchedSnapshotResult.sources,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: matchedRows.slice(0, 5).map((row) => ({
        advertisedStart: row.advertised_start_at,
        awayAway: {
          name: row.away_team_name,
          price: row.away_away_fixed_win_price,
        },
        favourite: {
          name: row.favourite_team_name,
          price: row.favourite_fixed_win_price,
        },
        homeHome: {
          name: row.home_team_name,
          price: row.home_home_fixed_win_price,
        },
        market: row.market_name,
        matchedMatchId: row[getMatchedColumn(scriptConfig.sport)],
        source: row.source,
        sourceEventId: row.source_event_id,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeSnapshotRows(scriptConfig, matchedRows, options);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

function selectCanonicalSnapshots(snapshots) {
  const latestByMarket = new Map();

  for (const snapshot of snapshots) {
    const key = [
      snapshot.source,
      snapshot.source_event_id,
    ].join(":");
    const existing = latestByMarket.get(key);

    if (!existing || String(snapshot.snapshot_at ?? "") > String(existing.snapshot_at ?? "")) {
      latestByMarket.set(key, snapshot);
    }
  }

  return Array.from(latestByMarket.values())
    .sort((left, right) => String(left.snapshot_at ?? "").localeCompare(String(right.snapshot_at ?? "")));
}

async function readSnapshots(supabase, scriptConfig, options) {
  const search = {
    limit: String(options.limit),
    order: "snapshot_at.asc",
    select: [
      "id",
      "source",
      "source_snapshot_key",
      "source_event_id",
      "source_event_url",
      "source_market_id",
      getMatchedColumn(scriptConfig.sport),
      "snapshot_at",
      "advertised_start_at",
      "home_team_name",
      "away_team_name",
      "home_home_fixed_win_price",
      "away_away_fixed_win_price",
      "favourite_team_name",
      "favourite_fixed_win_price",
    ].join(","),
  };

  if (options.source !== "all") {
    search.source = `eq.${options.source}`;
  }

  const rows = await supabase.request(scriptConfig.snapshotTable, {
    search,
  });

  return selectCanonicalSnapshots(rows);
}

async function readMatches(supabase, scriptConfig, snapshots) {
  const matchedColumn = getMatchedColumn(scriptConfig.sport);
  const matchIds = Array.from(new Set(
    snapshots
      .map((snapshot) => snapshot[matchedColumn])
      .filter(Boolean),
  ));

  if (!matchIds.length) {
    return new Map();
  }

  const rows = await supabase.request(scriptConfig.matchTable, {
    search: {
      id: `in.(${matchIds.join(",")})`,
      select: [
        "id",
        "source",
        "source_match_id",
        "result_status",
        "home_team_name",
        "away_team_name",
        "home_team_source_id",
        "away_team_source_id",
        "home_half_time_score",
        "away_half_time_score",
        "home_score",
        "away_score",
      ].join(","),
    },
  });

  return new Map(rows.map((row) => [row.id, row]));
}

function isSettledMatch(match) {
  return match?.result_status === "settled"
    && Number.isFinite(Number(match.home_score))
    && Number.isFinite(Number(match.away_score));
}

function hasHalfTimeScore(match) {
  return Number.isFinite(Number(match?.home_half_time_score))
    && Number.isFinite(Number(match?.away_half_time_score));
}

function determineWinnerFromScores(match, homeScoreKey, awayScoreKey) {
  const homeScore = Number(match[homeScoreKey]);
  const awayScore = Number(match[awayScoreKey]);

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore
    ? {
        name: match.home_team_name,
        sourceTeamId: match.home_team_source_id,
      }
    : {
        name: match.away_team_name,
        sourceTeamId: match.away_team_source_id,
      };
}

function calculateReturn(won, price) {
  if (won === null || won === undefined) {
    return null;
  }

  if (won !== true || !Number.isFinite(Number(price))) {
    return 0;
  }

  return Number(Number(price).toFixed(3));
}

function buildResultRow(scriptConfig, snapshot, match, halfTimeWinner, fullTimeWinner, outcome) {
  return {
    advertised_start_at: snapshot.advertised_start_at,
    away_away_fixed_win_price: snapshot.away_away_fixed_win_price,
    away_half_time_score: match?.away_half_time_score ?? null,
    away_score: match?.away_score ?? null,
    away_team_name: snapshot.away_team_name,
    away_team_won: outcome.awayTeamWon,
    away_win_return: calculateReturn(outcome.awayTeamWon, snapshot.away_away_fixed_win_price),
    favourite_fixed_win_price: snapshot.favourite_fixed_win_price,
    favourite_team_name: snapshot.favourite_team_name,
    favourite_win_return: calculateReturn(outcome.favouriteWon, snapshot.favourite_fixed_win_price),
    favourite_won: outcome.favouriteWon,
    full_time_winner_team_name: fullTimeWinner?.name ?? null,
    full_time_winner_team_source_id: fullTimeWinner?.sourceTeamId ?? null,
    half_time_full_time_snapshot_id: snapshot.id,
    half_time_winner_team_name: halfTimeWinner?.name ?? null,
    half_time_winner_team_source_id: halfTimeWinner?.sourceTeamId ?? null,
    home_half_time_score: match?.home_half_time_score ?? null,
    home_home_fixed_win_price: snapshot.home_home_fixed_win_price,
    home_score: match?.home_score ?? null,
    home_team_name: snapshot.home_team_name,
    home_team_won: outcome.homeTeamWon,
    home_win_return: calculateReturn(outcome.homeTeamWon, snapshot.home_home_fixed_win_price),
    [getMatchedColumn(scriptConfig.sport)]: snapshot[getMatchedColumn(scriptConfig.sport)],
    outcome_status: outcome.outcomeStatus,
    raw: {
      match: {
        awayHalfTimeScore: match?.away_half_time_score ?? null,
        awayScore: match?.away_score ?? null,
        awayTeamName: match?.away_team_name ?? null,
        homeHalfTimeScore: match?.home_half_time_score ?? null,
        homeScore: match?.home_score ?? null,
        homeTeamName: match?.home_team_name ?? null,
        sourceMatchId: match?.source_match_id ?? null,
      },
      snapshot: {
        sourceEventUrl: snapshot.source_event_url ?? null,
      },
    },
    snapshot_at: snapshot.snapshot_at,
    source: snapshot.source,
    source_event_id: snapshot.source_event_id,
    source_market_id: snapshot.source_market_id,
    source_snapshot_key: snapshot.source_snapshot_key,
  };
}

function mapOutcome(scriptConfig, snapshot, match) {
  const matchedColumn = getMatchedColumn(scriptConfig.sport);

  if (!snapshot[matchedColumn]) {
    return {
      outcomeStatus: "unmatched",
      row: buildResultRow(scriptConfig, snapshot, null, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "unmatched",
      }),
    };
  }

  if (!match) {
    return {
      outcomeStatus: "missing_result",
      row: buildResultRow(scriptConfig, snapshot, null, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "missing_result",
      }),
    };
  }

  if (!isSettledMatch(match)) {
    return {
      outcomeStatus: "pending",
      row: buildResultRow(scriptConfig, snapshot, match, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "pending",
      }),
    };
  }

  if (!hasHalfTimeScore(match)) {
    return {
      outcomeStatus: "missing_result",
      row: buildResultRow(scriptConfig, snapshot, match, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "missing_result",
      }),
    };
  }

  if (!Number.isFinite(Number(snapshot.home_home_fixed_win_price)) || !Number.isFinite(Number(snapshot.away_away_fixed_win_price))) {
    return {
      outcomeStatus: "missing_price",
      row: buildResultRow(scriptConfig, snapshot, match, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "missing_price",
      }),
    };
  }

  const halfTimeWinner = determineWinnerFromScores(match, "home_half_time_score", "away_half_time_score");
  const fullTimeWinner = determineWinnerFromScores(match, "home_score", "away_score");
  const halfTimeWinnerIsTrackedTeam = !halfTimeWinner
    || namesMatch(snapshot.home_team_name, halfTimeWinner.name)
    || namesMatch(snapshot.away_team_name, halfTimeWinner.name);
  const fullTimeWinnerIsTrackedTeam = !fullTimeWinner
    || namesMatch(snapshot.home_team_name, fullTimeWinner.name)
    || namesMatch(snapshot.away_team_name, fullTimeWinner.name);
  const homeTeamWon = Boolean(halfTimeWinner && fullTimeWinner
    && namesMatch(snapshot.home_team_name, halfTimeWinner.name)
    && namesMatch(snapshot.home_team_name, fullTimeWinner.name));
  const awayTeamWon = Boolean(halfTimeWinner && fullTimeWinner
    && namesMatch(snapshot.away_team_name, halfTimeWinner.name)
    && namesMatch(snapshot.away_team_name, fullTimeWinner.name));
  const favouriteWon = snapshot.favourite_team_name
    ? Boolean(halfTimeWinner && fullTimeWinner
      && namesMatch(snapshot.favourite_team_name, halfTimeWinner.name)
      && namesMatch(snapshot.favourite_team_name, fullTimeWinner.name))
    : null;

  if (!halfTimeWinnerIsTrackedTeam || !fullTimeWinnerIsTrackedTeam) {
    return {
      outcomeStatus: "non_standard",
      row: buildResultRow(scriptConfig, snapshot, match, halfTimeWinner, fullTimeWinner, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "non_standard",
      }),
    };
  }

  return {
    outcomeStatus: "settled",
    row: buildResultRow(scriptConfig, snapshot, match, halfTimeWinner, fullTimeWinner, {
      awayTeamWon,
      favouriteWon,
      homeTeamWon,
      outcomeStatus: "settled",
    }),
  };
}

function reconcileSnapshots(scriptConfig, snapshots, matchesById) {
  const statuses = {
    missing_price: 0,
    missing_result: 0,
    non_standard: 0,
    pending: 0,
    settled: 0,
    unmatched: 0,
  };
  const matchedColumn = getMatchedColumn(scriptConfig.sport);
  const rows = [];

  for (const snapshot of snapshots) {
    const match = snapshot[matchedColumn]
      ? matchesById.get(snapshot[matchedColumn])
      : null;
    const outcome = mapOutcome(scriptConfig, snapshot, match);

    statuses[outcome.outcomeStatus] += 1;

    if (outcome.row) {
      rows.push(outcome.row);
    }
  }

  return {
    rows,
    statuses,
  };
}

async function writeResultRows(supabase, scriptConfig, rows) {
  await supabase.upsert(
    scriptConfig.resultTable,
    rows,
    "source_snapshot_key",
  );

  return {
    [`${scriptConfig.sport}HalfTimeFullTimeResults`]: rows.length,
    ok: true,
    skipped: false,
  };
}

function summarizeReconciliation(scriptConfig, snapshots, matchesById, reconciliation) {
  return {
    matchedSnapshots: snapshots.filter((snapshot) => snapshot[getMatchedColumn(scriptConfig.sport)]).length,
    officialMatchesChecked: matchesById.size,
    outcomeRows: reconciliation.rows.length,
    snapshotsChecked: snapshots.length,
    statuses: reconciliation.statuses,
  };
}

/**
 * Runs one team-sport HT/FT double reconciliation workflow.
 */
export async function runHalfTimeFullTimeReconciliation(scriptConfig, argv) {
  const options = parseReconcileArgs(argv);
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
  const snapshots = await readSnapshots(supabase, scriptConfig, options);
  const matchesById = await readMatches(supabase, scriptConfig, snapshots);
  const reconciliation = reconcileSnapshots(scriptConfig, snapshots, matchesById);
  const summary = summarizeReconciliation(scriptConfig, snapshots, matchesById, reconciliation);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: reconciliation.rows.slice(0, 5).map((row) => ({
        away: row.away_team_name,
        awayReturn: row.away_win_return,
        favourite: row.favourite_team_name,
        favouriteReturn: row.favourite_win_return,
        fullTimeWinner: row.full_time_winner_team_name,
        halfTimeWinner: row.half_time_winner_team_name,
        home: row.home_team_name,
        homeReturn: row.home_win_return,
        outcomeStatus: row.outcome_status,
        source: row.source,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeResultRows(supabase, scriptConfig, reconciliation.rows);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}
