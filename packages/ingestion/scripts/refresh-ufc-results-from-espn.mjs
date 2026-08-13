import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_LOOKBACK_DAYS = 14;
const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
const SOURCE_NAME = "espn_ufc_scoreboard";

/**
 * Parses forward UFC result-refresh options for a completed-event lookback.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    from: null,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    requireSupabase: false,
    to: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--lookback-days=")) {
      options.lookbackDays = Number(arg.slice("--lookback-days=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if ((options.from && !options.to) || (!options.from && options.to)) {
    throw new Error("Pass both --from=YYYY-MM-DD and --to=YYYY-MM-DD, or neither.");
  }

  if (options.from && (!isValidDate(options.from) || !isValidDate(options.to))) {
    throw new Error("Pass --from and --to as YYYY-MM-DD.");
  }

  if (!Number.isInteger(options.lookbackDays) || options.lookbackDays < 1) {
    throw new Error("--lookback-days must be a positive integer.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function getDateWindow(options) {
  if (options.from && options.to) {
    return {
      from: options.from,
      to: options.to,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  return {
    from: addDays(today, -(options.lookbackDays - 1)),
    to: today,
  };
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

function sourceFightKey(date, redFighter, blueFighter) {
  return [
    "ufc",
    date,
    normalizeName(redFighter),
    normalizeName(blueFighter),
  ].join("|");
}

function pairKey(date, leftName, rightName) {
  return [
    date,
    ...[normalizeName(leftName), normalizeName(rightName)].sort(),
  ].join("|");
}

function formatEspnDate(date) {
  return date.replaceAll("-", "");
}

function getAthleteName(competitor) {
  return competitor?.athlete?.displayName
    ?? competitor?.athlete?.fullName
    ?? competitor?.displayName
    ?? null;
}

function getAthleteLink(competitor) {
  return competitor?.athlete?.links?.find((link) =>
    Array.isArray(link.rel) && link.rel.includes("athlete") && link.href)?.href ?? null;
}

function getVenueLocation(venue) {
  if (!venue) {
    return null;
  }

  const address = venue.address ?? {};

  return [
    venue.fullName,
    address.city,
    address.state,
    address.country,
  ].filter(Boolean).join(", ") || null;
}

function getWinnerSide(redCompetitor, blueCompetitor) {
  if (redCompetitor.winner === true && blueCompetitor.winner === false) {
    return "red";
  }

  if (blueCompetitor.winner === true && redCompetitor.winner === false) {
    return "blue";
  }

  return null;
}

function estimateTotalFightTimeSeconds(status) {
  const period = Number(status?.period);
  const clock = Number(status?.clock);

  if (!Number.isFinite(period) || period < 1 || !Number.isFinite(clock)) {
    return null;
  }

  if (clock === 300) {
    return period * 300;
  }

  return ((period - 1) * 300) + Math.max(0, 300 - clock);
}

/**
 * Converts one completed ESPN fight competition into the UFC Historical Data row shape.
 */
function mapCompetitionToFightEntry(event, competition) {
  const competitors = (competition.competitors ?? [])
    .filter((competitor) => competitor?.type === "athlete" || competitor?.athlete)
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));

  if (competitors.length !== 2) {
    return null;
  }

  const [redCompetitor, blueCompetitor] = competitors;
  const redName = getAthleteName(redCompetitor);
  const blueName = getAthleteName(blueCompetitor);

  if (!redName || !blueName) {
    return null;
  }

  const completed = competition.status?.type?.completed === true
    || competition.status?.type?.state === "post";

  if (!completed) {
    return null;
  }

  const eventDate = new Date(competition.date ?? event.date).toISOString().slice(0, 10);
  const winnerSide = getWinnerSide(redCompetitor, blueCompetitor);
  const winnerName = winnerSide === "red"
    ? redName
    : winnerSide === "blue"
      ? blueName
      : null;
  const finishRound = Number(competition.status?.period);
  const totalFightTimeSeconds = estimateTotalFightTimeSeconds(competition.status);

  return {
    blue_fighter_key: normalizeName(blueName),
    blue_fighter_name: blueName,
    blue_fighter_source_id: blueCompetitor.id ? `espn:${blueCompetitor.id}` : null,
    blue_fixed_win_price: null,
    blue_price_american: null,
    event_date: eventDate,
    event_name: event.name ?? event.shortName ?? null,
    favourite_name: null,
    favourite_price: null,
    favourite_side: null,
    favourite_win_return: null,
    favourite_won: null,
    fight_url: getAthleteLink(redCompetitor) ?? getAthleteLink(blueCompetitor),
    finish_details: competition.status?.displayClock
      ? `Round ${competition.status.period ?? "-"} ${competition.status.displayClock}`
      : null,
    finish_round: Number.isFinite(finishRound) ? finishRound : null,
    finish_type: null,
    included_in_insights: false,
    location: getVenueLocation(competition.venue ?? event.competitions?.[0]?.venue),
    match_review_required: false,
    missing_price: true,
    other_fighter_name: null,
    other_fighter_price: null,
    price_bookmaker: null,
    price_difference: null,
    price_match_detail: "Result row imported from ESPN public UFC scoreboard; no source-backed pre-fight prices included.",
    price_match_status: "result_only",
    price_region: null,
    price_sample_at: null,
    price_source: "missing",
    price_source_count: 0,
    raw: {
      espn: {
        competitionId: competition.id ?? null,
        eventId: event.id ?? null,
        eventStatus: event.status?.type ?? null,
        fightStatus: competition.status?.type ?? null,
        source: SOURCE_NAME,
        type: competition.type ?? null,
      },
    },
    red_fighter_key: normalizeName(redName),
    red_fighter_name: redName,
    red_fighter_source_id: redCompetitor.id ? `espn:${redCompetitor.id}` : null,
    red_fixed_win_price: null,
    red_price_american: null,
    result_status: winnerSide ? "settled" : "non_standard",
    source_fight_key: sourceFightKey(eventDate, redName, blueName),
    total_fight_time_seconds: totalFightTimeSeconds,
    winner_name: winnerName,
    winner_side: winnerSide ?? "unknown",
  };
}

/**
 * Fetches one UTC date from the ESPN public UFC scoreboard.
 */
async function fetchEspnScoreboardDate(date) {
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set("dates", formatEspnDate(date));
  url.searchParams.set("limit", "100");

  const response = await fetch(url);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ESPN UFC scoreboard ${date} failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return await response.json();
}

/**
 * Builds completed UFC fight rows from the ESPN scoreboard date range.
 */
async function fetchFightEntries(window) {
  const rows = [];
  const events = [];

  for (let date = window.from; date <= window.to; date = addDays(date, 1)) {
    const payload = await fetchEspnScoreboardDate(date);

    for (const event of payload.events ?? []) {
      const completed = event.status?.type?.completed === true
        || event.status?.type?.state === "post";

      if (!completed) {
        continue;
      }

      const eventRows = (event.competitions ?? [])
        .map((competition) => mapCompetitionToFightEntry(event, competition))
        .filter(Boolean);

      if (eventRows.length) {
        events.push({
          date,
          eventDate: event.date,
          eventId: event.id,
          fightCount: eventRows.length,
          name: event.name,
        });
        rows.push(...eventRows);
      }
    }
  }

  return {
    events,
    rows: dedupeFightRows(rows),
  };
}

function dedupeFightRows(rows) {
  const byPair = new Map();

  for (const row of rows) {
    byPair.set(pairKey(row.event_date, row.red_fighter_name, row.blue_fighter_name), row);
  }

  return Array.from(byPair.values()).sort((left, right) =>
    `${left.event_date}:${left.source_fight_key}`.localeCompare(`${right.event_date}:${right.source_fight_key}`));
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/**
 * Minimal Supabase REST client for service-role UFC result upserts.
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

  await supabase.upsert("ufc_fight_entries", rows, "source_fight_key");

  return {
    ok: true,
    skipped: false,
    ufcFightEntries: rows.length,
  };
}

function summarize(rows, events, window) {
  return {
    dateRange: window,
    events,
    resultOnlyRows: rows.filter((row) => row.price_match_status === "result_only").length,
    settledRows: rows.filter((row) => row.result_status === "settled").length,
    ufcFightEntries: rows.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const window = getDateWindow(options);
  const { events, rows } = await fetchFightEntries(window);
  const summary = summarize(rows, events, window);

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
