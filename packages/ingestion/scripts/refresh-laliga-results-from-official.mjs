import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_COMPETITION_ID = 1;
const DEFAULT_COMPETITION_SLUG = "primera-division";
const DEFAULT_LIMIT = 100;
const MATCH_WINDOW_HOURS = 4;
const PAGE_SIZE = 1000;
const SOURCE_NAME = "official_laliga";
const LALIGA_BASE_URL = "https://apim.laliga.com/public-service";
const LALIGA_PUBLIC_SERVICE_KEY = "c13c3a8e2f6b46da9c5c425cf61fab3e";
const TEAM_NAME_ALIASES = new Map([
  ["alaves", "deportivo alaves"],
  ["athletic bilbao", "athletic club"],
  ["atletico madrid", "atletico de madrid"],
  ["barcelona", "fc barcelona"],
  ["celta vigo", "rc celta"],
  ["deportivo la coruna", "rc deportivo"],
  ["deportivo", "rc deportivo"],
  ["espanyol", "rcd espanyol de barcelona"],
  ["getafe", "getafe cf"],
  ["girona", "girona fc"],
  ["levante", "levante ud"],
  ["mallorca", "rcd mallorca"],
  ["osasuna", "ca osasuna"],
  ["oviedo", "real oviedo"],
  ["rayo", "rayo vallecano"],
  ["real betis", "real betis"],
  ["real madrid", "real madrid"],
  ["real sociedad", "real sociedad"],
  ["sevilla", "sevilla fc"],
  ["valencia", "valencia cf"],
  ["villarreal", "villarreal cf"],
]);

/**
 * Maps a calendar date to the La Liga season start year.
 */
function getDefaultLaligaSeasonYear(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  return month >= 6 ? year : year - 1;
}

/**
 * Parses official La Liga refresh options while defaulting to price-backed writes only.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    competitionId: DEFAULT_COMPETITION_ID,
    competitionSlug: DEFAULT_COMPETITION_SLUG,
    dryRun: false,
    includeFixtures: false,
    limit: DEFAULT_LIMIT,
    maxMatches: null,
    pricedOnly: true,
    requireSupabase: false,
    season: getDefaultLaligaSeasonYear(new Date()),
    skipDetails: false,
    subscriptionSlug: null,
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
    } else if (arg.startsWith("--competition-slug=")) {
      options.competitionSlug = arg.slice("--competition-slug=".length);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--max-matches=")) {
      options.maxMatches = Number(arg.slice("--max-matches=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    } else if (arg.startsWith("--subscription-slug=")) {
      options.subscriptionSlug = arg.slice("--subscription-slug=".length);
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

  if (options.maxMatches !== null && (!Number.isInteger(options.maxMatches) || options.maxMatches < 1)) {
    throw new Error("--max-matches must be a positive integer.");
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
 * Minimal Supabase REST client for official La Liga ingestion.
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
 * Fetches one public La Liga JSON payload.
 */
async function fetchLaligaJson(url) {
  const publicServiceKey = process.env.LALIGA_PUBLIC_SERVICE_KEY ?? LALIGA_PUBLIC_SERVICE_KEY;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "Ocp-Apim-Subscription-Key": publicServiceKey,
      origin: "https://www.laliga.com",
      referer: "https://www.laliga.com/",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`La Liga request failed with HTTP ${response.status}: ${message.slice(0, 500)}`);
  }

  return await response.json();
}

/**
 * Normalizes La Liga list responses across their array-backed shapes.
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
 * Builds the public La Liga subscription slug for one season start year.
 */
function getSubscriptionSlug(options) {
  return options.subscriptionSlug ?? `laliga-easports-${options.season}`;
}

/**
 * Fetches the La Liga fixture list for a season.
 */
async function fetchMatches(options) {
  const rows = [];
  const subscriptionSlug = getSubscriptionSlug(options);
  let offset = 0;

  while (true) {
    const url = new URL(`${LALIGA_BASE_URL}/api/v1/matches`);
    url.searchParams.set("subscription", subscriptionSlug);
    url.searchParams.set("competition", options.competitionSlug);
    url.searchParams.set("limit", String(options.limit));
    url.searchParams.set("offset", String(offset));
    const payload = await fetchLaligaJson(url);
    const fixtures = listFromPayload(payload, "matches");
    rows.push(...fixtures);

    if (fixtures.length < options.limit || rows.length >= Number(payload?.total ?? rows.length)) {
      break;
    }

    offset += options.limit;
  }

  return rows.map((row) => ({
    ...row,
    _subscriptionSlug: subscriptionSlug,
  }));
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
 * Applies explicit TAB-vs-La Liga club aliases after basic name normalization.
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

  return value.display
    ?? value.displayName
    ?? value.internationalName
    ?? value.shortName
    ?? value.shortname
    ?? value.nickname
    ?? value.boundname
    ?? value.club?.name
    ?? value.name
    ?? value.translations?.displayName?.EN
    ?? value.translations?.name?.EN
    ?? value.translations?.shortName?.EN
    ?? null;
}

function getTeamId(team) {
  const id = team?.opta_id ?? team?.id;
  return id === undefined || id === null ? null : String(id);
}

function getTeamName(team) {
  return team?.nickname
    ?? team?.boundname
    ?? team?.name
    ?? getDisplayName(team)
    ?? team?.teamName
    ?? team?.club?.name
    ?? null;
}

function getPerson(value) {
  return value?.player ?? value?.person ?? value?.owner ?? value;
}

function getPersonId(value) {
  const person = getPerson(value);
  const id = value?.opta_id ?? person?.opta_id ?? person?.id ?? person?.personId ?? person?.playerId;
  return id === undefined || id === null ? null : String(id);
}

function getPersonName(value) {
  const person = getPerson(value);
  const firstName = person?.name?.first ?? person?.firstName ?? person?.translations?.firstName?.EN ?? null;
  const lastName = person?.name?.last ?? person?.lastName ?? person?.translations?.lastName?.EN ?? null;
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  const directName = typeof person?.name === "string" ? person.name : null;

  return person?.name?.display
    ?? directName
    ?? getDisplayName(person)
    ?? person?.nickname
    ?? person?.internationalName
    ?? (joined || null);
}

function getHomeTeam(match) {
  return match?.homeTeam ?? match?.home_team ?? match?.teams?.[0]?.team ?? match?.teams?.[0] ?? {};
}

function getAwayTeam(match) {
  return match?.awayTeam ?? match?.away_team ?? match?.teams?.[1]?.team ?? match?.teams?.[1] ?? {};
}

function getTeamEntry(match, side) {
  return side === "home" ? match?.teams?.[0] : match?.teams?.[1];
}

function getScore(match, side) {
  const team = side === "home" ? getHomeTeam(match) : getAwayTeam(match);
  const teamEntry = getTeamEntry(match, side);
  const directScore = side === "home" ? match?.home_score : match?.away_score;
  const teamScore = Number(directScore ?? teamEntry?.teamScore?.score ?? teamEntry?.score ?? team?.teamScore?.score ?? team?.score);

  if (Number.isFinite(teamScore)) {
    return teamScore;
  }

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
  const phase = String(match?.phase ?? "").toUpperCase();

  if (status.includes("ABANDON")) {
    return "abandoned";
  }

  if (status.includes("FULLTIME") || status.includes("FINISH") || status === "FT" || status === "PLAYED" || status === "C" || phase === "F") {
    return "settled";
  }

  return "pending";
}

function getRoundTitle(match) {
  return match?.gameweek?.name
    ?? match?.gameweek?.shortname
    ?? match?.gameweek?.compSeason?.label
    ?? match?.round?.translations?.name?.EN
    ?? match?.round?.metaData?.name
    ?? match?.round?.name
    ?? match?.phase?.translations?.name?.EN
    ?? match?.phase?.name
    ?? match?.group?.translations?.name?.EN
    ?? match?.group?.name
    ?? null;
}

function getRoundNumber(match) {
  const value = match?.gameweek?.week
    ?? match?.gameweek?.gameweek
    ?? match?.gameweek
    ?? match?.matchday?.matchdayNumber
    ?? match?.round?.metaData?.matchday
    ?? match?.round?.order
    ?? match?.round?.id
    ?? null;
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function getKickoffAt(match) {
  const millis = Number(match?.kickoff?.millis);

  if (Number.isFinite(millis)) {
    return new Date(millis).toISOString();
  }

  return match?.kickOffTime?.dateTime
    ?? match?.kickoffTime?.dateTime
    ?? match?.kickoff_at
    ?? match?.time
    ?? match?.date
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
  const homeTeam = getHomeTeam(match);
  const awayTeam = getAwayTeam(match);

  return namesMatch(snapshot.home_team_name, getTeamName(homeTeam))
    && namesMatch(snapshot.away_team_name, getTeamName(awayTeam));
}

/**
 * Reads fixed-win snapshots used as the price-backed boundary for La Liga writes.
 */
async function readPricedSnapshots(supabase) {
  try {
    return await supabase.selectAll("laliga_market_snapshots", {
      order: "advertised_start_at.asc",
      select: "source_event_id,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price",
      source: "eq.tab",
    });
  } catch (error) {
    if (isMissingLaligaSchemaError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingLaligaSchemaError(error) {
  return error instanceof Error
    && error.message.includes("PGRST205")
    && error.message.includes("laliga_");
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
 * Maps La Liga team objects to stable Supabase team rows.
 */
function mapTeam(team) {
  const sourceTeamId = getTeamId(team);
  const name = getTeamName(team);

  if (!sourceTeamId || !name) {
    return null;
  }

  return {
    abbreviation: team?.shortname ?? team?.teamType ?? team?.shortClubName ?? team?.teamCode ?? team?.code ?? null,
    display_name: name,
    name,
    nick_name: team?.nickname ?? team?.shortName ?? team?.shortClubName ?? team?.translations?.shortName?.EN ?? null,
    raw: team ?? {},
    source: SOURCE_NAME,
    source_team_id: sourceTeamId,
    team_key: normalizeName(name),
  };
}

/**
 * Maps a La Liga fixture row into the app's LaLiga match table.
 */
function mapMatch(match, options) {
  const homeTeam = getHomeTeam(match);
  const awayTeam = getAwayTeam(match);
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
    source_url: match?.slug ? `https://www.laliga.com/en-GB/match/${match.slug}` : null,
    venue_city: match?.ground?.city ?? match?.stadium?.city?.internationalName ?? match?.venue?.city ?? null,
    venue_name: match?.ground?.name ?? match?.stadium?.internationalName ?? match?.stadium?.name ?? match?.venue?.name ?? null,
    winner_team_name: winnerTeam ? getTeamName(winnerTeam) : null,
    winner_team_source_id: winnerTeam ? getTeamId(winnerTeam) : null,
  };
}

/**
 * Fetches official roster details for the fixture teams.
 */
async function fetchMatchDetails(match) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const subscriptionSlug = match?._subscriptionSlug;
  const teams = [getHomeTeam(match), getAwayTeam(match)].filter((team) => getTeamId(team));

  if (!sourceMatchId || !subscriptionSlug) {
    return {
      goals: match?.goals ?? [],
      rosters: new Map(),
    };
  }

  const rosterResults = await Promise.allSettled(teams.map((team) => {
    const url = new URL(`${LALIGA_BASE_URL}/api/v1/teams/${team.slug}/squad`);
    url.searchParams.set("subscription", subscriptionSlug);
    return fetchLaligaJson(url);
  }));
  const rosters = new Map();

  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index];
    const result = rosterResults[index];
    const players = result?.status === "fulfilled"
      ? [
        ...listFromPayload(result.value, "squads"),
        ...listFromPayload(result.value, "squad"),
        ...listFromPayload(result.value, "players"),
      ]
      : [];
    rosters.set(getTeamId(team), players);
  }

  return {
    goals: match?.goals ?? [],
    rosters,
  };
}

function pushUnique(map, row, key) {
  if (!key || map.has(key)) {
    return;
  }

  map.set(key, row);
}

/**
 * Recovers player rows from La Liga squad payloads when match lineups are not public.
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
 * Maps La Liga roster payloads to player and match-appearance proxy rows.
 */
function mapAppearances(match, details) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const resultStatus = getMatchStatus(match);
  const teams = [getHomeTeam(match), getAwayTeam(match)];
  const rows = [];
  const seen = new Set();

  for (const team of teams) {
    const teamId = getTeamId(team);
    const teamName = getTeamName(team);

    if (!teamId || !teamName) {
      continue;
    }

    for (const player of details.rosters?.get(teamId) ?? []) {
      const playerId = getPersonId(player);
      const playerName = getPersonName(player);

      if (!playerId || !playerName) {
        continue;
      }

      const sourceAppearanceKey = `${SOURCE_NAME}:${sourceMatchId}:${teamId}:${playerId}`;

      if (seen.has(sourceAppearanceKey)) {
        continue;
      }

      seen.add(sourceAppearanceKey);
      rows.push({
        is_on_field: true,
        jersey_number: Number.isFinite(Number(player?.shirt_number ?? player?.shirtNumber ?? player?.info?.shirtNum))
          ? Number(player?.shirt_number ?? player?.shirtNumber ?? player?.info?.shirtNum)
          : null,
        player_name: playerName,
        position: player?.position?.name ?? player?.position?.slug ?? player?.role?.name ?? player?.info?.position ?? player?.position ?? null,
        raw: player,
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

  return rows;
}

function getEventMinute(event) {
  const minute = event?.minute
    ?? event?.matchMinute
    ?? event?.time?.minute
    ?? (Number.isFinite(Number(event?.clock?.secs)) ? Math.floor(Number(event.clock.secs) / 60) : null);
  const parsed = Number(minute);
  return Number.isFinite(parsed) ? parsed : null;
}

function getEventSecond(event) {
  const second = event?.second
    ?? event?.time?.second
    ?? (Number.isFinite(Number(event?.clock?.secs)) ? Number(event.clock.secs) % 60 : 0);
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
    ?? (event?.personId ? { id: event.personId } : null)
    ?? null;
}

/**
 * Maps La Liga fixture goal rows to official scorer records.
 */
function mapGoalScorers(match, details) {
  const sourceMatchId = String(match.id ?? match.matchId ?? "");
  const rows = [];
  const playersById = new Map();

  for (const [teamId, players] of details.rosters ?? []) {
    const team = [getHomeTeam(match), getAwayTeam(match)].find((candidate) => getTeamId(candidate) === teamId);
    const teamName = getTeamName(team);

    for (const player of players) {
      const playerId = getPersonId(player);

      if (playerId) {
        playersById.set(playerId, {
          player,
          teamId,
          teamName,
        });
      }
    }
  }

  for (const [index, event] of (details.goals ?? []).entries()) {
    const phase = String(event?.phase ?? "").toUpperCase();
    const goalType = String(event?.type ?? "").toUpperCase();

    if (phase.includes("PENALTY_SHOOT")) {
      continue;
    }

    const player = getEventPlayer(event);
    const playerId = event?.personId === undefined || event?.personId === null ? getPersonId(player) : String(event.personId);
    const rosterMatch = playersById.get(playerId);
    const playerName = getPersonName(player) ?? getPersonName(rosterMatch?.player);
    const teamId = rosterMatch?.teamId ?? getTeamId(getEventTeam(event));
    const teamName = rosterMatch?.teamName ?? getTeamName(getEventTeam(event));
    const minute = getEventMinute(event);

    if (!playerId || !playerName || !teamId || !teamName || minute === null) {
      continue;
    }

    const sourceGoalKey = `${SOURCE_NAME}:${sourceMatchId}:${event.id ?? playerId}:${event?.clock?.secs ?? minute}:${index}`;
    rows.push({
      away_score: Number.isFinite(Number(event?.score?.away ?? event?.totalScore?.away ?? event?.awayScore))
        ? Number(event?.score?.away ?? event?.totalScore?.away ?? event?.awayScore)
        : null,
      display_minute: event?.clock?.label ?? event?.displayMinute ?? event?.time?.display ?? String(minute),
      game_seconds: minute * 60 + getEventSecond(event),
      home_score: Number.isFinite(Number(event?.score?.home ?? event?.totalScore?.home ?? event?.homeScore))
        ? Number(event?.score?.home ?? event?.totalScore?.home ?? event?.homeScore)
        : null,
      player_name: playerName,
      raw: event,
      source: SOURCE_NAME,
      source_goal_key: goalType === "OWN" || goalType === "OG" ? `${sourceGoalKey}:own_goal` : sourceGoalKey,
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
 * Converts retained La Liga payload rows into normalized write sets.
 */
async function buildWriteSets(matches, options) {
  const teams = new Map();
  const matchRows = [];
  const appearances = [];
  const goalScorers = [];

  for (const match of matches) {
    const homeTeam = getHomeTeam(match);
    const awayTeam = getAwayTeam(match);
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
 * Writes official La Liga rows in dependency order.
 */
async function writeRows(supabase, rows) {
  await supabase.upsert("laliga_teams", rows.teams, "source,source_team_id");
  await supabase.upsert("laliga_players", rows.players, "source,source_player_id");
  await supabase.upsert("laliga_matches", rows.matches, "source,source_match_id");
  await supabase.upsert("laliga_player_match_appearances", rows.appearances, "source_appearance_key");
  await supabase.upsert("laliga_goal_scorers", rows.goalScorers, "source_goal_key");

  return {
    ok: true,
    skipped: false,
    laligaAppearances: rows.appearances.length,
    laligaGoalScorers: rows.goalScorers.length,
    laligaMatches: rows.matches.length,
    laligaPlayers: rows.players.length,
    laligaTeams: rows.teams.length,
  };
}

/**
 * Runs the official La Liga result/scorer refresh.
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
  const matchesToWrite = options.maxMatches ? retainedMatches.slice(0, options.maxMatches) : retainedMatches;
  const rows = await buildWriteSets(matchesToWrite, options);
  const summary = {
    allMatches: allMatches.length,
    includeFixtures: options.includeFixtures,
    pricedOnly: options.pricedOnly,
    pricedSnapshots: pricedSnapshots.length,
    retainedMatches: retainedMatches.length,
    retainedMatchesAfterLimit: matchesToWrite.length,
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
