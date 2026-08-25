import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const OFFICIAL_NRL_ORIGIN = "https://www.nrl.com";
const OFFICIAL_NRL_DRAW_URL = `${OFFICIAL_NRL_ORIGIN}/draw/data`;
const SOURCE_NAME = "official_nrl";

/**
 * Parses official NRL settlement refresh options for one season round range.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    fromRound: null,
    includeFixtures: false,
    requireSupabase: false,
    round: null,
    season: null,
    toRound: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--include-fixtures") {
      options.includeFixtures = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    } else if (arg.startsWith("--round=")) {
      options.round = Number(arg.slice("--round=".length));
    } else if (arg.startsWith("--from-round=")) {
      options.fromRound = Number(arg.slice("--from-round=".length));
    } else if (arg.startsWith("--to-round=")) {
      options.toRound = Number(arg.slice("--to-round=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("Pass --season=YYYY.");
  }

  if (options.round !== null && (options.fromRound !== null || options.toRound !== null)) {
    throw new Error("Pass either --round=N or --from-round=N --to-round=N, not both.");
  }

  if (options.round !== null) {
    if (!isPositiveInteger(options.round)) {
      throw new Error("--round must be a positive integer.");
    }

    options.fromRound = options.round;
    options.toRound = options.round;
  }

  if (!isPositiveInteger(options.fromRound) || !isPositiveInteger(options.toRound)) {
    throw new Error("Pass --round=N or both --from-round=N and --to-round=N.");
  }

  if (options.fromRound > options.toRound) {
    throw new Error("--from-round must be before or equal to --to-round.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
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

function toAbsoluteNrlUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, OFFICIAL_NRL_ORIGIN).href;
  } catch {
    return null;
  }
}

function getNrlHeaders(referer) {
  return {
    accept: "application/json,text/plain,*/*",
    referer: referer ?? `${OFFICIAL_NRL_ORIGIN}/draw/`,
    "user-agent": "Mozilla/5.0 (compatible; FeelingGambaBot/0.1; +https://www.nrl.com)",
  };
}

/**
 * Fetches one official NRL JSON endpoint using headers required by the public web route.
 */
async function fetchOfficialNrlJson(url, referer) {
  const response = await fetch(url, {
    headers: getNrlHeaders(referer),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Official NRL request failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return await response.json();
}

/**
 * Fetches official NRL fixture rows for one competition round.
 */
async function fetchDrawRound(season, round) {
  const url = new URL(OFFICIAL_NRL_DRAW_URL);
  url.searchParams.set("competition", "111");
  url.searchParams.set("round", String(round));
  url.searchParams.set("season", String(season));

  return await fetchOfficialNrlJson(url, `${OFFICIAL_NRL_ORIGIN}/draw/?competition=111&round=${round}&season=${season}`);
}

function isSettledFixture(fixture) {
  return fixture?.matchState === "FullTime" || fixture?.matchMode === "Post";
}

function getMatchDataUrl(fixture) {
  const matchCentreUrl = fixture?.matchCentreUrl;

  if (!matchCentreUrl) {
    return null;
  }

  return toAbsoluteNrlUrl(`${matchCentreUrl.replace(/\/?$/, "/")}data`);
}

/**
 * Fetches match-centre data for completed matches or optional fixture shells in the selected rounds.
 */
async function fetchSettlementPayloads(options) {
  const rounds = [];
  const skippedFixtures = [];
  const matchPayloads = [];

  for (let round = options.fromRound; round <= options.toRound; round += 1) {
    const drawPayload = await fetchDrawRound(options.season, round);
    const fixtures = drawPayload.fixtures ?? [];
    const completedFixtures = fixtures.filter(isSettledFixture);
    const selectedFixtures = options.includeFixtures ? fixtures : completedFixtures;

    rounds.push({
      completedFixtures: completedFixtures.length,
      fixtureCount: fixtures.length,
      selectedFixtures: selectedFixtures.length,
      round,
      selectedCompetitionId: drawPayload.selectedCompetitionId ?? null,
      selectedRoundId: drawPayload.selectedRoundId ?? null,
      selectedSeasonId: drawPayload.selectedSeasonId ?? null,
    });

    for (const fixture of selectedFixtures) {
      const dataUrl = getMatchDataUrl(fixture);

      if (!dataUrl) {
        skippedFixtures.push({
          matchCentreUrl: fixture.matchCentreUrl ?? null,
          reason: "missing_match_centre_url",
          round,
        });
        continue;
      }

      const matchPayload = await fetchOfficialNrlJson(dataUrl, toAbsoluteNrlUrl(fixture.matchCentreUrl));

      matchPayloads.push({
        fixture,
        matchPayload,
        round,
      });
    }
  }

  return {
    matchPayloads,
    rounds,
    skippedFixtures,
  };
}

function getTeamDisplayName(team) {
  return team?.nickName ?? team?.name ?? null;
}

function mapTeam(team) {
  if (!team?.teamId || !getTeamDisplayName(team)) {
    return null;
  }

  return {
    abbreviation: null,
    display_name: getTeamDisplayName(team),
    name: team.name ?? null,
    nick_name: team.nickName ?? null,
    raw: {
      url: team.url ?? null,
    },
    source: SOURCE_NAME,
    source_team_id: String(team.teamId),
    team_key: normalizeName(getTeamDisplayName(team)),
  };
}

function getPlayerDisplayName(player) {
  return [player?.firstName, player?.lastName].filter(Boolean).join(" ") || null;
}

function mapPlayer(player, team) {
  if (!player?.playerId || !getPlayerDisplayName(player)) {
    return null;
  }

  return {
    display_name: getPlayerDisplayName(player),
    first_name: player.firstName ?? null,
    jersey_number: toNullableInteger(player.number),
    last_name: player.lastName ?? null,
    latest_team_source_id: team?.teamId ? String(team.teamId) : null,
    player_key: normalizeName(getPlayerDisplayName(player)),
    position: player.position ?? null,
    raw: {
      bodyImage: player.bodyImage ?? null,
      headImage: player.headImage ?? null,
      isOnField: player.isOnField ?? null,
      url: player.url ?? null,
    },
    source: SOURCE_NAME,
    source_player_id: String(player.playerId),
  };
}

/**
 * Maps one match roster entry to the appearance denominator for try-scorer rates.
 */
function mapPlayerAppearance(player, team, matchPayload) {
  if (!player?.playerId || !team?.teamId || !matchPayload?.matchId || !getPlayerDisplayName(player)) {
    return null;
  }

  const sourcePlayerId = String(player.playerId);
  const sourceTeamId = String(team.teamId);

  return {
    is_on_field: typeof player.isOnField === "boolean" ? player.isOnField : null,
    jersey_number: toNullableInteger(player.number),
    player_name: getPlayerDisplayName(player),
    position: player.position ?? null,
    raw: {
      bodyImage: player.bodyImage ?? null,
      headImage: player.headImage ?? null,
      url: player.url ?? null,
    },
    result_status: getResultStatus(matchPayload),
    source: SOURCE_NAME,
    source_appearance_key: [
      SOURCE_NAME,
      matchPayload.matchId,
      sourceTeamId,
      sourcePlayerId,
    ].join(":"),
    source_match_id: String(matchPayload.matchId),
    source_player_id: sourcePlayerId,
    source_team_id: sourceTeamId,
    team_name: getTeamDisplayName(team),
  };
}

function getWinnerTeam(matchPayload) {
  const homeScore = toNullableInteger(matchPayload.homeTeam?.score);
  const awayScore = toNullableInteger(matchPayload.awayTeam?.score);

  if (homeScore === null || awayScore === null || homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore ? matchPayload.homeTeam : matchPayload.awayTeam;
}

function getResultStatus(matchPayload) {
  if (matchPayload.matchState === "FullTime" || matchPayload.matchMode === "Post") {
    return "settled";
  }

  if (matchPayload.matchState === "Upcoming" || matchPayload.matchMode === "Pre") {
    return "pending";
  }

  if (matchPayload.matchState === "Abandoned") {
    return "abandoned";
  }

  return "unknown";
}

function mapMatch(matchPayload, round) {
  if (!matchPayload?.matchId) {
    return null;
  }

  const winner = getWinnerTeam(matchPayload);

  return {
    away_score: toNullableInteger(matchPayload.awayTeam?.score),
    away_team_name: getTeamDisplayName(matchPayload.awayTeam),
    away_team_source_id: matchPayload.awayTeam?.teamId ? String(matchPayload.awayTeam.teamId) : null,
    competition_id: toNullableInteger(matchPayload.competition?.competitionId ?? 111),
    home_score: toNullableInteger(matchPayload.homeTeam?.score),
    home_team_name: getTeamDisplayName(matchPayload.homeTeam),
    home_team_source_id: matchPayload.homeTeam?.teamId ? String(matchPayload.homeTeam.teamId) : null,
    kickoff_at: matchPayload.startTime ?? null,
    match_mode: matchPayload.matchMode ?? null,
    match_state: matchPayload.matchState ?? null,
    raw: {
      attendance: matchPayload.attendance ?? null,
      groundConditions: matchPayload.groundConditions ?? null,
      hasExtraTime: matchPayload.hasExtraTime ?? null,
      updated: matchPayload.updated ?? null,
      weather: matchPayload.weather ?? null,
    },
    result_status: getResultStatus(matchPayload),
    round_number: toNullableInteger(matchPayload.roundNumber ?? round),
    round_title: matchPayload.roundTitle ?? null,
    season: toNullableInteger(matchPayload.startTime?.slice(0, 4)) ?? new Date().getUTCFullYear(),
    source: SOURCE_NAME,
    source_match_id: String(matchPayload.matchId),
    source_url: toAbsoluteNrlUrl(matchPayload.url),
    venue_city: matchPayload.venueCity ?? null,
    venue_name: matchPayload.venue ?? null,
    winner_team_name: winner ? getTeamDisplayName(winner) : null,
    winner_team_source_id: winner?.teamId ? String(winner.teamId) : null,
  };
}

function buildPlayerNameLookup(matchPayload) {
  const players = [
    ...(matchPayload.homeTeam?.players ?? []),
    ...(matchPayload.awayTeam?.players ?? []),
  ];
  const byId = new Map();

  for (const player of players) {
    if (player?.playerId) {
      byId.set(String(player.playerId), getPlayerDisplayName(player));
    }
  }

  return byId;
}

function buildTeamNameLookup(matchPayload) {
  return new Map([
    [String(matchPayload.homeTeam?.teamId), getTeamDisplayName(matchPayload.homeTeam)],
    [String(matchPayload.awayTeam?.teamId), getTeamDisplayName(matchPayload.awayTeam)],
  ]);
}

function getDisplayMinute(gameSeconds) {
  const seconds = toNullableInteger(gameSeconds);

  if (seconds === null) {
    return null;
  }

  return `${Math.floor(seconds / 60) + 1}'`;
}

function mapTryScorers(matchPayload) {
  const playerNames = buildPlayerNameLookup(matchPayload);
  const teamNames = buildTeamNameLookup(matchPayload);
  const rows = [];

  for (const [index, event] of (matchPayload.timeline ?? []).entries()) {
    if (event?.type !== "Try" || !event.playerId || !event.teamId) {
      continue;
    }

    const sourcePlayerId = String(event.playerId);
    const sourceTeamId = String(event.teamId);
    const gameSeconds = toNullableInteger(event.gameSeconds);

    if (gameSeconds === null) {
      continue;
    }

    const playerName = playerNames.get(sourcePlayerId);
    const teamName = teamNames.get(sourceTeamId);

    if (!playerName || !teamName) {
      continue;
    }

    rows.push({
      away_score: toNullableInteger(event.awayScore),
      display_minute: getDisplayMinute(gameSeconds),
      game_seconds: gameSeconds,
      home_score: toNullableInteger(event.homeScore),
      player_name: playerName,
      raw: {
        timelineIndex: index,
        title: event.title ?? null,
        type: event.type,
      },
      source: SOURCE_NAME,
      source_match_id: String(matchPayload.matchId),
      source_player_id: sourcePlayerId,
      source_team_id: sourceTeamId,
      source_try_key: [
        SOURCE_NAME,
        matchPayload.matchId,
        gameSeconds,
        sourceTeamId,
        sourcePlayerId,
        index,
      ].join(":"),
      team_name: teamName,
    });
  }

  return rows;
}

function dedupeByKey(rows, key) {
  const byKey = new Map();

  for (const row of rows) {
    byKey.set(row[key], row);
  }

  return Array.from(byKey.values());
}

/**
 * Maps official NRL match-centre payloads into normalized Supabase rows.
 */
function mapRows(matchPayloads) {
  const appearances = [];
  const teams = [];
  const players = [];
  const matches = [];
  const tryScorers = [];

  for (const { matchPayload, round } of matchPayloads) {
    teams.push(mapTeam(matchPayload.homeTeam), mapTeam(matchPayload.awayTeam));

    for (const player of matchPayload.homeTeam?.players ?? []) {
      players.push(mapPlayer(player, matchPayload.homeTeam));
      appearances.push(mapPlayerAppearance(player, matchPayload.homeTeam, matchPayload));
    }

    for (const player of matchPayload.awayTeam?.players ?? []) {
      players.push(mapPlayer(player, matchPayload.awayTeam));
      appearances.push(mapPlayerAppearance(player, matchPayload.awayTeam, matchPayload));
    }

    matches.push(mapMatch(matchPayload, round));
    tryScorers.push(...mapTryScorers(matchPayload));
  }

  return {
    appearances: dedupeByKey(appearances.filter(Boolean), "source_appearance_key"),
    matches: dedupeByKey(matches.filter(Boolean), "source_match_id"),
    players: dedupeByKey(players.filter(Boolean), "source_player_id"),
    teams: dedupeByKey(teams.filter(Boolean), "source_team_id"),
    tryScorers: dedupeByKey(tryScorers, "source_try_key"),
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
 * Minimal Supabase REST client for service-role NRL settlement upserts.
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
    upsert,
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

  const supabase = createSupabaseRestClient(config, options.batchSize);

  await supabase.upsert("nrl_teams", rows.teams, "source,source_team_id");
  await supabase.upsert("nrl_players", rows.players, "source,source_player_id");
  await supabase.upsert("nrl_matches", rows.matches, "source,source_match_id");
  await supabase.upsert("nrl_player_match_appearances", rows.appearances, "source_appearance_key");
  await supabase.upsert("nrl_try_scorers", rows.tryScorers, "source_try_key");

  return {
    nrlMatches: rows.matches.length,
    nrlPlayerMatchAppearances: rows.appearances.length,
    nrlPlayers: rows.players.length,
    nrlTeams: rows.teams.length,
    nrlTryScorers: rows.tryScorers.length,
    ok: true,
    skipped: false,
  };
}

function summarize(rows, source) {
  return {
    rounds: source.rounds,
    skippedFixtures: source.skippedFixtures,
    nrlMatches: rows.matches.length,
    nrlPlayerMatchAppearances: rows.appearances.length,
    nrlPlayers: rows.players.length,
    nrlTeams: rows.teams.length,
    nrlTryScorers: rows.tryScorers.length,
    pendingMatches: rows.matches.filter((row) => row.result_status === "pending").length,
    settledMatches: rows.matches.filter((row) => row.result_status === "settled").length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const source = await fetchSettlementPayloads(options);
  const rows = mapRows(source.matchPayloads);
  const summary = summarize(rows, source);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
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
