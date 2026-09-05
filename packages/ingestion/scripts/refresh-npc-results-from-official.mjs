import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_COMPETITION_ID = 208;
const DEFAULT_OPTA_FEED_TYPE = "ru1";
const DEFAULT_OPTA_MATCH_DETAIL_FEED_TYPE = "ru7";
const DEFAULT_OPTA_SEASON_OFFSET = 1;
const DEFAULT_OPTA_OMO_USERNAME = "OW2017";
const DEFAULT_OPTA_OMO_PASSWORD = "dXWg5gVZ";
const OFFICIAL_NPC_PAGE_URL = "https://www.provincial.rugby/npc/fixtures-and-results";
const OFFICIAL_OPTA_OMO_URL = "https://omo.akamai.opta.net/auth/competition.php";
const OFFICIAL_OPTA_OMO_MATCH_URL = "https://omo.akamai.opta.net/auth/";
const SOURCE_NAME = "official_provincial_rugby";

/**
 * Parses official NPC result refresh options for one Opta season feed.
 */
function parseArgs(argv) {
  const now = new Date();
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    competitionId: DEFAULT_COMPETITION_ID,
    dryRun: false,
    includeFixtures: false,
    includeMatchDetails: true,
    matchDetailLimit: null,
    optaSeason: null,
    requireSupabase: false,
    round: null,
    season: now.getUTCFullYear(),
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--include-fixtures") {
      options.includeFixtures = true;
    } else if (arg === "--skip-match-details") {
      options.includeMatchDetails = false;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--competition-id=")) {
      options.competitionId = Number(arg.slice("--competition-id=".length));
    } else if (arg.startsWith("--match-detail-limit=")) {
      options.matchDetailLimit = Number(arg.slice("--match-detail-limit=".length));
    } else if (arg.startsWith("--opta-season=")) {
      options.optaSeason = Number(arg.slice("--opta-season=".length));
    } else if (arg.startsWith("--round=")) {
      options.round = Number(arg.slice("--round=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  for (const [name, value] of [
    ["--batch-size", options.batchSize],
    ["--competition-id", options.competitionId],
    ["--season", options.season],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (options.season < 2000) {
    throw new Error("--season must be a four-digit year.");
  }

  if (options.optaSeason === null) {
    options.optaSeason = options.season + DEFAULT_OPTA_SEASON_OFFSET;
  }

  if (!Number.isInteger(options.optaSeason) || options.optaSeason < 1) {
    throw new Error("--opta-season must be a positive integer.");
  }

  if (options.round !== null && (!Number.isInteger(options.round) || options.round < 1)) {
    throw new Error("--round must be a positive integer.");
  }

  if (options.matchDetailLimit !== null && (!Number.isInteger(options.matchDetailLimit) || options.matchDetailLimit < 1)) {
    throw new Error("--match-detail-limit must be a positive integer.");
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

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNullableInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toNullableBoolean(value) {
  const normalized = normalizeName(value);

  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false;
  }

  return null;
}

function toIsoTimestamp(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);

  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

/**
 * Decodes the XML attribute entities used by Opta rugby feeds.
 */
function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

/**
 * Parses XML tag attributes from the constrained Opta RU1 feed shape.
 */
function parseAttributes(fragment) {
  const attributes = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*(["'])(.*?)\2/gs;

  for (const match of fragment.matchAll(pattern)) {
    attributes[match[1]] = decodeXmlEntities(match[3]);
  }

  return attributes;
}

function firstNonBlank(...values) {
  return values.find((value) => String(value ?? "").trim()) ?? "";
}

function getOptaCredentials() {
  return {
    password: firstNonBlank(
      process.env.NPC_OPTA_OMO_PASSWORD,
      process.env.OPTA_OMO_PASSWORD,
      DEFAULT_OPTA_OMO_PASSWORD,
    ),
    username: firstNonBlank(
      process.env.NPC_OPTA_OMO_USERNAME,
      process.env.OPTA_OMO_USERNAME,
      DEFAULT_OPTA_OMO_USERNAME,
    ),
  };
}

function getOptaHeaders() {
  return {
    accept: "application/xml,text/xml,*/*",
    referer: OFFICIAL_NPC_PAGE_URL,
    "user-agent": "Mozilla/5.0 (compatible; FeelingGambaBot/0.1; +https://www.provincial.rugby)",
  };
}

/**
 * Fetches the same Opta RU1 XML feed used by the official NPC widget page.
 */
async function fetchOfficialNpcXml(options) {
  const credentials = getOptaCredentials();
  const url = new URL(OFFICIAL_OPTA_OMO_URL);

  url.searchParams.set("feed_type", DEFAULT_OPTA_FEED_TYPE);
  url.searchParams.set("competition", String(options.competitionId));
  url.searchParams.set("season_id", String(options.optaSeason));
  url.searchParams.set("user", credentials.username);
  url.searchParams.set("psw", credentials.password);

  const response = await fetch(url, {
    headers: getOptaHeaders(),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Official NPC Opta request failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  if (!body.includes("<fixtures")) {
    throw new Error(`Official NPC Opta response did not include fixtures XML: ${body.slice(0, 300)}`);
  }

  return body;
}

/**
 * Fetches one Opta RU7 match-detail payload for official player stats.
 */
async function fetchOfficialNpcMatchDetailXml(sourceMatchId) {
  const credentials = getOptaCredentials();
  const url = new URL(OFFICIAL_OPTA_OMO_MATCH_URL);

  url.searchParams.set("feed_type", DEFAULT_OPTA_MATCH_DETAIL_FEED_TYPE);
  url.searchParams.set("game_id", String(sourceMatchId));
  url.searchParams.set("user", credentials.username);
  url.searchParams.set("psw", credentials.password);

  const response = await fetch(url, {
    headers: getOptaHeaders(),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Official NPC Opta match detail request failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  if (!body.includes("<RRML")) {
    throw new Error(`Official NPC Opta match detail response did not include RU7 XML: ${body.slice(0, 300)}`);
  }

  return body;
}

function isPlaceholderTeam(team) {
  return !team?.team_id
    || team.team_id === "0"
    || normalizeName(team.teamname ?? team.name) === "tbc";
}

function getFixtureTeam(teams, side) {
  return teams.find((team) => team.home_or_away === side) ?? null;
}

function getResultStatus(fixture) {
  const status = normalizeName(fixture.status);

  if (status === "result") {
    return "settled";
  }

  if (status === "abandoned" || status === "cancelled") {
    return "abandoned";
  }

  if (["fixture", "prematch", "team in", "live", "halftime", "firsthalf", "second half"].includes(status)) {
    return "pending";
  }

  return "unknown";
}

function getMatchDetailResultStatus(root, fallbackStatus) {
  const status = normalizeName(root.status_result ?? root.status);

  if (status === "result" || status === "final") {
    return "settled";
  }

  if (status === "abandoned" || status === "cancelled") {
    return "abandoned";
  }

  if (status) {
    return "pending";
  }

  return fallbackStatus ?? "unknown";
}

function getWinner(homeTeam, awayTeam, resultStatus) {
  if (resultStatus !== "settled") {
    return null;
  }

  const homeScore = toNullableInteger(homeTeam?.score);
  const awayScore = toNullableInteger(awayTeam?.score);

  if (homeScore === null || awayScore === null || homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore ? homeTeam : awayTeam;
}

function getRoundTitle(fixture) {
  return fixture.group_name
    || fixture.group
    || (fixture.round ? `Round ${fixture.round}` : null);
}

function findNumericAttributeByPattern(object, pattern) {
  for (const [key, value] of Object.entries(object ?? {})) {
    if (!pattern.test(key)) {
      continue;
    }

    const parsed = toNullableInteger(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

/**
 * Reads Opta fixture halftime scores when the RU1 feed exposes a team-level field.
 */
function getFixtureHalfTimeScore(team) {
  return findNumericAttributeByPattern(team, /(?:half|ht).*score|score.*(?:half|ht)/i);
}

/**
 * Maps one Opta fixture element into the npc_matches write model.
 */
function mapFixtureMatch(fixture, teams, options) {
  const homeTeam = getFixtureTeam(teams, "home");
  const awayTeam = getFixtureTeam(teams, "away");

  if (!fixture.id || isPlaceholderTeam(homeTeam) || isPlaceholderTeam(awayTeam)) {
    return null;
  }

  if (options.round !== null && toNullableInteger(fixture.round) !== options.round) {
    return null;
  }

  const resultStatus = getResultStatus(fixture);

  if (!options.includeFixtures && resultStatus !== "settled" && resultStatus !== "abandoned") {
    return null;
  }

  const winner = getWinner(homeTeam, awayTeam, resultStatus);

  return {
    away_score: resultStatus === "settled" ? toNullableInteger(awayTeam.score) : null,
    away_half_time_score: resultStatus === "settled" ? getFixtureHalfTimeScore(awayTeam) : null,
    away_team_name: awayTeam.teamname ?? null,
    away_team_source_id: awayTeam.team_id ?? null,
    competition_id: toNullableInteger(fixture.comp_id),
    home_score: resultStatus === "settled" ? toNullableInteger(homeTeam.score) : null,
    home_half_time_score: resultStatus === "settled" ? getFixtureHalfTimeScore(homeTeam) : null,
    home_team_name: homeTeam.teamname ?? null,
    home_team_source_id: homeTeam.team_id ?? null,
    kickoff_at: toIsoTimestamp(fixture.datetime),
    match_mode: fixture.status ?? null,
    match_state: fixture.status ?? null,
    raw: {
      awayTeam: awayTeam,
      fixture: fixture,
      homeTeam: homeTeam,
    },
    result_status: resultStatus,
    round_number: toNullableInteger(fixture.round),
    round_title: getRoundTitle(fixture),
    season: options.season,
    source: SOURCE_NAME,
    source_match_id: String(fixture.id),
    source_url: `${OFFICIAL_NPC_PAGE_URL}?match=${fixture.id}`,
    venue_city: null,
    venue_name: fixture.venue ?? null,
    winner_team_name: winner?.teamname ?? null,
    winner_team_source_id: winner?.team_id ?? null,
  };
}

/**
 * Maps Opta team rows into the npc_teams write model.
 */
function mapTeam(team) {
  if (isPlaceholderTeam(team)) {
    return null;
  }

  const displayName = team.teamname ?? team.name;

  if (!displayName) {
    return null;
  }

  return {
    abbreviation: team.teamabbr ?? null,
    display_name: displayName,
    name: displayName,
    nick_name: null,
    raw: {
      teamUuid: team.team_uuid ?? null,
    },
    source: SOURCE_NAME,
    source_team_id: String(team.team_id ?? team.id),
    team_key: normalizeName(displayName),
  };
}

/**
 * Parses the Opta RU1 season XML into normalized fixture and team rows.
 */
function parseOfficialNpcXml(xml, options) {
  const matches = [];
  const teams = [];

  for (const match of xml.matchAll(/<fixture\b([^>]*)>([\s\S]*?)<\/fixture>/g)) {
    const fixture = parseAttributes(match[1]);
    const fixtureTeams = Array.from(match[2].matchAll(/<team\b([^>]*)\/>/g))
      .map((teamMatch) => parseAttributes(teamMatch[1]));
    const row = mapFixtureMatch(fixture, fixtureTeams, options);

    if (row) {
      matches.push(row);
      teams.push(mapTeam(fixtureTeams.find((team) => team.home_or_away === "home")));
      teams.push(mapTeam(fixtureTeams.find((team) => team.home_or_away === "away")));
    }
  }

  for (const match of xml.matchAll(/<teams>\s*([\s\S]*?)<\/teams>/g)) {
    for (const teamMatch of match[1].matchAll(/<team\b([^>]*)\/>/g)) {
      const team = parseAttributes(teamMatch[1]);
      teams.push(mapTeam({
        name: team.name,
        team_id: team.id,
        team_uuid: team.team_uuid,
      }));
    }
  }

  return {
    appearances: [],
    detailErrors: [],
    matches: dedupeByKey(matches, "source_match_id"),
    players: [],
    teams: dedupeByKey(teams.filter(Boolean), "source_team_id"),
    tryScorers: [],
  };
}

function dedupeByKey(rows, key) {
  const byKey = new Map();

  for (const row of rows) {
    byKey.set(row[key], row);
  }

  return Array.from(byKey.values());
}

/**
 * Merges one-player-stat elements into a single player stat object.
 */
function parsePlayerStats(playerXml) {
  const stats = {};

  for (const match of playerXml.matchAll(/<PlayerStat\b([^>]*)\/>/g)) {
    Object.assign(stats, parseAttributes(match[1]));
  }

  return stats;
}

/**
 * Builds a display time from Opta event minute and second attributes.
 */
function getDisplayMinute(event) {
  const minute = toNullableInteger(event.minute);
  const second = toNullableInteger(event.second);

  if (minute === null) {
    return null;
  }

  if (second !== null && second > 0) {
    return `${minute}:${String(second).padStart(2, "0")}`;
  }

  return `${minute}'`;
}

/**
 * Maps official RU7 match detail into player, appearance, and try rows.
 */
function parseOfficialNpcMatchDetailXml(xml, matchRow) {
  const root = parseAttributes(xml.match(/<RRML\b([^>]*)>/)?.[1] ?? "");
  const sourceMatchId = String(root.id ?? matchRow.source_match_id);
  const resultStatus = getMatchDetailResultStatus(root, matchRow.result_status);
  const appearances = [];
  const players = [];
  const playerById = new Map();
  const teamById = new Map();

  for (const teamMatch of xml.matchAll(/<Team\b([^>]*)>([\s\S]*?)<\/Team>/g)) {
    const team = parseAttributes(teamMatch[1]);
    const sourceTeamId = String(team.team_id ?? "");
    const teamName = team.team_name ?? null;

    if (sourceTeamId) {
      teamById.set(sourceTeamId, teamName);
    }

    for (const playerMatch of teamMatch[2].matchAll(/<Player\b([^>]*)>([\s\S]*?)<\/Player>/g)) {
      const player = parseAttributes(playerMatch[1]);
      const stats = parsePlayerStats(playerMatch[2]);
      const playerId = String(player.id ?? "");
      const playerName = player.player_name ?? firstNonBlank(player.playerFirstName, player.playerLastName);

      if (!playerId || !playerName || !sourceTeamId || !teamName) {
        continue;
      }

      const playerRow = {
        display_name: playerName,
        first_name: player.playerFirstName ?? null,
        jersey_number: toNullableInteger(player.shirtNum),
        last_name: player.playerLastName ?? null,
        latest_team_source_id: sourceTeamId,
        player_key: normalizeName(playerName),
        position: player.position ?? null,
        raw: {
          latestTeamName: teamName,
          playerFirstInitial: player.playerFirstInitial ?? null,
          playerUuid: player.player_uuid ?? null,
          positionId: player.position_id ?? null,
        },
        source: SOURCE_NAME,
        source_player_id: playerId,
      };

      players.push(playerRow);
      playerById.set(playerId, {
        playerName,
        sourceTeamId,
        teamName,
      });
      appearances.push({
        is_on_field: toNullableBoolean(player.playerTookTheField),
        jersey_number: toNullableInteger(player.shirtNum),
        player_name: playerName,
        position: player.position ?? null,
        raw: {
          feedType: DEFAULT_OPTA_MATCH_DETAIL_FEED_TYPE,
          playerTookTheField: player.playerTookTheField ?? null,
          playerUuid: player.player_uuid ?? null,
          positionId: player.position_id ?? null,
          stats,
          teamHomeOrAway: team.home_or_away ?? null,
          teamUuid: team.team_uuid ?? null,
        },
        result_status: resultStatus,
        source: SOURCE_NAME,
        source_appearance_key: `${SOURCE_NAME}:${sourceMatchId}:${playerId}`,
        source_match_id: sourceMatchId,
        source_player_id: playerId,
        source_team_id: sourceTeamId,
        team_name: teamName,
      });
    }
  }

  const tryScorers = [];
  let tryIndex = 0;

  for (const eventMatch of xml.matchAll(/<Event\b([^>]*)\/>/g)) {
    const event = parseAttributes(eventMatch[1]);

    if (normalizeName(event.type) !== "try") {
      continue;
    }

    const playerId = String(event.player_id ?? "");
    const player = playerById.get(playerId);
    const sourceTeamId = String(event.team_id ?? player?.sourceTeamId ?? "");
    const teamName = teamById.get(sourceTeamId) ?? player?.teamName ?? null;
    const minute = toNullableInteger(event.minute) ?? 0;
    const second = toNullableInteger(event.second) ?? 0;

    if (!playerId || !player?.playerName || !sourceTeamId || !teamName) {
      continue;
    }

    tryScorers.push({
      away_score: null,
      display_minute: getDisplayMinute(event),
      game_seconds: minute * 60 + second,
      home_score: null,
      player_name: player.playerName,
      raw: {
        event,
        feedType: DEFAULT_OPTA_MATCH_DETAIL_FEED_TYPE,
      },
      source: SOURCE_NAME,
      source_match_id: sourceMatchId,
      source_player_id: playerId,
      source_team_id: sourceTeamId,
      source_try_key: `${SOURCE_NAME}:${sourceMatchId}:try:${playerId}:${minute}:${second}:${tryIndex}`,
      team_name: teamName,
    });
    tryIndex += 1;
  }

  return {
    appearances,
    players,
    sourceMatchId,
    tryScorers,
  };
}

/**
 * Fetches and parses official RU7 match-detail rows for source-backed player stats.
 */
async function fetchOfficialNpcMatchDetailRows(matches, options) {
  const selectedMatches = options.matchDetailLimit === null
    ? matches
    : matches.slice(0, options.matchDetailLimit);
  const detailRows = {
    appearances: [],
    detailErrors: [],
    players: [],
    tryScorers: [],
  };

  for (const match of selectedMatches) {
    try {
      const xml = await fetchOfficialNpcMatchDetailXml(match.source_match_id);
      const rows = parseOfficialNpcMatchDetailXml(xml, match);

      detailRows.appearances.push(...rows.appearances);
      detailRows.players.push(...rows.players);
      detailRows.tryScorers.push(...rows.tryScorers);
    } catch (error) {
      detailRows.detailErrors.push({
        message: error.message,
        sourceMatchId: match.source_match_id,
      });
    }
  }

  if (selectedMatches.length > 0 && detailRows.detailErrors.length === selectedMatches.length) {
    throw new Error(`Official NPC Opta match details failed for all ${selectedMatches.length} requested fixtures.`);
  }

  return {
    appearances: dedupeByKey(detailRows.appearances, "source_appearance_key"),
    detailErrors: detailRows.detailErrors,
    players: dedupeByKey(detailRows.players, "source_player_id"),
    tryScorers: dedupeByKey(detailRows.tryScorers, "source_try_key"),
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
 * Minimal Supabase REST client for service-role NPC official result upserts.
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
    upsert,
  };
}

/**
 * Persists official NPC team and match rows for downstream reconciliation.
 */
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

  const supabase = createSupabaseRestClient(config, options.batchSize);

  await supabase.upsert("npc_teams", rows.teams, "source,source_team_id");
  await supabase.upsert("npc_matches", rows.matches, "source,source_match_id");
  await supabase.upsert("npc_players", rows.players, "source,source_player_id");
  await supabase.upsert("npc_player_match_appearances", rows.appearances, "source_appearance_key");
  await supabase.upsert("npc_try_scorers", rows.tryScorers, "source_try_key");

  return {
    npcPlayerMatchAppearances: rows.appearances.length,
    npcPlayers: rows.players.length,
    npcMatches: rows.matches.length,
    npcTeams: rows.teams.length,
    npcTryScorers: rows.tryScorers.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Produces a compact official NPC refresh report.
 */
function summarize(rows, options) {
  const byStatus = rows.matches.reduce((summary, row) => {
    summary[row.result_status] = (summary[row.result_status] ?? 0) + 1;
    return summary;
  }, {});

  return {
    competitionId: options.competitionId,
    detailErrors: rows.detailErrors.length,
    matchDetailsEnabled: options.includeMatchDetails,
    npcPlayerMatchAppearances: rows.appearances.length,
    npcMatches: rows.matches.length,
    npcPlayers: rows.players.length,
    npcTeams: rows.teams.length,
    npcTryScorers: rows.tryScorers.length,
    optaSeason: options.optaSeason,
    resultStatuses: byStatus,
    round: options.round,
    season: options.season,
  };
}

/**
 * Runs the local official NPC fixture/result ingestion workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const xml = await fetchOfficialNpcXml(options);
  const rows = parseOfficialNpcXml(xml, options);

  if (options.includeMatchDetails) {
    const detailRows = await fetchOfficialNpcMatchDetailRows(rows.matches, options);

    rows.appearances = detailRows.appearances;
    rows.detailErrors = detailRows.detailErrors;
    rows.players = detailRows.players;
    rows.tryScorers = detailRows.tryScorers;
  }

  const summary = summarize(rows, options);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.matches.slice(0, 5).map((row) => ({
        away: row.away_team_name,
        awayScore: row.away_score,
        home: row.home_team_name,
        homeScore: row.home_score,
        kickoffAt: row.kickoff_at,
        resultStatus: row.result_status,
        round: row.round_number,
        sourceMatchId: row.source_match_id,
        winner: row.winner_team_name,
      })),
      detailErrors: rows.detailErrors.slice(0, 5),
      playerSample: rows.appearances.slice(0, 5).map((row) => ({
        isOnField: row.is_on_field,
        playerName: row.player_name,
        sourceMatchId: row.source_match_id,
        teamName: row.team_name,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(rows, options);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
