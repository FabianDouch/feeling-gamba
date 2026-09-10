import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_COMPETITION_ID = 1;
const DEFAULT_LIMIT = 500;
const MATCH_WINDOW_HOURS = 4;
const PAGE_SIZE = 1000;
const SOURCE_NAME = "official_uefa";
const UEFA_BASE_URL = "https://match.uefa.com/v5";
const TEAM_NAME_ALIASES = new Map([
  ["arsenal fc", "arsenal"],
  ["as roma", "roma"],
  ["atletico madrid", "atleti"],
  ["bayern munich", "bayern munchen"],
  ["bod glimt", "bodo glimt"],
  ["borussia dortmund", "b dortmund"],
  ["como 1907", "como"],
  ["fc barcelona", "barcelona"],
  ["fc porto", "porto"],
  ["fc sabah masazir", "sabah"],
  ["fc shakhtar donetsk", "shakhtar"],
  ["fenerbahce sk", "fenerbahce"],
  ["feyenoord rotterdam", "feyenoord"],
  ["galatasaray sk", "galatasaray"],
  ["inter milan", "inter"],
  ["lille osc", "lille"],
  ["manchester city", "man city"],
  ["manchester united", "man utd"],
  ["paris saint germain", "paris"],
  ["psv eindhoven", "psv"],
  ["rc lens", "lens"],
  ["rb leipzig", "leipzig"],
  ["shakhtar donetsk", "shakhtar"],
  ["slavia prague", "slavia praha"],
  ["slovan bratislava", "s bratislava"],
  ["ssc napoli", "napoli"],
  ["vfb stuttgart", "stuttgart"],
  ["villarreal cf", "villarreal"],
  ["viking fk", "viking"],
]);

/**
 * Maps a calendar date to UEFA's Champions League seasonYear convention.
 */
function getDefaultUefaSeasonYear(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  return month >= 6 ? year + 1 : year;
}

/**
 * Parses official UEFA refresh options while defaulting to price-backed writes only.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    competitionId: DEFAULT_COMPETITION_ID,
    dryRun: false,
    includeFixtures: false,
    limit: DEFAULT_LIMIT,
    pricedOnly: true,
    requireSupabase: false,
    season: getDefaultUefaSeasonYear(new Date()),
    skipDetails: false,
  };

  for (const arg of argv) {
    if (arg === "--allow-unpriced-backfill") {
      options.pricedOnly = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--include-fixtures") {
      options.includeFixtures = true;
    } else if (arg === "--priced-only") {
      options.pricedOnly = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-details") {
      options.skipDetails = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--competition-id=")) {
      options.competitionId = Number(arg.slice("--competition-id=".length));
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (!Number.isInteger(options.competitionId) || options.competitionId < 1) {
    throw new Error("--competition-id must be a positive integer.");
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("--season must be a four-digit year.");
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
 * Minimal Supabase REST client for official UEFA ingestion.
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
 * Fetches one public UEFA JSON payload.
 */
async function fetchUefaJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`UEFA request failed with HTTP ${response.status}: ${message.slice(0, 500)}`);
  }

  return await response.json();
}

/**
 * Normalizes UEFA list responses across their `items`, `matches`, and direct array shapes.
 */
function listFromPayload(payload, key) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

/**
 * Fetches the UEFA Champions League match list for a season.
 */
async function fetchMatches(options) {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${UEFA_BASE_URL}/matches`);
    url.searchParams.set("competitionId", String(options.competitionId));
    url.searchParams.set("seasonYear", String(options.season));
    url.searchParams.set("limit", String(options.limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order", "ASC");
    const payload = await fetchUefaJson(url);
    const page = listFromPayload(payload, "matches");
    rows.push(...page);

    if (page.length < options.limit) {
      break;
    }

    offset += options.limit;
  }

  return rows;
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

/**
 * Applies explicit TAB-vs-UEFA club aliases after basic name normalization.
 */
function normalizeTeamName(value) {
  const name = normalizeName(value);
  return TEAM_NAME_ALIASES.get(name) ?? name;
}

/**
 * Matches full club names against source variants without inventing aliases.
 */
function namesMatch(left, right) {
  const leftName = normalizeTeamName(left);
  const rightName = normalizeTeamName(right);

  if (!leftName || !rightName) {
    return false;
  }

  return leftName === rightName
    || leftName.endsWith(` ${rightName}`)
    || rightName.endsWith(` ${leftName}`);
}

function getDisplayName(value) {
  if (!value) {
    return null;
  }

  return value.displayName
    ?? value.internationalName
    ?? value.name
    ?? value.translations?.displayName?.EN
    ?? value.translations?.name?.EN
    ?? value.translations?.shortName?.EN
    ?? null;
}

function getTeamId(team) {
  return team?.id === undefined || team?.id === null ? null : String(team.id);
}

function getTeamName(team) {
  return getDisplayName(team) ?? team?.teamName ?? null;
}

function getPerson(value) {
  return value?.player ?? value?.person ?? value;
}

function getPersonId(value) {
  const person = getPerson(value);
  return person?.id === undefined || person?.id === null ? null : String(person.id);
}

function getPersonName(value) {
  const person = getPerson(value);
  const firstName = person?.firstName ?? person?.translations?.firstName?.EN ?? null;
  const lastName = person?.lastName ?? person?.translations?.lastName?.EN ?? null;
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();

  return getDisplayName(person)
    ?? person?.internationalName
    ?? (joined || null);
}

function getScore(match, side) {
  const score = match?.score ?? {};
  const value = score.total?.[side]
    ?? score.regular?.[side]
    ?? score[side]
    ?? null;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getMatchStatus(match) {
  const status = String(match?.status ?? match?.matchStatus ?? "").toUpperCase();

  if (status.includes("ABANDON")) {
    return "abandoned";
  }

  if (status.includes("FINISH") || status === "FT" || status === "PLAYED") {
    return "settled";
  }

  return "pending";
}

function getRoundTitle(match) {
  return match?.round?.translations?.name?.EN
    ?? match?.round?.metaData?.name
    ?? match?.round?.name
    ?? match?.phase?.translations?.name?.EN
    ?? match?.phase?.name
    ?? match?.group?.translations?.name?.EN
    ?? match?.group?.name
    ?? null;
}

function getRoundNumber(match) {
  const value = match?.matchday?.matchdayNumber
    ?? match?.round?.metaData?.matchday
    ?? match?.round?.order
    ?? match?.round?.id
    ?? null;
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function getKickoffAt(match) {
  return match?.kickOffTime?.dateTime
    ?? match?.kickoffTime?.dateTime
    ?? match?.kickoff_at
    ?? match?.dateTime
    ?? null;
}

function isWritableMatch(match, includeFixtures) {
  const status = getMatchStatus(match);
  return includeFixtures || status === "settled" || status === "abandoned";
}

function isWithinMatchWindow(snapshotStart, matchKickoff) {
  const snapshotDate = new Date(snapshotStart);
  const matchDate = new Date(matchKickoff);

  if (Number.isNaN(snapshotDate.valueOf()) || Number.isNaN(matchDate.valueOf())) {
    return false;
  }

  return Math.abs(snapshotDate.valueOf() - matchDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

function sameTeams(snapshot, match) {
  const homeTeam = match.homeTeam ?? match.home_team ?? {};
  const awayTeam = match.awayTeam ?? match.away_team ?? {};

  return namesMatch(snapshot.home_team_name, getTeamName(homeTeam))
    && namesMatch(snapshot.away_team_name, getTeamName(awayTeam));
}

/**
 * Reads fixed-win snapshots used as the price-backed boundary for UEFA writes.
 */
async function readPricedSnapshots(supabase) {
  try {
    return await supabase.selectAll("ucl_market_snapshots", {
      order: "advertised_start_at.asc",
      select: "source_event_id,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price",
      source: "eq.tab",
    });
  } catch (error) {
    if (isMissingUclSchemaError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingUclSchemaError(error) {
  return error instanceof Error
    && error.message.includes("PGRST205")
    && error.message.includes("ucl_");
}

/**
 * Keeps official rows only when TAB fixed-win prices were captured for that match.
 */
function filterToPricedMatches(matches, snapshots) {
  if (!snapshots.length) {
    return [];
  }

  return matches.filter((match) => {
    const kickoffAt = getKickoffAt(match);

    return snapshots.some((snapshot) =>
      snapshot.home_fixed_win_price !== null
      && snapshot.away_fixed_win_price !== null
      && sameTeams(snapshot, match)
      && isWithinMatchWindow(snapshot.advertised_start_at, kickoffAt));
  });
}

/**
 * Maps UEFA team objects to stable Supabase team rows.
 */
function mapTeam(team) {
  const sourceTeamId = getTeamId(team);
  const name = getTeamName(team);

  if (!sourceTeamId || !name) {
    return null;
  }

  return {
    abbreviation: team?.teamCode ?? team?.code ?? null,
    display_name: name,
    name,
    nick_name: team?.shortName ?? team?.translations?.shortName?.EN ?? null,
    raw: team ?? {},
    source: SOURCE_NAME,
    source_team_id: sourceTeamId,
    team_key: normalizeName(name),
  };
}

/**
 * Maps a UEFA match row into the app's UCL match table.
 */
function mapMatch(match, options) {
  const homeTeam = match.homeTeam ?? match.home_team ?? {};
  const awayTeam = match.awayTeam ?? match.away_team ?? {};
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const homeScore = getScore(match, "home");
  const awayScore = getScore(match, "away");
  const winnerTeam = homeScore === null || awayScore === null || homeScore === awayScore
    ? null
    : homeScore > awayScore ? homeTeam : awayTeam;

  return {
    away_score: awayScore,
    away_team_name: getTeamName(awayTeam),
    away_team_source_id: getTeamId(awayTeam),
    competition_id: options.competitionId,
    home_score: homeScore,
    home_team_name: getTeamName(homeTeam),
    home_team_source_id: getTeamId(homeTeam),
    kickoff_at: getKickoffAt(match),
    match_mode: match?.leg ?? match?.matchMode ?? null,
    match_state: match?.status ?? match?.matchStatus ?? null,
    raw: match,
    result_status: getMatchStatus(match),
    round_number: getRoundNumber(match),
    round_title: getRoundTitle(match),
    season: options.season,
    source: SOURCE_NAME,
    source_match_id: sourceMatchId,
    source_url: sourceMatchId ? `https://www.uefa.com/uefachampionsleague/match/${sourceMatchId}/` : null,
    venue_city: match?.stadium?.city?.internationalName ?? match?.venue?.city ?? null,
    venue_name: match?.stadium?.internationalName ?? match?.stadium?.name ?? match?.venue?.name ?? null,
    winner_team_name: winnerTeam ? getTeamName(winnerTeam) : null,
    winner_team_source_id: winnerTeam ? getTeamId(winnerTeam) : null,
  };
}

/**
 * Fetches optional UEFA lineups and event timeline for one retained match.
 */
async function fetchMatchDetails(match) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");

  if (!sourceMatchId) {
    return {
      events: [],
      lineups: null,
    };
  }

  const [lineupsResult, eventsResult] = await Promise.allSettled([
    fetchUefaJson(`${UEFA_BASE_URL}/matches/${sourceMatchId}/lineups`),
    fetchUefaJson(`${UEFA_BASE_URL}/matches/${sourceMatchId}/events?filter=ALL&order=ASC&limit=500&offset=0`),
  ]);

  return {
    events: eventsResult.status === "fulfilled" ? listFromPayload(eventsResult.value, "events") : [],
    lineups: lineupsResult.status === "fulfilled" ? lineupsResult.value : null,
  };
}

function pushUnique(map, row, key) {
  if (!key || map.has(key)) {
    return;
  }

  map.set(key, row);
}

/**
 * Recovers starter and bench player rows from UEFA lineup payloads.
 */
function collectLineupAppearances(value, team, sourceMatchId, resultStatus, rows, seen, pathLabel = "lineup") {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLineupAppearances(item, team, sourceMatchId, resultStatus, rows, seen, pathLabel);
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const playerId = getPersonId(value);
  const playerName = getPersonName(value);
  const teamId = getTeamId(team);
  const teamName = getTeamName(team);

  if (playerId && playerName && teamId && teamName) {
    const sourceAppearanceKey = `${SOURCE_NAME}:${sourceMatchId}:${teamId}:${playerId}`;

    if (!seen.has(sourceAppearanceKey)) {
      seen.add(sourceAppearanceKey);
      rows.push({
        is_on_field: pathLabel !== "bench" && value?.bench !== true && value?.isSubstitute !== true,
        jersey_number: Number.isFinite(Number(value?.shirtNumber ?? value?.jerseyNumber))
          ? Number(value?.shirtNumber ?? value?.jerseyNumber)
          : null,
        player_name: playerName,
        position: value?.position ?? value?.fieldPosition ?? null,
        raw: value,
        result_status: resultStatus,
        source: SOURCE_NAME,
        source_appearance_key: sourceAppearanceKey,
        source_match_id: sourceMatchId,
        source_player_id: playerId,
        source_team_id: teamId,
        team_name: teamName,
      });
    }
  }

  for (const key of ["field", "lineup", "players", "starting", "starters", "bench", "substitutes"]) {
    if (value[key]) {
      collectLineupAppearances(value[key], team, sourceMatchId, resultStatus, rows, seen, key);
    }
  }
}

/**
 * Maps UEFA lineup payloads to player and appearance rows.
 */
function mapAppearances(match, details) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const resultStatus = getMatchStatus(match);
  const homeTeam = match.homeTeam ?? match.home_team ?? {};
  const awayTeam = match.awayTeam ?? match.away_team ?? {};
  const lineups = details.lineups ?? {};
  const rows = [];
  const seen = new Set();

  collectLineupAppearances(lineups.homeTeam ?? lineups.home ?? lineups.localTeam, homeTeam, sourceMatchId, resultStatus, rows, seen);
  collectLineupAppearances(lineups.awayTeam ?? lineups.away ?? lineups.visitorTeam, awayTeam, sourceMatchId, resultStatus, rows, seen);

  return rows;
}

function getEventMinute(event) {
  const minute = event?.minute ?? event?.matchMinute ?? event?.time?.minute ?? null;
  const parsed = Number(minute);
  return Number.isFinite(parsed) ? parsed : null;
}

function getEventSecond(event) {
  const second = event?.second ?? event?.time?.second ?? 0;
  const parsed = Number(second);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEventTeam(event) {
  return event?.primaryActor?.team
    ?? event?.actor?.team
    ?? event?.team
    ?? getPerson(event?.primaryActor)?.team
    ?? null;
}

function getEventPlayer(event) {
  return event?.primaryActor?.person
    ?? event?.actor?.person
    ?? event?.player
    ?? event?.person
    ?? event?.primaryActor
    ?? null;
}

/**
 * Maps regular/extra-time UEFA goal timeline rows to official scorer records.
 */
function mapGoalScorers(match, details) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const rows = [];

  for (const event of details.events) {
    const eventType = String(event?.type ?? event?.eventType ?? "").toUpperCase();
    const phase = String(event?.phase ?? event?.period ?? "").toUpperCase();

    if (eventType !== "GOAL" || phase.includes("PENALTY_SHOOT")) {
      continue;
    }

    const player = getEventPlayer(event);
    const team = getEventTeam(event);
    const playerId = getPersonId(player);
    const playerName = getPersonName(player);
    const teamId = getTeamId(team);
    const teamName = getTeamName(team);
    const minute = getEventMinute(event);

    if (!playerId || !playerName || !teamId || !teamName || minute === null) {
      continue;
    }

    const sourceGoalKey = `${SOURCE_NAME}:${sourceMatchId}:${event.id ?? rows.length}`;
    rows.push({
      away_score: Number.isFinite(Number(event?.score?.away ?? event?.totalScore?.away))
        ? Number(event?.score?.away ?? event?.totalScore?.away)
        : null,
      display_minute: event?.displayMinute ?? event?.time?.display ?? String(minute),
      game_seconds: minute * 60 + getEventSecond(event),
      home_score: Number.isFinite(Number(event?.score?.home ?? event?.totalScore?.home))
        ? Number(event?.score?.home ?? event?.totalScore?.home)
        : null,
      player_name: playerName,
      raw: event,
      source: SOURCE_NAME,
      source_goal_key: sourceGoalKey,
      source_match_id: sourceMatchId,
      source_player_id: playerId,
      source_team_id: teamId,
      team_name: teamName,
    });
  }

  return rows;
}

/**
 * Maps player identities out of appearance and goal rows for the player table.
 */
function mapPlayersFromRows(appearances, goalScorers) {
  const byKey = new Map();

  for (const row of [...appearances, ...goalScorers]) {
    const sourcePlayerId = row.source_player_id;

    if (!sourcePlayerId || byKey.has(sourcePlayerId)) {
      continue;
    }

    const parts = String(row.player_name).trim().split(/\s+/);
    byKey.set(sourcePlayerId, {
      display_name: row.player_name,
      first_name: parts.length > 1 ? parts[0] : null,
      jersey_number: row.jersey_number ?? null,
      last_name: parts.length > 1 ? parts.slice(1).join(" ") : row.player_name,
      latest_team_source_id: row.source_team_id,
      player_key: normalizeName(row.player_name),
      position: row.position ?? null,
      raw: row.raw ?? {},
      source: SOURCE_NAME,
      source_player_id: sourcePlayerId,
    });
  }

  return Array.from(byKey.values());
}

/**
 * Converts retained UEFA payload rows into normalized write sets.
 */
async function buildWriteSets(matches, options) {
  const teams = new Map();
  const matchRows = [];
  const appearances = [];
  const goalScorers = [];

  for (const match of matches) {
    const homeTeam = match.homeTeam ?? match.home_team ?? {};
    const awayTeam = match.awayTeam ?? match.away_team ?? {};
    const matchRow = mapMatch(match, options);

    if (!matchRow.source_match_id || !matchRow.home_team_name || !matchRow.away_team_name) {
      continue;
    }

    pushUnique(teams, mapTeam(homeTeam), getTeamId(homeTeam));
    pushUnique(teams, mapTeam(awayTeam), getTeamId(awayTeam));
    matchRows.push(matchRow);

    if (!options.skipDetails) {
      const details = await fetchMatchDetails(match);
      appearances.push(...mapAppearances(match, details));
      goalScorers.push(...mapGoalScorers(match, details));
    }
  }

  return {
    appearances,
    goalScorers,
    matches: matchRows,
    players: mapPlayersFromRows(appearances, goalScorers),
    teams: Array.from(teams.values()).filter(Boolean),
  };
}

/**
 * Writes official UEFA rows in dependency order.
 */
async function writeRows(supabase, rows) {
  await supabase.upsert("ucl_teams", rows.teams, "source,source_team_id");
  await supabase.upsert("ucl_players", rows.players, "source,source_player_id");
  await supabase.upsert("ucl_matches", rows.matches, "source,source_match_id");
  await supabase.upsert("ucl_player_match_appearances", rows.appearances, "source_appearance_key");
  await supabase.upsert("ucl_goal_scorers", rows.goalScorers, "source_goal_key");

  return {
    ok: true,
    skipped: false,
    uclAppearances: rows.appearances.length,
    uclGoalScorers: rows.goalScorers.length,
    uclMatches: rows.matches.length,
    uclPlayers: rows.players.length,
    uclTeams: rows.teams.length,
  };
}

/**
 * Runs the official UEFA result/scorer refresh.
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
  const [allMatches, pricedSnapshots] = await Promise.all([
    fetchMatches(options),
    options.pricedOnly ? readPricedSnapshots(supabase) : Promise.resolve([]),
  ]);
  const writableMatches = allMatches.filter((match) => isWritableMatch(match, options.includeFixtures));
  const retainedMatches = options.pricedOnly
    ? filterToPricedMatches(writableMatches, pricedSnapshots)
    : writableMatches;
  const rows = await buildWriteSets(retainedMatches, options);
  const summary = {
    allMatches: allMatches.length,
    includeFixtures: options.includeFixtures,
    pricedOnly: options.pricedOnly,
    pricedSnapshots: pricedSnapshots.length,
    retainedMatches: retainedMatches.length,
    season: options.season,
    skippedUnpricedMatches: writableMatches.length - retainedMatches.length,
    writableMatches: writableMatches.length,
    writeRows: {
      appearances: rows.appearances.length,
      goalScorers: rows.goalScorers.length,
      matches: rows.matches.length,
      players: rows.players.length,
      teams: rows.teams.length,
    },
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.matches.slice(0, 8).map((row) => ({
        away: row.away_team_name,
        home: row.home_team_name,
        kickoffAt: row.kickoff_at,
        resultStatus: row.result_status,
        sourceMatchId: row.source_match_id,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(supabase, rows);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
