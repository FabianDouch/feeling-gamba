import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SOURCE_NAME = "official_nfl";

/**
 * Parses ESPN NFL result refresh options for one season week range.
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

function getCompetitor(competition, homeAway) {
  return (competition?.competitors ?? []).find((competitor) => competitor?.homeAway === homeAway) ?? null;
}

function getResultStatus(event) {
  const status = event?.status?.type;

  if (status?.completed === true) {
    return "settled";
  }

  if (status?.state === "pre" || status?.state === "in") {
    return "pending";
  }

  if (["STATUS_CANCELED", "STATUS_POSTPONED"].includes(status?.name)) {
    return "abandoned";
  }

  return "unknown";
}

/**
 * Fetches one ESPN NFL scoreboard week.
 */
async function fetchScoreboardWeek(season, seasonType, round) {
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set("dates", String(season));
  url.searchParams.set("limit", "100");
  url.searchParams.set("seasontype", String(seasonType));
  url.searchParams.set("week", String(round));

  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.espn.com/nfl/scoreboard/",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ESPN NFL scoreboard failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return await response.json();
}

/**
 * Maps one ESPN team payload into the NFL team source table.
 */
function mapTeam(competitor) {
  const team = competitor?.team;
  const sourceTeamId = String(team?.id ?? "").trim();
  const displayName = team?.displayName ?? team?.name ?? competitor?.displayName ?? "";

  if (!sourceTeamId || !displayName) {
    return null;
  }

  return {
    abbreviation: team?.abbreviation ?? null,
    display_name: displayName,
    name: team?.name ?? null,
    raw: team ?? {},
    source: SOURCE_NAME,
    source_team_id: sourceTeamId,
    team_key: normalizeKey(displayName),
  };
}

/**
 * Maps one ESPN event into the NFL match source table.
 */
function mapMatch(event, options, round) {
  const competition = event?.competitions?.[0];
  const home = getCompetitor(competition, "home");
  const away = getCompetitor(competition, "away");
  const status = getResultStatus(event);
  const homeScore = toNullableInteger(home?.score);
  const awayScore = toNullableInteger(away?.score);
  const winner = status === "settled" && homeScore !== null && awayScore !== null && homeScore !== awayScore
    ? homeScore > awayScore
      ? home
      : away
    : null;

  return {
    away_score: awayScore,
    away_team_name: away?.team?.displayName ?? away?.displayName ?? null,
    away_team_source_id: away?.team?.id ? String(away.team.id) : null,
    home_score: homeScore,
    home_team_name: home?.team?.displayName ?? home?.displayName ?? null,
    home_team_source_id: home?.team?.id ? String(home.team.id) : null,
    kickoff_at: event?.date ?? competition?.date ?? null,
    match_state: event?.status?.type?.name ?? event?.status?.type?.state ?? null,
    raw: event ?? {},
    result_status: status,
    round_number: toNullableInteger(event?.week?.number) ?? round,
    round_title: event?.week?.text ?? `Week ${round}`,
    season: options.season,
    season_type: options.seasonType,
    source: SOURCE_NAME,
    source_match_id: String(event?.id ?? ""),
    source_url: event?.links?.[0]?.href ?? null,
    venue_city: competition?.venue?.address?.city ?? null,
    venue_name: competition?.venue?.fullName ?? null,
    winner_team_name: winner?.team?.displayName ?? winner?.displayName ?? null,
    winner_team_source_id: winner?.team?.id ? String(winner.team.id) : null,
  };
}

/**
 * Fetches ESPN NFL rows for the selected season/week range.
 */
async function fetchRows(options) {
  const matches = [];
  const teamsBySourceId = new Map();
  const weeks = [];

  for (let round = options.fromRound; round <= options.toRound; round += 1) {
    const payload = await fetchScoreboardWeek(options.season, options.seasonType, round);
    const events = payload.events ?? [];
    const selectedEvents = options.includeFixtures
      ? events
      : events.filter((event) => getResultStatus(event) === "settled");

    weeks.push({
      eventCount: events.length,
      round,
      selectedEvents: selectedEvents.length,
      seasonType: options.seasonType,
    });

    for (const event of selectedEvents) {
      const competition = event?.competitions?.[0];
      const home = getCompetitor(competition, "home");
      const away = getCompetitor(competition, "away");

      for (const team of [mapTeam(home), mapTeam(away)].filter(Boolean)) {
        teamsBySourceId.set(team.source_team_id, team);
      }

      const match = mapMatch(event, options, round);

      if (match.source_match_id && match.home_team_name && match.away_team_name) {
        matches.push(match);
      }
    }
  }

  return {
    matches,
    teams: Array.from(teamsBySourceId.values()),
    weeks,
  };
}

/**
 * Persists ESPN NFL team and match rows.
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
 * Runs the local ESPN NFL result refresh workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const rows = await fetchRows(options);
  const summary = {
    matches: rows.matches.length,
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
