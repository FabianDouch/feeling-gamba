import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_LIMIT = 1000;
const MATCH_WINDOW_HOURS = 6;

/**
 * Parses Tennis fixed-win snapshot reconciliation options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    limit: DEFAULT_LIMIT,
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
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
 * Minimal Supabase REST client for Tennis fixed-win reconciliation.
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
    request,
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

function playersMatch(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function isWithinMatchWindow(left, right) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  if (Number.isNaN(leftDate.valueOf()) || Number.isNaN(rightDate.valueOf())) {
    return false;
  }

  return Math.abs(leftDate.valueOf() - rightDate.valueOf()) <= MATCH_WINDOW_HOURS * 60 * 60 * 1000;
}

function calculateReturn(won, price) {
  if (won === null || won === undefined) {
    return null;
  }

  if (won !== true || !Number.isFinite(Number(price))) {
    return 0;
  }

  return Number(Number(price).toFixed(3));
}

/**
 * Reads candidate TAB Tennis fixed-win snapshots for reconciliation.
 */
async function readSnapshots(supabase, options) {
  const rows = await supabase.request("tennis_market_snapshots", {
    search: {
      limit: String(options.limit),
      order: "snapshot_at.asc",
      select: [
        "id",
        "source",
        "source_snapshot_key",
        "source_event_id",
        "source_event_url",
        "source_market_id",
        "matched_tennis_match_id",
        "snapshot_at",
        "advertised_start_at",
        "competition_name",
        "competition_slug",
        "odds_api_sport_key",
        "tour",
        "player_1_name",
        "player_1_fixed_win_price",
        "player_2_name",
        "player_2_fixed_win_price",
        "favourite_player_name",
        "favourite_fixed_win_price",
        "other_player_name",
        "other_player_fixed_win_price",
      ].join(","),
      source: "eq.tab",
    },
  });

  return selectCanonicalSnapshots(rows);
}

/**
 * Keeps one fixed-win market snapshot per source event/market for settlement.
 */
function selectCanonicalSnapshots(snapshots) {
  const latestByMarket = new Map();

  for (const snapshot of snapshots) {
    const key = [
      snapshot.source,
      snapshot.source_event_id,
    ].join(":");
    const existing = latestByMarket.get(key);

    if (!existing || String(snapshot.snapshot_at ?? "") > String(existing.snapshot_at ?? "")) {
      latestByMarket.set(key, snapshot);
    }
  }

  return Array.from(latestByMarket.values())
    .sort((left, right) => String(left.snapshot_at ?? "").localeCompare(String(right.snapshot_at ?? "")));
}

function addHours(isoString, hours) {
  const date = new Date(isoString);

  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

/**
 * Loads Odds API tennis matches in the selected snapshot kickoff window.
 */
async function readMatches(supabase, snapshots) {
  const starts = snapshots
    .map((snapshot) => snapshot.advertised_start_at)
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

  return await supabase.request("tennis_matches", {
    search: {
      and: `(commence_time.gte.${from},commence_time.lte.${to})`,
      order: "commence_time.asc",
      select: [
        "id",
        "source",
        "source_match_id",
        "source_sport_key",
        "competition_key",
        "competition_name",
        "tour",
        "commence_time",
        "result_status",
        "player_1_name",
        "player_1_sets",
        "player_2_name",
        "player_2_sets",
        "winner_player_name",
      ].join(","),
      source: "eq.odds_api",
    },
  });
}

function sameMatch(snapshot, match) {
  return snapshot.odds_api_sport_key === match.source_sport_key
    && playersMatch(snapshot.player_1_name, match.player_1_name)
    && playersMatch(snapshot.player_2_name, match.player_2_name)
    && isWithinMatchWindow(snapshot.advertised_start_at, match.commence_time);
}

function matchExistingTennisMatch(snapshot, matches) {
  const candidates = matches.filter((match) => sameMatch(snapshot, match));

  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Backfills match links for previously captured snapshots after result rows arrive.
 */
function resolveSnapshotMatches(snapshots, matches) {
  const matchesById = new Map(matches.map((row) => [row.id, row]));
  const updates = [];
  const resolved = [];

  for (const snapshot of snapshots) {
    if (snapshot.matched_tennis_match_id && matchesById.has(snapshot.matched_tennis_match_id)) {
      resolved.push(snapshot);
      continue;
    }

    const match = matchExistingTennisMatch(snapshot, matches);

    if (!match) {
      resolved.push({
        ...snapshot,
        matched_tennis_match_id: null,
      });
      continue;
    }

    updates.push({
      id: snapshot.id,
      matched_tennis_match_id: match.id,
    });
    resolved.push({
      ...snapshot,
      matched_tennis_match_id: match.id,
    });
  }

  return {
    resolved,
    updates,
  };
}

/**
 * Classifies one snapshot against its matched Odds API tennis result state.
 */
function mapOutcome(snapshot, match) {
  if (!snapshot.matched_tennis_match_id) {
    return buildResultRow(snapshot, null, null, null, "unmatched");
  }

  if (!match) {
    return buildResultRow(snapshot, null, null, null, "missing_result");
  }

  if (match.result_status !== "settled" || !match.winner_player_name) {
    return buildResultRow(snapshot, match, null, null, "pending");
  }

  const favouriteWon = playersMatch(snapshot.favourite_player_name, match.winner_player_name);

  return buildResultRow(snapshot, match, match.winner_player_name, favouriteWon, "settled");
}

/**
 * Builds the persisted audit/result row for one Tennis fixed-win snapshot.
 */
function buildResultRow(snapshot, match, winner, favouriteWon, outcomeStatus) {
  return {
    advertised_start_at: snapshot.advertised_start_at,
    competition_name: snapshot.competition_name,
    competition_slug: snapshot.competition_slug,
    favourite_fixed_win_price: snapshot.favourite_fixed_win_price,
    favourite_player_name: snapshot.favourite_player_name,
    favourite_win_return: calculateReturn(favouriteWon, snapshot.favourite_fixed_win_price),
    favourite_won: favouriteWon,
    market_snapshot_id: snapshot.id,
    matched_tennis_match_id: snapshot.matched_tennis_match_id,
    odds_api_sport_key: snapshot.odds_api_sport_key,
    other_player_fixed_win_price: snapshot.other_player_fixed_win_price,
    other_player_name: snapshot.other_player_name,
    outcome_status: outcomeStatus,
    player_1_fixed_win_price: snapshot.player_1_fixed_win_price,
    player_1_name: snapshot.player_1_name,
    player_2_fixed_win_price: snapshot.player_2_fixed_win_price,
    player_2_name: snapshot.player_2_name,
    raw: {
      match: {
        player1Sets: match?.player_1_sets ?? null,
        player2Sets: match?.player_2_sets ?? null,
        sourceMatchId: match?.source_match_id ?? null,
      },
      snapshot: {
        sourceEventUrl: snapshot.source_event_url ?? null,
      },
    },
    snapshot_at: snapshot.snapshot_at,
    source: snapshot.source,
    source_event_id: snapshot.source_event_id,
    source_market_id: snapshot.source_market_id,
    source_snapshot_key: snapshot.source_snapshot_key,
    tour: snapshot.tour,
    winner_player_name: winner,
  };
}

/**
 * Builds Tennis fixed-win outcome rows from source snapshots and Odds API results.
 */
function buildRows(snapshots, matches) {
  const matchesById = new Map(matches.map((row) => [row.id, row]));
  const statuses = {
    missing_result: 0,
    non_standard: 0,
    pending: 0,
    settled: 0,
    unmatched: 0,
  };
  const rows = snapshots.map((snapshot) => {
    const match = snapshot.matched_tennis_match_id
      ? matchesById.get(snapshot.matched_tennis_match_id)
      : null;
    const row = mapOutcome(snapshot, match);
    statuses[row.outcome_status] = (statuses[row.outcome_status] ?? 0) + 1;
    return row;
  });

  return {
    rows,
    statuses,
  };
}

/**
 * Persists match-link updates on source snapshots.
 */
async function persistSnapshotMatchUpdates(supabase, updates) {
  for (const update of updates) {
    await supabase.request("tennis_market_snapshots", {
      body: {
        matched_tennis_match_id: update.matched_tennis_match_id,
      },
      expectJson: false,
      method: "PATCH",
      prefer: "return=minimal",
      search: {
        id: `eq.${update.id}`,
      },
    });
  }
}

/**
 * Runs the local Tennis fixed-win reconciliation workflow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();
  const supabaseConfig = getSupabaseWriteConfig();

  if (options.requireSupabase && !supabaseConfig) {
    throw new Error("Supabase write config missing. Set SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL and FEELING_GAMBA_SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!supabaseConfig) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: "Supabase write config missing.",
    }, null, 2));
    return;
  }

  const supabase = createSupabaseRestClient(supabaseConfig, options.batchSize);
  const snapshots = await readSnapshots(supabase, options);
  const matches = await readMatches(supabase, snapshots);
  const { resolved, updates } = resolveSnapshotMatches(snapshots, matches);
  const result = buildRows(resolved, matches);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: result.rows.slice(0, 12).map((row) => ({
        favourite: row.favourite_player_name,
        match: `${row.player_1_name} vs ${row.player_2_name}`,
        outcomeStatus: row.outcome_status,
        start: row.advertised_start_at,
        winner: row.winner_player_name,
      })),
      summary: {
        matchedSnapshots: resolved.filter((snapshot) => snapshot.matched_tennis_match_id).length,
        officialMatchesChecked: matches.length,
        outcomeRows: result.rows.length,
        snapshotMatchUpdates: updates.length,
        snapshotsChecked: snapshots.length,
        statuses: result.statuses,
      },
    }, null, 2));
    return;
  }

  await persistSnapshotMatchUpdates(supabase, updates);
  await supabase.upsert("tennis_fixed_win_snapshot_results", result.rows, "source_snapshot_key");

  console.log(JSON.stringify({
    summary: {
      matchedSnapshots: resolved.filter((snapshot) => snapshot.matched_tennis_match_id).length,
      officialMatchesChecked: matches.length,
      outcomeRows: result.rows.length,
      snapshotMatchUpdates: updates.length,
      snapshotsChecked: snapshots.length,
      statuses: result.statuses,
    },
    supabaseWrite: {
      ok: true,
      skipped: false,
      tennisFixedWinSnapshotResults: result.rows.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
