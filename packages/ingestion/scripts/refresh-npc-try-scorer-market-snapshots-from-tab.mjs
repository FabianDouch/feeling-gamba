import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_ENTRANTS_FIRST = 60;
const DEFAULT_EVENT_COUNT = 20;
const DEFAULT_MARKETS_FIRST = 500;
const MATCH_WINDOW_HOURS = 4;
const PAGE_SIZE = 1000;
const NPC_CATEGORY = "RUGBY_UNION";
const NPC_COMPETITION_SLUG = "new-zealand-npc";
const NPC_FIXED_WIN_MARKET_NAME = "match betting";
const NPC_TRY_SCORER_MARKET_NAME = "anytime try scorer";
const TAB_SOURCE = {
  endpoint: "https://api.tab.co.nz/graphql",
  label: "NPC market source",
  source: "tab",
};

const NPC_TRY_SCORER_SNAPSHOT_QUERY = `
  query NpcTryScorerMarketSnapshot(
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
 * Parses NPC player try-scorer snapshot ingestion options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    entrantsFirst: DEFAULT_ENTRANTS_FIRST,
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
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--entrants-first=")) {
      options.entrantsFirst = Number(arg.slice("--entrants-first=".length));
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    }
  }

  if (options.source !== "tab") {
    throw new Error("--source must be tab.");
  }

  for (const [name, value] of [
    ["--batch-size", options.batchSize],
    ["--entrants-first", options.entrantsFirst],
    ["--event-count", options.eventCount],
    ["--markets-first", options.marketsFirst],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
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

/**
 * Normalizes copied Supabase REST URLs back to the project origin.
 */
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
 * Builds browser-like headers for the current NPC market source request.
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
 * Normalizes source names for conservative market, team, and player matching.
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

/**
 * Converts nullable source numbers to finite JavaScript numbers.
 */
function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts fractional source odds into decimal fixed-win prices.
 */
function fractionalOddsToDecimal(odds) {
  const numerator = toNullableNumber(odds?.numerator);
  const denominator = toNullableNumber(odds?.denominator);

  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return Number((1 + numerator / denominator).toFixed(3));
}

/**
 * Removes a GraphQL global ID prefix while keeping opaque local IDs intact.
 */
function stripGlobalId(value, prefix) {
  return String(value ?? "").replace(new RegExp(`^${prefix}:`), "");
}

/**
 * Returns the provider-local source event ID for storage.
 */
function getEventSourceId(event) {
  return stripGlobalId(event?.id, "SportingEvent");
}

/**
 * Returns the provider-local source market ID for storage.
 */
function getMarketSourceId(market) {
  return stripGlobalId(market?.id, "SportingMarket") || null;
}

/**
 * Finds the match fixed-win market needed to identify event teams.
 */
function findFixedWinMarket(event) {
  return (event.markets?.nodes ?? []).find((market) =>
    normalizeName(market?.name) === NPC_FIXED_WIN_MARKET_NAME);
}

/**
 * Finds all exact anytime try-scorer markets on one event payload.
 */
function findTryScorerMarkets(event) {
  return (event.markets?.nodes ?? []).filter((market) =>
    normalizeName(market?.name) === NPC_TRY_SCORER_MARKET_NAME);
}

/**
 * Finds a non-suspended market entrant for the supplied home/away role.
 */
function findEntrantByRole(market, role) {
  return (market?.entrants?.nodes ?? []).find((entrant) =>
    entrant?.role === role && entrant?.isSuspended !== true);
}

/**
 * Allows full official team names and market nicknames to match safely.
 */
function namesMatch(left, right) {
  const leftName = normalizeName(left);
  const rightName = normalizeName(right);

  if (!leftName || !rightName) {
    return false;
  }

  return leftName === rightName
    || leftName.endsWith(` ${rightName}`)
    || rightName.endsWith(` ${leftName}`);
}

function levenshteinDistance(left, right) {
  const leftLength = left.length;
  const rightLength = right.length;
  const previous = Array.from({ length: rightLength + 1 }, (_, index) => index);
  const current = Array.from({ length: rightLength + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= leftLength; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= rightLength; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[rightLength];
}

function getNameParts(value) {
  const tokens = normalizeName(value).split(" ").filter(Boolean);

  return {
    first: tokens[0] ?? "",
    last: tokens.at(-1) ?? "",
    normalized: tokens.join(" "),
    tokens,
  };
}

/**
 * Allows conservative TAB-vs-Opta nickname/spelling joins within one team roster.
 */
function playerNamesProbablyMatch(marketName, officialName) {
  if (namesMatch(marketName, officialName)) {
    return true;
  }

  const market = getNameParts(marketName);
  const official = getNameParts(officialName);

  if (!market.first || !market.last || !official.first || !official.last) {
    return false;
  }

  if (levenshteinDistance(market.normalized, official.normalized) <= 2) {
    return true;
  }

  const firstNamesCompatible = market.first === official.first
    || market.first.startsWith(official.first)
    || official.first.startsWith(market.first)
    || market.first.endsWith(official.first)
    || official.first.endsWith(market.first)
    || (market.first === "mike" && official.first === "michael")
    || (market.first === "benjamin" && official.first === "ben");
  const lastNamesCompatible = market.last === official.last
    || market.last.startsWith(official.last)
    || official.last.startsWith(market.last)
    || levenshteinDistance(market.last, official.last) <= 1
    || official.tokens.includes(market.last)
    || market.tokens.includes(official.last);

  return firstNamesCompatible && lastNamesCompatible;
}

/**
 * Adds hours to an ISO timestamp for Supabase window queries.
 */
function addHours(isoString, hours) {
  const date = new Date(isoString);

  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

/**
 * Checks whether a market event and official fixture are close enough in time.
 */
function isWithinMatchWindow(snapshotStart, matchKickoff) {
  const snapshotDate = new Date(snapshotStart);
  const matchDate = new Date(matchKickoff);

  if (Number.isNaN(snapshotDate.valueOf()) || Number.isNaN(matchDate.valueOf())) {
    return false;
  }

  return Math.abs(snapshotDate.valueOf() - matchDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

/**
 * Prevents market rows from being captured after the advertised kickoff.
 */
function isBeforeAdvertisedStart(event, generatedAt) {
  const start = new Date(event?.advertisedStart);
  const snapshot = new Date(generatedAt);

  if (Number.isNaN(start.valueOf()) || Number.isNaN(snapshot.valueOf())) {
    return false;
  }

  return snapshot.valueOf() < start.valueOf();
}

/**
 * Checks whether the market event teams match an official NPC fixture.
 */
function sameTeams(eventContext, match) {
  return namesMatch(eventContext.homeTeamName, match.home_team_name)
    && namesMatch(eventContext.awayTeamName, match.away_team_name);
}

/**
 * Matches a current market event to one official NPC fixture shell/result.
 */
function matchExistingNpcMatch(eventContext, matches) {
  const candidates = matches.filter((match) =>
    sameTeams(eventContext, match) && isWithinMatchWindow(eventContext.advertisedStart, match.kickoff_at));

  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Parses market entrant names formatted as "Player Name (Team Name)".
 */
function parsePlayerEntrantName(name) {
  const value = String(name ?? "").trim();
  const match = value.match(/^(.*?)\s+\(([^()]+)\)\s*$/);

  if (!match) {
    return {
      playerName: value,
      teamName: null,
    };
  }

  return {
    playerName: match[1].trim(),
    teamName: match[2].trim(),
  };
}

/**
 * Skips team-level pseudo selections that cannot settle to an official player.
 */
function isPlayerSelection(playerName) {
  return normalizeName(playerName) !== "penalty try";
}

/**
 * Resolves a source entrant role to the official home or away team ID.
 */
function getTeamSourceIdForEntrant(entrant, parsedTeamName, matchedMatch) {
  if (!matchedMatch) {
    return null;
  }

  if (entrant?.role === "HOME") {
    return matchedMatch.home_team_source_id ?? null;
  }

  if (entrant?.role === "AWAY") {
    return matchedMatch.away_team_source_id ?? null;
  }

  if (namesMatch(parsedTeamName, matchedMatch.home_team_name)) {
    return matchedMatch.home_team_source_id ?? null;
  }

  if (namesMatch(parsedTeamName, matchedMatch.away_team_name)) {
    return matchedMatch.away_team_source_id ?? null;
  }

  return null;
}

/**
 * Resolves a source entrant role to the best team display name.
 */
function getTeamNameForEntrant(entrant, parsedTeamName, eventContext, matchedMatch) {
  if (parsedTeamName) {
    return parsedTeamName;
  }

  if (entrant?.role === "HOME") {
    return eventContext.homeTeamName ?? matchedMatch?.home_team_name ?? null;
  }

  if (entrant?.role === "AWAY") {
    return eventContext.awayTeamName ?? matchedMatch?.away_team_name ?? null;
  }

  return null;
}

/**
 * Matches a market player entrant to one official NPC match appearance.
 */
function matchPlayerAppearance(playerName, teamSourceId, teamName, appearances) {
  const nameCandidates = appearances.filter((appearance) =>
    namesMatch(playerName, appearance.player_name));

  const teamCandidates = nameCandidates.filter((appearance) => {
    if (teamSourceId && appearance.source_team_id) {
      return String(appearance.source_team_id) === String(teamSourceId);
    }

    return namesMatch(teamName, appearance.team_name);
  });

  if (teamCandidates.length === 1) {
    return teamCandidates[0];
  }

  if (nameCandidates.length === 1) {
    return nameCandidates[0];
  }

  const sameTeamCandidates = appearances.filter((appearance) => {
    if (teamSourceId && appearance.source_team_id) {
      return String(appearance.source_team_id) === String(teamSourceId);
    }

    return namesMatch(teamName, appearance.team_name);
  });
  const fuzzyCandidates = sameTeamCandidates.filter((appearance) =>
    playerNamesProbablyMatch(playerName, appearance.player_name));

  return fuzzyCandidates.length === 1 ? fuzzyCandidates[0] : null;
}

/**
 * Builds the stable event-team context needed for fixture/player matching.
 */
function getEventContext(event) {
  const fixedWinMarket = findFixedWinMarket(event);
  const home = findEntrantByRole(fixedWinMarket, "HOME");
  const away = findEntrantByRole(fixedWinMarket, "AWAY");

  if (!fixedWinMarket || !home?.name || !away?.name) {
    return null;
  }

  return {
    advertisedStart: event?.advertisedStart ?? null,
    awayTeamName: away.name,
    fixedWinMarketId: getMarketSourceId(fixedWinMarket),
    homeTeamName: home.name,
    sourceEventId: getEventSourceId(event),
  };
}

/**
 * Groups official player appearances by official source match ID.
 */
function buildAppearancesByMatch(appearances) {
  const byMatch = new Map();

  for (const appearance of appearances) {
    const bucket = byMatch.get(appearance.source_match_id) ?? [];
    bucket.push(appearance);
    byMatch.set(appearance.source_match_id, bucket);
  }

  return byMatch;
}

/**
 * Maps exact anytime try-scorer market entrants into snapshot rows.
 */
function mapTryScorerRows({ appearancesByMatch, event, eventContext, generatedAt, matchedMatch, source }) {
  const rows = [];
  const tryScorerMarkets = findTryScorerMarkets(event);
  const appearances = matchedMatch?.source_match_id
    ? appearancesByMatch.get(matchedMatch.source_match_id) ?? []
    : [];

  for (const market of tryScorerMarkets) {
    const sourceMarketId = getMarketSourceId(market);

    for (const entrant of market.entrants?.nodes ?? []) {
      const parsed = parsePlayerEntrantName(entrant?.name);

      if (!parsed.playerName || !isPlayerSelection(parsed.playerName) || entrant?.isSuspended === true) {
        continue;
      }

      const teamSourceId = getTeamSourceIdForEntrant(entrant, parsed.teamName, matchedMatch);
      const teamName = getTeamNameForEntrant(entrant, parsed.teamName, eventContext, matchedMatch);
      const matchedAppearance = matchedMatch
        ? matchPlayerAppearance(parsed.playerName, teamSourceId, teamName, appearances)
        : null;
      const entrantId = String(entrant?.id ?? normalizeName(entrant?.name));
      const sourceSelectionKey = [
        source.source,
        eventContext.sourceEventId,
        sourceMarketId ?? "anytime-try-scorer",
        entrantId,
      ].join(":");

      rows.push({
        advertised_start_at: event?.advertisedStart ?? null,
        fixed_win_price: fractionalOddsToDecimal(entrant?.price?.odds),
        market_name: market.name,
        matched_npc_match_id: matchedMatch?.id ?? null,
        player_name: parsed.playerName,
        player_source_id: matchedAppearance?.source_player_id ?? null,
        raw: {
          bettingStatus: event?.bettingStatus ?? null,
          entrantId: entrant?.id ?? null,
          entrantRole: entrant?.role ?? null,
          eventName: event?.name ?? null,
          eventStatus: event?.status ?? null,
          fixedWinMarketId: eventContext.fixedWinMarketId,
          marketTypeId: market?.marketTypeId ?? null,
          matchedAppearance: Boolean(matchedAppearance),
          odds: entrant?.price?.odds ?? null,
          parsedTeamName: parsed.teamName,
          priceId: entrant?.price?.id ?? null,
        },
        snapshot_at: generatedAt,
        source: source.source,
        source_event_id: eventContext.sourceEventId,
        source_event_url: event?.url ?? null,
        source_market_id: sourceMarketId,
        source_selection_key: sourceSelectionKey,
        source_snapshot_key: [
          source.source,
          eventContext.sourceEventId,
          sourceMarketId ?? "anytime-try-scorer",
          entrantId,
          generatedAt,
        ].join(":"),
        team_name: teamName,
        team_source_id: matchedAppearance?.source_team_id ?? teamSourceId,
      });
    }
  }

  return rows;
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
 * Minimal Supabase REST client for NPC try-scorer snapshot reads and writes.
 */
function createSupabaseRestClient(config, batchSize) {
  /**
   * Sends one authenticated Supabase REST request and parses JSON responses.
   */
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

  /**
   * Reads all matching rows from a Supabase REST table.
   */
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

  /**
   * Upserts rows through PostgREST using an explicit conflict target.
   */
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
 * Fetches current open NPC events from the market source.
 */
async function fetchSourceEvents(options) {
  const response = await graphql(TAB_SOURCE, "NpcTryScorerMarketSnapshot", NPC_TRY_SCORER_SNAPSHOT_QUERY, {
    category: NPC_CATEGORY,
    competitionSlug: NPC_COMPETITION_SLUG,
    entrantsFirst: options.entrantsFirst,
    marketsFirst: options.marketsFirst,
    upcomingEventsCount: options.eventCount,
  });

  return response.data?.upcomingEvents?.events?.nodes ?? [];
}

/**
 * Fetches official NPC fixture rows in the current market event window.
 */
async function fetchOfficialMatchesForEvents(supabase, events) {
  const starts = events
    .map((event) => event?.advertisedStart)
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

  return await supabase.selectAll("npc_matches", {
    and: `(kickoff_at.gte.${from},kickoff_at.lte.${to})`,
    order: "kickoff_at.asc",
    select: [
      "id",
      "source",
      "source_match_id",
      "season",
      "round_number",
      "kickoff_at",
      "home_team_source_id",
      "home_team_name",
      "away_team_source_id",
      "away_team_name",
      "result_status",
    ].join(","),
    source: "eq.official_provincial_rugby",
  });
}

/**
 * Fetches official roster appearance rows for the matched fixtures.
 */
async function fetchAppearancesForMatches(supabase, matches) {
  const matchIds = Array.from(new Set(matches
    .map((match) => match.source_match_id)
    .filter(Boolean)));

  if (!matchIds.length) {
    return [];
  }

  return await supabase.selectAll("npc_player_match_appearances", {
    order: "source_match_id.asc,source_team_id.asc,player_name.asc",
    select: [
      "source",
      "source_match_id",
      "source_player_id",
      "player_name",
      "source_team_id",
      "team_name",
    ].join(","),
    source: "eq.official_provincial_rugby",
    source_match_id: `in.(${matchIds.join(",")})`,
  });
}

/**
 * Builds current try-scorer snapshot rows and matching diagnostics.
 */
function buildSnapshotRows(events, officialMatches, appearances) {
  const generatedAt = new Date().toISOString();
  const appearancesByMatch = buildAppearancesByMatch(appearances);
  const rows = [];
  const eventSummaries = [];

  for (const event of events) {
    const eventContext = getEventContext(event);
    const tryScorerMarkets = findTryScorerMarkets(event);

    if (!isBeforeAdvertisedStart(event, generatedAt)) {
      eventSummaries.push({
        eventName: event?.name ?? null,
        reason: "advertised_start_passed",
        sourceEventId: getEventSourceId(event),
        tryScorerMarketCount: tryScorerMarkets.length,
        writtenRows: 0,
      });
      continue;
    }

    if (!eventContext) {
      eventSummaries.push({
        eventName: event?.name ?? null,
        reason: "missing_match_betting",
        sourceEventId: getEventSourceId(event),
        tryScorerMarketCount: tryScorerMarkets.length,
        writtenRows: 0,
      });
      continue;
    }

    const matchedMatch = matchExistingNpcMatch(eventContext, officialMatches);
    const eventRows = mapTryScorerRows({
      appearancesByMatch,
      event,
      eventContext,
      generatedAt,
      matchedMatch,
      source: TAB_SOURCE,
    });
    rows.push(...eventRows);
    eventSummaries.push({
      eventName: event?.name ?? null,
      matchedNpcMatchId: matchedMatch?.id ?? null,
      sourceEventId: eventContext.sourceEventId,
      tryScorerMarketCount: tryScorerMarkets.length,
      writtenRows: eventRows.length,
    });
  }

  return {
    eventSummaries,
    generatedAt,
    rows,
  };
}

/**
 * Writes current NPC try-scorer price snapshots to Supabase.
 */
async function writeRows(supabase, rows) {
  await supabase.request("npc_try_scorer_market_snapshots", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      player_name: "eq.Penalty Try",
    },
  });
  await supabase.upsert("npc_try_scorer_market_snapshots", rows, "source_selection_key");

  return {
    npcTryScorerMarketSnapshots: rows.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Summarizes current NPC try-scorer snapshot matching and price coverage.
 */
function summarize({ eventCount, officialMatches, result }) {
  return {
    generatedAt: result.generatedAt,
    matchedEvents: result.eventSummaries.filter((event) => event.matchedNpcMatchId).length,
    matchedPlayerSelections: result.rows.filter((row) => row.player_source_id).length,
    npcTryScorerMarketSnapshots: result.rows.length,
    officialMatchesChecked: officialMatches.length,
    openEventsChecked: eventCount,
    primaryTryScorerMarkets: result.eventSummaries.reduce((total, event) =>
      total + Number(event.tryScorerMarketCount ?? 0), 0),
    skippedEvents: result.eventSummaries.filter((event) => event.reason).length,
    unmatchedEvents: result.eventSummaries.filter((event) =>
      !event.reason && !event.matchedNpcMatchId).length,
    unmatchedPlayerSelections: result.rows.filter((row) => !row.player_source_id).length,
    unpricedSelections: result.rows.filter((row) => row.fixed_win_price === null).length,
  };
}

/**
 * Runs the local NPC player try-scorer market snapshot workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
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
  const events = await fetchSourceEvents(options);
  const officialMatches = await fetchOfficialMatchesForEvents(supabase, events);
  const appearances = await fetchAppearancesForMatches(supabase, officialMatches);
  const result = buildSnapshotRows(events, officialMatches, appearances);
  const summary = summarize({
    eventCount: events.length,
    officialMatches,
    result,
  });

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      events: result.eventSummaries,
      sample: result.rows.slice(0, 8).map((row) => ({
        advertisedStart: row.advertised_start_at,
        matchedNpcMatchId: row.matched_npc_match_id,
        playerName: row.player_name,
        playerSourceId: row.player_source_id,
        price: row.fixed_win_price,
        sourceEventId: row.source_event_id,
        teamName: row.team_name,
        teamSourceId: row.team_source_id,
      })),
      unmatchedSample: result.rows.filter((row) => !row.player_source_id).slice(0, 12).map((row) => ({
        advertisedStart: row.advertised_start_at,
        matchedNpcMatchId: row.matched_npc_match_id,
        playerName: row.player_name,
        price: row.fixed_win_price,
        teamName: row.team_name,
        teamSourceId: row.team_source_id,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(supabase, result.rows);

  console.log(JSON.stringify({
    events: result.eventSummaries,
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
