import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
const PAGE_SIZE = 1000;
const SOURCE_NAME = "odds_api";

/**
 * Parses the Tennis result refresh options for The Odds API.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    daysFrom: 3,
    dryRun: false,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--days-from=")) {
      options.daysFrom = Number(arg.slice("--days-from=".length));
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (!Number.isInteger(options.daysFrom) || options.daysFrom < 1 || options.daysFrom > 7) {
    throw new Error("--days-from must be an integer from 1 to 7.");
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

function getOddsApiKey() {
  return process.env.ODDS_API_KEY ?? null;
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
 * Minimal Supabase REST client for Tennis result writes.
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
 * Reads tournament keys from captured TAB Tennis snapshots.
 */
async function readSnapshotSportKeys(supabase) {
  if (!supabase) {
    return [];
  }

  try {
    const rows = await supabase.selectAll("tennis_market_snapshots", {
      order: "odds_api_sport_key.asc",
      select: "odds_api_sport_key",
      source: "eq.tab",
    });

    return Array.from(new Set(rows.map((row) => row.odds_api_sport_key).filter(Boolean))).sort();
  } catch (error) {
    if (error instanceof Error && error.message.includes("tennis_market_snapshots")) {
      return [];
    }

    throw error;
  }
}

/**
 * Fetches one authenticated Odds API payload using query-parameter auth.
 */
async function fetchOddsApi(pathname, apiKey, params = {}) {
  const url = new URL(`${ODDS_API_BASE_URL}${pathname}`);
  url.searchParams.set("apiKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Odds API ${pathname} failed with HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  return payload;
}

/**
 * Finds active ATP/WTA tennis sport keys for source validation and first-run capture.
 */
async function fetchActiveTennisSportKeys(apiKey) {
  const rows = await fetchOddsApi("/sports/", apiKey, {
    all: "true",
  });

  return rows
    .filter((row) => row.group === "Tennis" && row.active === true && /^tennis_(atp|wta)_/.test(row.key))
    .map((row) => row.key)
    .sort();
}

function getTourFromSportKey(sportKey) {
  if (String(sportKey).startsWith("tennis_atp_")) {
    return "atp";
  }

  if (String(sportKey).startsWith("tennis_wta_")) {
    return "wta";
  }

  return null;
}

function getCompetitionName(row, sportKey) {
  return row.sport_title ?? sportKey.replace(/^tennis_/, "").replace(/_/g, " ").toUpperCase();
}

function getSetScore(scores, playerName) {
  const score = scores?.find((entry) => namesMatch(entry.name, playerName))?.score;
  const parsed = Number(score);

  return Number.isFinite(parsed) ? parsed : null;
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

function namesMatch(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function determineWinner(row) {
  if (row.completed !== true) {
    return null;
  }

  const player1Sets = getSetScore(row.scores, row.home_team);
  const player2Sets = getSetScore(row.scores, row.away_team);

  if (player1Sets === null || player2Sets === null || player1Sets === player2Sets) {
    return null;
  }

  return player1Sets > player2Sets ? row.home_team : row.away_team;
}

/**
 * Maps Odds API event/score rows to Tennis match rows.
 */
function mapMatch(row, sportKey) {
  const tour = getTourFromSportKey(sportKey);
  const player1Sets = getSetScore(row.scores, row.home_team);
  const player2Sets = getSetScore(row.scores, row.away_team);
  const winner = determineWinner(row);
  const resultStatus = row.completed === true
    ? winner ? "settled" : "unknown"
    : "pending";

  return {
    commence_time: row.commence_time ?? null,
    competition_key: sportKey,
    competition_name: getCompetitionName(row, sportKey),
    player_1_name: row.home_team ?? null,
    player_1_sets: player1Sets,
    player_2_name: row.away_team ?? null,
    player_2_sets: player2Sets,
    raw: row,
    result_status: resultStatus,
    source: SOURCE_NAME,
    source_match_id: row.id,
    source_sport_key: sportKey,
    tour,
    winner_player_name: winner,
  };
}

/**
 * Fetches current and recently completed Tennis matches for one Odds API tournament key.
 */
async function fetchSportMatches(apiKey, sportKey, options) {
  const [eventsResult, scoresResult] = await Promise.allSettled([
    fetchOddsApi(`/sports/${sportKey}/events`, apiKey),
    fetchOddsApi(`/sports/${sportKey}/scores`, apiKey, {
      daysFrom: options.daysFrom,
    }),
  ]);
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const scores = scoresResult.status === "fulfilled" ? scoresResult.value : [];
  const byId = new Map();

  for (const row of events) {
    byId.set(row.id, row);
  }

  for (const row of scores) {
    byId.set(row.id, {
      ...byId.get(row.id),
      ...row,
    });
  }

  return Array.from(byId.values())
    .filter((row) => row.id && row.home_team && row.away_team)
    .map((row) => mapMatch(row, sportKey));
}

/**
 * Runs the Tennis result refresh workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const apiKey = getOddsApiKey();
  const supabaseConfig = getSupabaseWriteConfig();
  const supabase = supabaseConfig
    ? createSupabaseRestClient(supabaseConfig, options.batchSize)
    : null;

  if (!apiKey) {
    throw new Error("ODDS_API_KEY is required for Tennis result refresh.");
  }

  if (options.requireSupabase && !supabase) {
    throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const activeKeys = await fetchActiveTennisSportKeys(apiKey);
  const snapshotKeys = await readSnapshotSportKeys(supabase);
  const sportKeys = Array.from(new Set([...activeKeys, ...snapshotKeys])).sort();
  const rows = [];

  for (const sportKey of sportKeys) {
    rows.push(...await fetchSportMatches(apiKey, sportKey, options));
  }

  if (options.dryRun || !supabase) {
    console.log(JSON.stringify({
      dryRun: options.dryRun,
      sample: rows.slice(0, 12).map((row) => ({
        competition: row.competition_name,
        match: `${row.player_1_name} vs ${row.player_2_name}`,
        resultStatus: row.result_status,
        score: row.player_1_sets === null || row.player_2_sets === null ? null : `${row.player_1_sets}-${row.player_2_sets}`,
        sportKey: row.source_sport_key,
        start: row.commence_time,
        winner: row.winner_player_name,
      })),
      summary: {
        activeKeys,
        snapshotKeys,
        tennisMatches: rows.length,
      },
    }, null, 2));
    return;
  }

  await supabase.upsert("tennis_matches", rows, "source,source_match_id");
  console.log(JSON.stringify({
    summary: {
      activeKeys,
      snapshotKeys,
      tennisMatches: rows.length,
    },
    supabaseWrite: {
      ok: true,
      skipped: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
