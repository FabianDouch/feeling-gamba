import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const MATCH_WINDOW_HOURS = 4;
const PAGE_SIZE = 1000;

const LEAGUES = {
  bundesliga: {
    competitionId: 1,
    label: "Bundesliga",
    openFootballCode: "de.1",
    source: "openfootball",
    tablePrefix: "bundesliga",
    timeZoneOffset: "+02:00",
  },
  ligue1: {
    competitionId: 1,
    label: "Ligue 1",
    openFootballCode: "fr.1",
    source: "openfootball",
    tablePrefix: "ligue1",
    timeZoneOffset: "+02:00",
  },
  mls: {
    competitionId: 1,
    fixtureDownloadSlug: "mls",
    label: "MLS",
    source: "fixture_download",
    tablePrefix: "mls",
  },
  seriea: {
    competitionId: 1,
    label: "Serie A",
    openFootballCode: "it.1",
    source: "openfootball",
    tablePrefix: "seriea",
    timeZoneOffset: "+02:00",
  },
};

/**
 * Maps a calendar date to the European football season start year.
 */
function getDefaultSeasonYear(date, league) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (league === "mls") {
    return year;
  }

  return month >= 6 ? year : year - 1;
}

/**
 * Parses shared football fixture/result refresh options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    includeFixtures: false,
    league: null,
    maxMatches: null,
    pricedOnly: true,
    requireSupabase: false,
    season: null,
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
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--league=")) {
      options.league = arg.slice("--league=".length);
    } else if (arg.startsWith("--max-matches=")) {
      options.maxMatches = Number(arg.slice("--max-matches=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    }
  }

  if (!options.league || !LEAGUES[options.league]) {
    throw new Error(`--league must be one of: ${Object.keys(LEAGUES).join(", ")}.`);
  }

  if (options.season === null) {
    options.season = getDefaultSeasonYear(new Date(), options.league);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
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
 * Minimal Supabase REST client for shared football result ingestion.
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

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceTeamId(name) {
  return normalizeName(name).replace(/\s+/g, "-");
}

function getSeasonSlug(season) {
  return `${season}-${String((season + 1) % 100).padStart(2, "0")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 (compatible; FeelingGambaBot/1.0)",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Football result source failed with HTTP ${response.status}: ${message.slice(0, 500)}`);
  }

  return await response.json();
}

async function fetchMatches(config, options) {
  if (config.source === "fixture_download") {
    const url = `https://fixturedownload.com/feed/json/${config.fixtureDownloadSlug}-${options.season}`;
    const rows = await fetchJson(url);
    return Array.isArray(rows) ? rows.map((row) => mapFixtureDownloadRow(row, config, options, url)) : [];
  }

  const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${getSeasonSlug(options.season)}/${config.openFootballCode}.json`;
  const payload = await fetchJson(url);
  return (payload.matches ?? []).map((row, index) => mapOpenFootballRow(row, index, config, options, url));
}

function parseOpenFootballScore(score) {
  const fullTime = Array.isArray(score)
    ? score
    : Array.isArray(score?.ft)
      ? score.ft
      : null;

  if (!fullTime || fullTime.length < 2) {
    return {
      awayScore: null,
      homeScore: null,
    };
  }

  const homeScore = Number(fullTime[0]);
  const awayScore = Number(fullTime[1]);

  return {
    awayScore: Number.isFinite(awayScore) ? awayScore : null,
    homeScore: Number.isFinite(homeScore) ? homeScore : null,
  };
}

/**
 * Avoids settling future openfootball fixtures that are published with placeholder array scores.
 */
function hasPassedResultBuffer(kickoffAt, now = new Date()) {
  const kickoff = new Date(kickoffAt);

  if (Number.isNaN(kickoff.valueOf())) {
    return false;
  }

  return now.valueOf() - kickoff.valueOf() >= 6 * 60 * 60 * 1000;
}

function parseRoundNumber(value) {
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function withOffset(date, time, offset) {
  return `${date}T${time ?? "12:00"}:00${offset}`;
}

function mapOpenFootballRow(row, index, config, options, url) {
  const homeTeam = row.team1;
  const awayTeam = row.team2;
  const { awayScore, homeScore } = parseOpenFootballScore(row.score);
  const kickoffAt = withOffset(row.date, row.time, config.timeZoneOffset ?? "+00:00");
  const settled = homeScore !== null
    && awayScore !== null
    && Boolean(row.score?.ft || (Array.isArray(row.score) && hasPassedResultBuffer(kickoffAt)));
  const sourceMatchId = `${options.season}:${config.openFootballCode}:${index + 1}:${normalizeName(homeTeam)}:${normalizeName(awayTeam)}`;

  return {
    awayScore,
    awayTeam,
    homeScore,
    homeTeam,
    kickoffAt,
    raw: row,
    resultStatus: settled ? "settled" : "pending",
    roundNumber: parseRoundNumber(row.round),
    roundTitle: row.round ?? null,
    sourceMatchId,
    sourceUrl: url,
    venueName: row.stadium ?? row.ground ?? null,
  };
}

function mapFixtureDownloadRow(row, config, options, url) {
  const homeScore = Number(row.HomeTeamScore);
  const awayScore = Number(row.AwayTeamScore);
  const settled = Number.isFinite(homeScore) && Number.isFinite(awayScore);

  return {
    awayScore: settled ? awayScore : null,
    awayTeam: row.AwayTeam,
    homeScore: settled ? homeScore : null,
    homeTeam: row.HomeTeam,
    kickoffAt: String(row.DateUtc ?? "").replace(" ", "T").replace(/Z?$/, "Z"),
    raw: row,
    resultStatus: settled ? "settled" : "pending",
    roundNumber: Number.isFinite(Number(row.RoundNumber)) ? Number(row.RoundNumber) : null,
    roundTitle: row.RoundNumber ? `Round ${row.RoundNumber}` : null,
    sourceMatchId: `${options.season}:${config.fixtureDownloadSlug}:${row.MatchNumber ?? `${normalizeName(row.HomeTeam)}:${normalizeName(row.AwayTeam)}`}`,
    sourceUrl: url,
    venueName: row.Location ?? null,
  };
}

function isWritableMatch(match, includeFixtures) {
  return includeFixtures || match.resultStatus === "settled";
}

function isWithinMatchWindow(snapshotStart, matchKickoff) {
  const snapshotDate = new Date(snapshotStart);
  const matchDate = new Date(matchKickoff);

  if (Number.isNaN(snapshotDate.valueOf()) || Number.isNaN(matchDate.valueOf())) {
    return false;
  }

  return Math.abs(snapshotDate.valueOf() - matchDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

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

/**
 * Reads fixed-win snapshots used as the price-backed boundary for football writes.
 */
async function readPricedSnapshots(supabase, config) {
  try {
    return await supabase.selectAll(`${config.tablePrefix}_market_snapshots`, {
      order: "advertised_start_at.asc",
      select: "source_event_id,advertised_start_at,home_team_name,away_team_name,home_fixed_win_price,away_fixed_win_price",
      source: "eq.tab",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("PGRST205")) {
      return [];
    }

    throw error;
  }
}

function filterToPricedMatches(matches, snapshots) {
  if (!snapshots.length) {
    return [];
  }

  return matches.filter((match) =>
    snapshots.some((snapshot) =>
      snapshot.home_fixed_win_price !== null
      && snapshot.away_fixed_win_price !== null
      && namesMatch(snapshot.home_team_name, match.homeTeam)
      && namesMatch(snapshot.away_team_name, match.awayTeam)
      && isWithinMatchWindow(snapshot.advertised_start_at, match.kickoffAt)));
}

function mapTeam(name, source) {
  return {
    abbreviation: null,
    display_name: name,
    name,
    nick_name: null,
    raw: {
      name,
    },
    source,
    source_team_id: sourceTeamId(name),
    team_key: normalizeName(name),
  };
}

function mapMatch(match, config, options) {
  const winnerTeam = match.homeScore === null || match.awayScore === null || match.homeScore === match.awayScore
    ? null
    : match.homeScore > match.awayScore ? match.homeTeam : match.awayTeam;

  return {
    away_score: match.awayScore,
    away_team_name: match.awayTeam,
    away_team_source_id: sourceTeamId(match.awayTeam),
    competition_id: config.competitionId,
    home_score: match.homeScore,
    home_team_name: match.homeTeam,
    home_team_source_id: sourceTeamId(match.homeTeam),
    kickoff_at: match.kickoffAt,
    match_mode: null,
    match_state: match.resultStatus,
    raw: match.raw,
    result_status: match.resultStatus,
    round_number: match.roundNumber,
    round_title: match.roundTitle,
    season: options.season,
    source: config.source,
    source_match_id: match.sourceMatchId,
    source_url: match.sourceUrl,
    venue_city: null,
    venue_name: match.venueName,
    winner_team_name: winnerTeam,
    winner_team_source_id: winnerTeam ? sourceTeamId(winnerTeam) : null,
  };
}

/**
 * Converts retained fixture rows into normalized write sets.
 */
function buildWriteSets(matches, config, options) {
  const teams = new Map();
  const matchRows = [];

  for (const match of matches) {
    if (!match.sourceMatchId || !match.homeTeam || !match.awayTeam) {
      continue;
    }

    teams.set(sourceTeamId(match.homeTeam), mapTeam(match.homeTeam, config.source));
    teams.set(sourceTeamId(match.awayTeam), mapTeam(match.awayTeam, config.source));
    matchRows.push(mapMatch(match, config, options));
  }

  return {
    appearances: [],
    goalScorers: [],
    matches: matchRows,
    players: [],
    teams: Array.from(teams.values()),
  };
}

/**
 * Writes football fixture/result rows in dependency order.
 */
async function writeRows(supabase, config, rows) {
  await supabase.upsert(`${config.tablePrefix}_teams`, rows.teams, "source,source_team_id");
  await supabase.upsert(`${config.tablePrefix}_players`, rows.players, "source,source_player_id");
  await supabase.upsert(`${config.tablePrefix}_matches`, rows.matches, "source,source_match_id");
  await supabase.upsert(`${config.tablePrefix}_player_match_appearances`, rows.appearances, "source_appearance_key");
  await supabase.upsert(`${config.tablePrefix}_goal_scorers`, rows.goalScorers, "source_goal_key");

  return {
    [`${config.tablePrefix}Appearances`]: rows.appearances.length,
    [`${config.tablePrefix}GoalScorers`]: rows.goalScorers.length,
    [`${config.tablePrefix}Matches`]: rows.matches.length,
    [`${config.tablePrefix}Players`]: rows.players.length,
    [`${config.tablePrefix}Teams`]: rows.teams.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Runs the shared football fixture/result refresh.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const config = LEAGUES[options.league];
  const supabaseConfig = getSupabaseWriteConfig();

  if (!supabaseConfig) {
    if (options.requireSupabase) {
      throw new Error("Supabase URL or service-role key is not configured.");
    }
  }

  const supabase = supabaseConfig ? createSupabaseRestClient(supabaseConfig, options.batchSize) : null;
  const [allMatches, pricedSnapshots] = await Promise.all([
    fetchMatches(config, options),
    supabase ? readPricedSnapshots(supabase, config) : Promise.resolve([]),
  ]);
  const writableMatches = allMatches.filter((match) => isWritableMatch(match, options.includeFixtures));
  const retainedMatches = options.pricedOnly
    ? filterToPricedMatches(writableMatches, pricedSnapshots)
    : writableMatches;
  const limitedMatches = options.maxMatches === null
    ? retainedMatches
    : retainedMatches.slice(0, options.maxMatches);
  const rows = buildWriteSets(limitedMatches, config, options);
  const summary = {
    allMatches: allMatches.length,
    includeFixtures: options.includeFixtures,
    label: config.label,
    league: options.league,
    pricedOnly: options.pricedOnly,
    pricedSnapshots: pricedSnapshots.length,
    retainedMatches: retainedMatches.length,
    retainedMatchesAfterLimit: limitedMatches.length,
    season: options.season,
    skippedUnpricedMatches: writableMatches.length - retainedMatches.length,
    source: config.source,
    writableMatches: writableMatches.length,
    writeRows: {
      appearances: rows.appearances.length,
      goalScorers: rows.goalScorers.length,
      matches: rows.matches.length,
      players: rows.players.length,
      teams: rows.teams.length,
    },
  };

  if (options.dryRun || !supabase) {
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      sample: rows.matches.slice(0, 5).map((row) => ({
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

  const supabaseWrite = await writeRows(supabase, config, rows);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
