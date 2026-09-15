import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const NFLVERSE_GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const SOURCE_NAME = "official_nfl";
const TEAM_NAMES = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams",
  LAC: "Los Angeles Chargers",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
  OAK: "Oakland Raiders",
  SD: "San Diego Chargers",
  STL: "St. Louis Rams",
};
const TEAM_NICKNAMES = {
  ARI: "Cardinals",
  ATL: "Falcons",
  BAL: "Ravens",
  BUF: "Bills",
  CAR: "Panthers",
  CHI: "Bears",
  CIN: "Bengals",
  CLE: "Browns",
  DAL: "Cowboys",
  DEN: "Broncos",
  DET: "Lions",
  GB: "Packers",
  HOU: "Texans",
  IND: "Colts",
  JAX: "Jaguars",
  KC: "Chiefs",
  LA: "Rams",
  LAC: "Chargers",
  LV: "Raiders",
  MIA: "Dolphins",
  MIN: "Vikings",
  NE: "Patriots",
  NO: "Saints",
  NYG: "Giants",
  NYJ: "Jets",
  PHI: "Eagles",
  PIT: "Steelers",
  SEA: "Seahawks",
  SF: "49ers",
  TB: "Buccaneers",
  TEN: "Titans",
  WAS: "Commanders",
  OAK: "Raiders",
  SD: "Chargers",
  STL: "Rams",
};

/**
 * Parses nflverse result refresh options for one season week range.
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
    seasonType: 2,
    sourceUrl: NFLVERSE_GAMES_URL,
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
    } else if (arg.startsWith("--season-type=")) {
      options.seasonType = Number(arg.slice("--season-type=".length));
    } else if (arg.startsWith("--round=")) {
      options.round = Number(arg.slice("--round=".length));
    } else if (arg.startsWith("--from-round=")) {
      options.fromRound = Number(arg.slice("--from-round=".length));
    } else if (arg.startsWith("--to-round=")) {
      options.toRound = Number(arg.slice("--to-round=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--source-url=")) {
      options.sourceUrl = arg.slice("--source-url=".length);
    }
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("Pass --season=YYYY.");
  }

  if (![1, 2, 3].includes(options.seasonType)) {
    throw new Error("--season-type must be 1, 2, or 3.");
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
 * Minimal Supabase REST client for NFL result writes.
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

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toNullableInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function getSeasonTypeForGameType(gameType) {
  if (gameType === "PRE") {
    return 1;
  }

  if (gameType === "REG") {
    return 2;
  }

  return 3;
}

function getRoundTitle(gameType, round) {
  const postseasonRounds = {
    CONF: "Conference Championship",
    DIV: "Divisional Round",
    SB: "Super Bowl",
    WC: "Wild Card",
  };

  return postseasonRounds[gameType] ?? `Week ${round}`;
}

function getTeamName(abbreviation) {
  return TEAM_NAMES[abbreviation] ?? abbreviation;
}

function getTeamNickname(abbreviation) {
  return TEAM_NICKNAMES[abbreviation] ?? getTeamName(abbreviation);
}

function getFirstSundayOfMonth(year, monthIndex) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  const day = date.getUTCDay();
  return 1 + ((7 - day) % 7);
}

function getSecondSundayOfMonth(year, monthIndex) {
  return getFirstSundayOfMonth(year, monthIndex) + 7;
}

function getEasternOffsetHours(year, monthIndex, day) {
  const dstStartDay = getSecondSundayOfMonth(year, 2);
  const dstEndDay = getFirstSundayOfMonth(year, 10);
  const afterDstStart = monthIndex > 2 || (monthIndex === 2 && day >= dstStartDay);
  const beforeDstEnd = monthIndex < 10 || (monthIndex === 10 && day < dstEndDay);

  return afterDstStart && beforeDstEnd ? -4 : -5;
}

function getKickoffAt(row) {
  if (!row.gameday) {
    return null;
  }

  const [year, month, day] = row.gameday.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const [hour, minute] = String(row.gametime || "12:00").split(":").map(Number);
  const monthIndex = month - 1;
  const offset = getEasternOffsetHours(year, monthIndex, day);
  const utc = Date.UTC(year, monthIndex, day, (Number.isInteger(hour) ? hour : 12) - offset, Number.isInteger(minute) ? minute : 0, 0);

  return new Date(utc).toISOString();
}

function getResultStatus(row) {
  const homeScore = toNullableInteger(row.home_score);
  const awayScore = toNullableInteger(row.away_score);

  return homeScore !== null && awayScore !== null ? "settled" : "pending";
}

/**
 * Parses RFC 4180-ish CSV without pulling in another ingestion dependency.
 */
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(field);
      field = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() ?? [];

  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

/**
 * Fetches the nflverse games CSV used for schedule and final-score settlement.
 */
async function fetchNflverseGames(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/csv,text/plain,*/*",
      "user-agent": "FeelingGambaIngestion/1.0",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`nflverse games.csv failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return parseCsv(await response.text());
}

/**
 * Maps one nflverse team abbreviation into the NFL team source table.
 */
function mapTeam(abbreviation) {
  const displayName = getTeamName(abbreviation);

  if (!abbreviation || !displayName) {
    return null;
  }

  return {
    abbreviation,
    display_name: displayName,
    name: getTeamNickname(abbreviation),
    raw: {
      abbreviation,
      dataSource: "nflverse/nfldata games.csv",
    },
    source: SOURCE_NAME,
    source_team_id: abbreviation,
    team_key: normalizeKey(displayName),
  };
}

/**
 * Maps one nflverse game row into the NFL match source table.
 */
function mapMatch(row) {
  const homeScore = toNullableInteger(row.home_score);
  const awayScore = toNullableInteger(row.away_score);
  const status = getResultStatus(row);
  const winner = status === "settled" && homeScore !== null && awayScore !== null && homeScore !== awayScore
    ? homeScore > awayScore
      ? row.home_team
      : row.away_team
    : null;

  return {
    away_score: awayScore,
    away_team_name: getTeamName(row.away_team),
    away_team_source_id: row.away_team || null,
    home_score: homeScore,
    home_team_name: getTeamName(row.home_team),
    home_team_source_id: row.home_team || null,
    kickoff_at: getKickoffAt(row),
    match_state: status === "settled" ? "Final" : "Scheduled",
    raw: {
      ...row,
      dataSource: "nflverse/nfldata games.csv",
    },
    result_status: status,
    round_number: toNullableInteger(row.week),
    round_title: getRoundTitle(row.game_type, toNullableInteger(row.week)),
    season: toNullableInteger(row.season),
    season_type: getSeasonTypeForGameType(row.game_type),
    source: SOURCE_NAME,
    source_match_id: row.game_id,
    source_url: "https://github.com/nflverse/nfldata/blob/master/data/games.csv",
    venue_city: null,
    venue_name: row.stadium || null,
    winner_team_name: winner ? getTeamName(winner) : null,
    winner_team_source_id: winner,
  };
}

/**
 * Fetches nflverse rows for the selected season/week range.
 */
async function fetchRows(options) {
  const sourceRows = await fetchNflverseGames(options.sourceUrl);
  const matches = [];
  const teamsBySourceId = new Map();
  const weeksByRound = new Map();

  for (const row of sourceRows) {
    const season = toNullableInteger(row.season);
    const round = toNullableInteger(row.week);
    const seasonType = getSeasonTypeForGameType(row.game_type);

    if (
      season !== options.season
      || seasonType !== options.seasonType
      || !round
      || round < options.fromRound
      || round > options.toRound
    ) {
      continue;
    }

    const status = getResultStatus(row);
    const week = weeksByRound.get(round) ?? {
      eventCount: 0,
      round,
      selectedEvents: 0,
      seasonType: options.seasonType,
    };
    week.eventCount += 1;

    if (!options.includeFixtures && status !== "settled") {
      weeksByRound.set(round, week);
      continue;
    }

    week.selectedEvents += 1;
    weeksByRound.set(round, week);

    for (const team of [mapTeam(row.home_team), mapTeam(row.away_team)].filter(Boolean)) {
      teamsBySourceId.set(team.source_team_id, team);
    }

    const match = mapMatch(row);

    if (match.source_match_id && match.home_team_name && match.away_team_name) {
      matches.push(match);
    }
  }

  return {
    matches,
    teams: Array.from(teamsBySourceId.values()),
    weeks: Array.from(weeksByRound.values()).sort((left, right) => left.round - right.round),
  };
}

/**
 * Persists nflverse NFL team and match rows.
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
  await supabase.upsert("nfl_teams", rows.teams, "source,source_team_id");
  await supabase.upsert("nfl_matches", rows.matches, "source,source_match_id");

  return {
    nflMatches: rows.matches.length,
    nflTeams: rows.teams.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Runs the local nflverse NFL result refresh workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const rows = await fetchRows(options);
  const summary = {
    matches: rows.matches.length,
    sourceUrl: options.sourceUrl,
    teams: rows.teams.length,
    weeks: rows.weeks,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.matches.slice(0, 5).map((match) => ({
        away: match.away_team_name,
        awayScore: match.away_score,
        home: match.home_team_name,
        homeScore: match.home_score,
        kickoffAt: match.kickoff_at,
        resultStatus: match.result_status,
        round: match.round_number,
        winner: match.winner_team_name,
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
