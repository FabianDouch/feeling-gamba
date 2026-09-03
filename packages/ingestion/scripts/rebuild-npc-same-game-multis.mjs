import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;
const MODEL_KEY = "npc_favourite_top2_try_scorers_same_game_percentage_v1";

/**
 * Parses NPC same-game multi rebuild options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
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
    }
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
 * Reads Supabase service-role config for local NPC result rebuilds.
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
 * Minimal Supabase REST client for same-game multi result rebuilds.
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
   * Reads all matching rows from a Supabase REST table.
   */
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
    selectAll,
    upsert,
  };
}

/**
 * Converts nullable numeric database values to numbers for result math.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rounds same-game estimated prices and returns to stable precision.
 */
function roundMoney(value) {
  return Number(Number(value).toFixed(3));
}

/**
 * Normalizes team and player names for conservative source joins.
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
 * Compares source names while allowing full-name versus nickname suffixes.
 */
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
 * Resolves the official team ID for the favourite team stored on a fixed-win row.
 */
function getFavouriteTeamSourceId(row, match) {
  if (!match || !row.favourite_team_name) {
    return null;
  }

  if (namesMatch(row.favourite_team_name, row.home_team_name ?? match.home_team_name)) {
    return match.home_team_source_id ?? null;
  }

  if (namesMatch(row.favourite_team_name, row.away_team_name ?? match.away_team_name)) {
    return match.away_team_source_id ?? null;
  }

  return null;
}

/**
 * Groups official try-scorer rows into per-player try counts.
 */
function buildTryCounts(tryScorers) {
  const counts = new Map();

  for (const row of tryScorers) {
    const key = `${row.source}:${row.source_match_id}:${row.source_player_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Groups try-scorer market selections by source event and matched match.
 */
function buildTryPriceBuckets(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const key = `${row.source}:${row.matched_npc_match_id ?? ""}:${row.source_event_id}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return buckets;
}

/**
 * Picks the two shortest-priced try scorers for the favourite team.
 */
function selectTopTwoTryScorers({ fixedWinRow, favouriteTeamSourceId, tryPriceBuckets }) {
  const key = `${fixedWinRow.source}:${fixedWinRow.matched_npc_match_id ?? ""}:${fixedWinRow.source_event_id}`;
  const candidates = (tryPriceBuckets.get(key) ?? [])
    .filter((row) => {
      const price = numeric(row.fixed_win_price);

      if (price === null || price <= 0) {
        return false;
      }

      if (favouriteTeamSourceId && row.team_source_id) {
        return String(row.team_source_id) === String(favouriteTeamSourceId);
      }

      return namesMatch(row.team_name, fixedWinRow.favourite_team_name);
    })
    .sort((left, right) => {
      const priceDiff = Number(left.fixed_win_price) - Number(right.fixed_win_price);
      return priceDiff || String(left.player_name).localeCompare(String(right.player_name));
    });

  const selected = [];
  const seenPlayers = new Set();

  for (const candidate of candidates) {
    const playerKey = candidate.player_source_id ?? normalizeName(candidate.player_name);

    if (seenPlayers.has(playerKey)) {
      continue;
    }

    selected.push(candidate);
    seenPlayers.add(playerKey);

    if (selected.length === 2) {
      break;
    }
  }

  return selected;
}

/**
 * Keeps one fixed-win favourite snapshot per match for the same-game model.
 */
function selectFixedWinRowsForModel(rows) {
  const byEvent = new Map();
  const sortedRows = [...rows]
    .filter((row) => row.favourite_team_name)
    .sort(compareFixedWinRowsForModel);

  for (const row of sortedRows) {
    const key = getFixedWinModelKey(row);

    if (!byEvent.has(key)) {
      byEvent.set(key, row);
    }
  }

  return Array.from(byEvent.values())
    .sort((left, right) => String(left.advertised_start_at ?? "").localeCompare(String(right.advertised_start_at ?? "")));
}

/**
 * Groups matched and previously-unmatched fixed-win rows for the same source event.
 */
function getFixedWinModelKey(row) {
  if (row.source_event_id) {
    return `${row.source}:event:${row.source_event_id}`;
  }

  if (row.matched_npc_match_id) {
    return `${row.source}:match:${row.matched_npc_match_id}`;
  }

  return `${row.source}:snapshot:${row.source_snapshot_key}`;
}

/**
 * Ranks fixed-win reconciliation states for choosing the best same-game source row.
 */
function getFixedWinOutcomeRank(status) {
  switch (status) {
    case "settled":
      return 0;
    case "pending":
      return 1;
    case "missing_result":
      return 2;
    case "draw":
      return 3;
    case "non_standard":
      return 4;
    case "unmatched":
      return 5;
    default:
      return 6;
  }
}

/**
 * Prefers matched and settled fixed-win rows, then the latest snapshot.
 */
function compareFixedWinRowsForModel(left, right) {
  const matchedDiff = Number(Boolean(right.matched_npc_match_id)) - Number(Boolean(left.matched_npc_match_id));

  if (matchedDiff !== 0) {
    return matchedDiff;
  }

  const outcomeDiff = getFixedWinOutcomeRank(left.outcome_status) - getFixedWinOutcomeRank(right.outcome_status);

  if (outcomeDiff !== 0) {
    return outcomeDiff;
  }

  return String(right.snapshot_at ?? "").localeCompare(String(left.snapshot_at ?? ""));
}

/**
 * Builds one same-game multi tracking row for each fixed-win favourite snapshot result.
 */
function buildSameGameMultiRows({ fixedWinResults, matchesById, tryPriceBuckets, tryCounts }) {
  return selectFixedWinRowsForModel(fixedWinResults).map((fixedWinRow) => {
    const match = fixedWinRow.matched_npc_match_id
      ? matchesById.get(fixedWinRow.matched_npc_match_id)
      : null;
    const favouriteTeamSourceId = getFavouriteTeamSourceId(fixedWinRow, match);
    const selectedTryScorers = selectTopTwoTryScorers({
      favouriteTeamSourceId,
      fixedWinRow,
      tryPriceBuckets,
    });
    const first = selectedTryScorers[0] ?? null;
    const second = selectedTryScorers[1] ?? null;
    const fixedWinPrice = numeric(fixedWinRow.favourite_fixed_win_price);
    const firstPrice = numeric(first?.fixed_win_price);
    const secondPrice = numeric(second?.fixed_win_price);
    const hasAllPrices = fixedWinPrice !== null && firstPrice !== null && secondPrice !== null;
    const firstTryCount = first?.player_source_id && match
      ? tryCounts.get(`${match.source}:${match.source_match_id}:${first.player_source_id}`) ?? 0
      : null;
    const secondTryCount = second?.player_source_id && match
      ? tryCounts.get(`${match.source}:${match.source_match_id}:${second.player_source_id}`) ?? 0
      : null;
    const selectedTeamWon = fixedWinRow.favourite_won === true;
    const multiWon = selectedTeamWon && Number(firstTryCount) > 0 && Number(secondTryCount) > 0;
    const combinedEstimatedPrice = hasAllPrices
      ? roundMoney(fixedWinPrice * firstPrice * secondPrice)
      : null;
    const sourceResultKey = `${MODEL_KEY}:${fixedWinRow.source_snapshot_key}`;
    const outcomeStatus = fixedWinRow.outcome_status === "settled"
      ? (hasAllPrices ? "settled" : "missing_price")
      : fixedWinRow.outcome_status;

    return {
      advertised_start_at: fixedWinRow.advertised_start_at,
      combined_estimated_price: combinedEstimatedPrice,
      fixed_win_snapshot_result_id: fixedWinRow.id,
      match_label: fixedWinRow.home_team_name && fixedWinRow.away_team_name
        ? `${fixedWinRow.home_team_name} vs ${fixedWinRow.away_team_name}`
        : null,
      matched_npc_match_id: fixedWinRow.matched_npc_match_id,
      model_key: MODEL_KEY,
      outcome_status: outcomeStatus,
      outcome_win_return: outcomeStatus === "settled" && multiWon && combinedEstimatedPrice !== null
        ? combinedEstimatedPrice
        : 0,
      raw: {
        fixedWinSourceSnapshotKey: fixedWinRow.source_snapshot_key,
        returnBasis: "estimated_product_of_fixed_win_and_two_try_scorer_prices",
      },
      round_number: match?.round_number ?? null,
      season: match?.season ?? null,
      selected_team_fixed_win_price: fixedWinPrice,
      selected_team_name: fixedWinRow.favourite_team_name,
      selected_team_source_id: favouriteTeamSourceId,
      selected_team_won: fixedWinRow.favourite_won,
      snapshot_at: fixedWinRow.snapshot_at,
      source: fixedWinRow.source,
      source_event_id: fixedWinRow.source_event_id,
      source_match_id: match?.source_match_id ?? null,
      source_result_key: sourceResultKey,
      try_scorer_1_name: first?.player_name ?? null,
      try_scorer_1_player_source_id: first?.player_source_id ?? null,
      try_scorer_1_price: firstPrice,
      try_scorer_1_scored: firstTryCount === null ? null : firstTryCount > 0,
      try_scorer_1_snapshot_id: first?.id ?? null,
      try_scorer_1_try_count: firstTryCount,
      try_scorer_2_name: second?.player_name ?? null,
      try_scorer_2_player_source_id: second?.player_source_id ?? null,
      try_scorer_2_price: secondPrice,
      try_scorer_2_scored: secondTryCount === null ? null : secondTryCount > 0,
      try_scorer_2_snapshot_id: second?.id ?? null,
      try_scorer_2_try_count: secondTryCount,
    };
  });
}

/**
 * Loads fixed-win, try-scorer price, match, and result rows for the rebuild.
 */
async function readSourceRows(supabase) {
  const [fixedWinResults, matches, tryScorerPrices, tryScorers] = await Promise.all([
    supabase.selectAll("npc_fixed_win_snapshot_results", {
      order: "snapshot_at.asc",
      select: [
        "id",
        "source",
        "source_snapshot_key",
        "source_event_id",
        "matched_npc_match_id",
        "snapshot_at",
        "advertised_start_at",
        "home_team_name",
        "away_team_name",
        "favourite_team_name",
        "favourite_fixed_win_price",
        "favourite_won",
        "outcome_status",
      ].join(","),
    }),
    supabase.selectAll("npc_matches", {
      order: "kickoff_at.asc",
      select: [
        "id",
        "source",
        "source_match_id",
        "season",
        "round_number",
        "home_team_source_id",
        "home_team_name",
        "away_team_source_id",
        "away_team_name",
      ].join(","),
    }),
    supabase.selectAll("npc_try_scorer_market_snapshots", {
      order: "snapshot_at.asc,fixed_win_price.asc",
      select: [
        "id",
        "source",
        "source_event_id",
        "matched_npc_match_id",
        "snapshot_at",
        "player_source_id",
        "player_name",
        "team_source_id",
        "team_name",
        "fixed_win_price",
      ].join(","),
    }),
    supabase.selectAll("npc_try_scorers", {
      order: "source_match_id.asc,game_seconds.asc",
      select: [
        "source",
        "source_match_id",
        "source_player_id",
      ].join(","),
    }),
  ]);

  return {
    fixedWinResults,
    matches,
    tryScorerPrices,
    tryScorers,
  };
}

/**
 * Replaces the stored same-game multi rows for the current model.
 */
async function writeRows(supabase, rows) {
  await supabase.request("npc_same_game_multi_results", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      model_key: `eq.${MODEL_KEY}`,
    },
  });
  await supabase.upsert("npc_same_game_multi_results", rows, "source_result_key");

  return {
    npcSameGameMultiResults: rows.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Runs the local NPC same-game multi result rebuild workflow.
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
  const sourceRows = await readSourceRows(supabase);
  const rows = buildSameGameMultiRows({
    fixedWinResults: sourceRows.fixedWinResults,
    matchesById: new Map(sourceRows.matches.map((match) => [match.id, match])),
    tryCounts: buildTryCounts(sourceRows.tryScorers),
    tryPriceBuckets: buildTryPriceBuckets(sourceRows.tryScorerPrices),
  });
  const summary = {
    matchedPricedMultis: rows.filter((row) => row.outcome_status === "settled").length,
    missingPriceRows: rows.filter((row) => row.outcome_status === "missing_price").length,
    npcFixedWinSnapshotResults: sourceRows.fixedWinResults.length,
    npcSameGameMultiResults: rows.length,
    npcTryScorerMarketSnapshots: sourceRows.tryScorerPrices.length,
    settledWins: rows.filter((row) => row.outcome_status === "settled" && row.outcome_win_return > 0).length,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.slice(0, 8),
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
