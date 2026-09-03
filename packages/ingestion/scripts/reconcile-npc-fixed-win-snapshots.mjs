import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_LIMIT = 1000;

/**
 * Parses NPC fixed-win snapshot reconciliation options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    limit: DEFAULT_LIMIT,
    requireSupabase: false,
    source: "all",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!["all", "tab"].includes(options.source)) {
    throw new Error("--source must be all or tab.");
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
 * Minimal Supabase REST client for NPC fixed-win reconciliation.
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
 * Reduces bookmaker and official team names to a comparable form.
 */
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
 * Matches full team names against sponsor-free or suffix/prefix variants.
 */
function namesMatch(left, right) {
  const leftName = normalizeName(left);
  const rightName = normalizeName(right);

  if (!leftName || !rightName) {
    return false;
  }

  if (leftName === rightName) {
    return true;
  }

  return leftName.endsWith(` ${rightName}`) || rightName.endsWith(` ${leftName}`);
}

/**
 * Confirms an official NPC match has final scores usable for settlement.
 */
function isSettledMatch(match) {
  return match?.result_status === "settled"
    && Number.isFinite(Number(match.home_score))
    && Number.isFinite(Number(match.away_score));
}

/**
 * Derives the winning side from official final scores.
 */
function determineWinner(match) {
  const homeScore = Number(match.home_score);
  const awayScore = Number(match.away_score);

  if (homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore
    ? {
        name: match.home_team_name,
        sourceTeamId: match.home_team_source_id,
      }
    : {
        name: match.away_team_name,
        sourceTeamId: match.away_team_source_id,
      };
}

/**
 * Calculates a flat $1 fixed-win return while preserving unknown outcomes.
 */
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
 * Classifies one snapshot against its matched official NPC result state.
 */
function mapOutcome(snapshot, match) {
  if (!snapshot.matched_npc_match_id) {
    return {
      outcomeStatus: "unmatched",
      row: buildResultRow(snapshot, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "unmatched",
      }),
    };
  }

  if (!match) {
    return {
      outcomeStatus: "missing_result",
      row: buildResultRow(snapshot, null, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "missing_result",
      }),
    };
  }

  if (!isSettledMatch(match)) {
    return {
      outcomeStatus: "pending",
      row: buildResultRow(snapshot, match, null, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "pending",
      }),
    };
  }

  const winner = determineWinner(match);

  if (!winner) {
    return {
      outcomeStatus: "settled",
      row: buildResultRow(snapshot, match, null, {
        awayTeamWon: false,
        favouriteWon: false,
        homeTeamWon: false,
        outcomeStatus: "settled",
      }),
    };
  }

  const homeTeamWon = namesMatch(snapshot.home_team_name, winner.name);
  const awayTeamWon = namesMatch(snapshot.away_team_name, winner.name);
  const favouriteWon = snapshot.favourite_team_name
    ? namesMatch(snapshot.favourite_team_name, winner.name)
    : null;

  if (!homeTeamWon && !awayTeamWon) {
    return {
      outcomeStatus: "non_standard",
      row: buildResultRow(snapshot, match, winner, {
        awayTeamWon: null,
        favouriteWon: null,
        homeTeamWon: null,
        outcomeStatus: "non_standard",
      }),
    };
  }

  return {
    outcomeStatus: "settled",
    row: buildResultRow(snapshot, match, winner, {
      awayTeamWon,
      favouriteWon,
      homeTeamWon,
      outcomeStatus: "settled",
    }),
  };
}

/**
 * Builds the persisted audit/result row for one fixed-win snapshot.
 */
function buildResultRow(snapshot, match, winner, outcome) {
  return {
    advertised_start_at: snapshot.advertised_start_at,
    away_fixed_win_price: snapshot.away_fixed_win_price,
    away_team_name: snapshot.away_team_name,
    away_team_won: outcome.awayTeamWon,
    away_win_return: calculateReturn(outcome.awayTeamWon, snapshot.away_fixed_win_price),
    favourite_fixed_win_price: snapshot.favourite_fixed_win_price,
    favourite_team_name: snapshot.favourite_team_name,
    favourite_win_return: calculateReturn(outcome.favouriteWon, snapshot.favourite_fixed_win_price),
    favourite_won: outcome.favouriteWon,
    home_fixed_win_price: snapshot.home_fixed_win_price,
    home_team_name: snapshot.home_team_name,
    home_team_won: outcome.homeTeamWon,
    home_win_return: calculateReturn(outcome.homeTeamWon, snapshot.home_fixed_win_price),
    market_snapshot_id: snapshot.id,
    matched_npc_match_id: snapshot.matched_npc_match_id,
    outcome_status: outcome.outcomeStatus,
    raw: {
      match: {
        awayScore: match?.away_score ?? null,
        awayTeamName: match?.away_team_name ?? null,
        homeScore: match?.home_score ?? null,
        homeTeamName: match?.home_team_name ?? null,
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
    winner_team_name: winner?.name ?? null,
    winner_team_source_id: winner?.sourceTeamId ?? null,
  };
}

/**
 * Reads candidate TAB/Betcha fixed-win snapshots for reconciliation.
 */
async function readSnapshots(supabase, options) {
  const search = {
    limit: String(options.limit),
    order: "snapshot_at.asc",
    select: [
      "id",
      "source",
      "source_snapshot_key",
      "source_event_id",
      "source_event_url",
      "source_market_id",
      "matched_npc_match_id",
      "snapshot_at",
      "advertised_start_at",
      "home_team_name",
      "away_team_name",
      "home_fixed_win_price",
      "away_fixed_win_price",
      "favourite_team_name",
      "favourite_fixed_win_price",
    ].join(","),
  };

  if (options.source !== "all") {
    search.source = `eq.${options.source}`;
  }

  const rows = await supabase.request("npc_market_snapshots", {
    search,
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

/**
 * Loads official NPC matches referenced by the selected snapshots.
 */
async function readMatches(supabase, snapshots) {
  const matchIds = Array.from(new Set(
    snapshots
      .map((snapshot) => snapshot.matched_npc_match_id)
      .filter(Boolean),
  ));

  if (!matchIds.length) {
    return new Map();
  }

  const rows = await supabase.request("npc_matches", {
    search: {
      id: `in.(${matchIds.join(",")})`,
      select: [
        "id",
        "source",
        "source_match_id",
        "result_status",
        "home_team_name",
        "away_team_name",
        "home_team_source_id",
        "away_team_source_id",
        "home_score",
        "away_score",
        "winner_team_name",
        "winner_team_source_id",
      ].join(","),
    },
  });

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Builds fixed-win outcome rows from source snapshots and official NPC results.
 */
function reconcileSnapshots(snapshots, matchesById) {
  const statuses = {
    missing_result: 0,
    non_standard: 0,
    pending: 0,
    settled: 0,
    unmatched: 0,
  };
  const rows = [];

  for (const snapshot of snapshots) {
    const match = snapshot.matched_npc_match_id
      ? matchesById.get(snapshot.matched_npc_match_id)
      : null;
    const outcome = mapOutcome(snapshot, match);

    statuses[outcome.outcomeStatus] += 1;

    if (outcome.row) {
      rows.push(outcome.row);
    }
  }

  return {
    rows,
    statuses,
  };
}

/**
 * Persists fixed-win snapshot outcome/status rows.
 */
async function writeRows(supabase, rows) {
  await supabase.upsert(
    "npc_fixed_win_snapshot_results",
    rows,
    "source_snapshot_key",
  );

  return {
    npcFixedWinSnapshotResults: rows.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Produces a compact reconciliation report for dry runs and writes.
 */
function summarize(snapshots, matchesById, reconciliation) {
  return {
    matchedSnapshots: snapshots.filter((snapshot) => snapshot.matched_npc_match_id).length,
    officialMatchesChecked: matchesById.size,
    outcomeRows: reconciliation.rows.length,
    snapshotsChecked: snapshots.length,
    statuses: reconciliation.statuses,
  };
}

/**
 * Runs the local fixed-win reconciliation workflow.
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
  const snapshots = await readSnapshots(supabase, options);
  const matchesById = await readMatches(supabase, snapshots);
  const reconciliation = reconcileSnapshots(snapshots, matchesById);
  const summary = summarize(snapshots, matchesById, reconciliation);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: reconciliation.rows.slice(0, 5).map((row) => ({
        away: row.away_team_name,
        awayReturn: row.away_win_return,
        favourite: row.favourite_team_name,
        favouriteReturn: row.favourite_win_return,
        home: row.home_team_name,
        homeReturn: row.home_win_return,
        outcomeStatus: row.outcome_status,
        source: row.source,
        winner: row.winner_team_name,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(supabase, reconciliation.rows);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
