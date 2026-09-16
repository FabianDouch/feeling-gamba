import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;

const COMMON_SELECT_COLUMNS = [
  "average_return_per_dollar",
  "bucket_size",
  "date_from",
  "date_to",
  "event_count",
  "insight_type",
  "missing_price_count",
  "missing_result_count",
  "net_return",
  "pending_count",
  "player_name",
  "player_source_id",
  "price_bucket_end",
  "price_bucket_label",
  "price_bucket_start",
  "roi_percentage",
  "scope_type",
  "selection_count",
  "selection_type",
  "team_name",
  "team_source_id",
  "total_return",
  "total_stake",
  "unmatched_count",
  "win_count",
  "win_percentage",
];

const GROUP_CONFIGS = {
  football: {
    label: "Football",
    leagues: [
      { key: "ucl", table: "ucl_insight_aggregates", totalColumn: "total_goals" },
      { key: "epl", table: "epl_insight_aggregates", totalColumn: "total_goals" },
      { key: "laliga", table: "laliga_insight_aggregates", totalColumn: "total_goals" },
      { key: "bundesliga", table: "bundesliga_insight_aggregates", totalColumn: "total_goals" },
      { key: "seriea", table: "seriea_insight_aggregates", totalColumn: "total_goals" },
      { key: "ligue1", table: "ligue1_insight_aggregates", totalColumn: "total_goals" },
      { key: "mls", table: "mls_insight_aggregates", totalColumn: "total_goals" },
      { key: "europaleague", table: "europaleague_insight_aggregates", totalColumn: "total_goals" },
      { key: "eflcup", table: "eflcup_insight_aggregates", totalColumn: "total_goals" },
    ],
  },
  rugby_league: {
    label: "Rugby League",
    leagues: [
      { key: "nrl", table: "nrl_insight_aggregates", totalColumn: "total_tries" },
    ],
  },
  rugby_union: {
    label: "Rugby Union",
    leagues: [
      { key: "npc", table: "npc_insight_aggregates", totalColumn: "total_tries" },
    ],
  },
};

const INCLUDED_SCOPE_TYPES = new Set([
  "overall",
  "selection_type",
  "favourite_venue",
  "team",
  "player",
  "player_team",
  "price_bucket",
  "price_bucket_plus",
  "other_team_price_bucket",
  "other_team_price_bucket_plus",
  "price_difference_bucket",
  "price_difference_bucket_plus",
]);

/**
 * Parses the sport-group aggregate rebuild options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    groups: Object.keys(GROUP_CONFIGS),
    requireSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--groups=")) {
      options.groups = arg.slice("--groups=".length).split(",").map((value) => value.trim()).filter(Boolean);
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  for (const group of options.groups) {
    if (!GROUP_CONFIGS[group]) {
      throw new Error(`Unknown group "${group}". Expected one of: ${Object.keys(GROUP_CONFIGS).join(", ")}.`);
    }
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
 * Reads Supabase service-role config for local aggregate rebuilds.
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
 * Minimal Supabase REST client for sport-group aggregate rebuilds.
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
 * Converts nullable numeric database values to numbers for aggregate math.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rounds aggregate metrics to a stable precision before writing.
 */
function roundNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

/**
 * Produces the select list for a source league table.
 */
function getLeagueSelect(totalColumn) {
  return [...COMMON_SELECT_COLUMNS, totalColumn].join(",");
}

/**
 * Returns the grouping key for rows that can be meaningfully combined across leagues.
 */
function getGroupKey(row) {
  const parts = [
    row.insight_type,
    row.scope_type,
    row.selection_type ?? "",
    normalizeBucket(row.bucket_size),
    normalizeBucket(row.price_bucket_start),
    normalizeBucket(row.price_bucket_end),
    row.team_name ?? "",
    row.player_name ?? "",
  ];

  return parts.join("|");
}

/**
 * Builds a stable app-facing scope key for a combined sport-group aggregate row.
 */
function getScopeKey(sportGroup, row) {
  return [
    sportGroup,
    row.insight_type,
    row.scope_type,
    row.selection_type ?? "all",
    normalizeBucket(row.bucket_size),
    normalizeBucket(row.price_bucket_start),
    row.team_name ?? "",
    row.player_name ?? "",
  ]
    .join(":")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

/**
 * Normalizes bucket numbers so equivalent database numeric strings group together.
 */
function normalizeBucket(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
}

/**
 * Creates an initialized sport-group aggregate bucket from one source row.
 */
function createBucket(sportGroup, row) {
  return {
    _leagues: new Set(),
    average_return_per_dollar: 0,
    bucket_size: numeric(row.bucket_size) === 0.25 ? 0.25 : 0.5,
    date_from: row.date_from,
    date_to: row.date_to,
    event_count: 0,
    insight_type: row.insight_type,
    missing_price_count: 0,
    missing_result_count: 0,
    net_return: 0,
    pending_count: 0,
    player_name: row.player_name ?? null,
    player_source_id: null,
    price_bucket_end: row.price_bucket_end,
    price_bucket_label: row.price_bucket_label,
    price_bucket_start: row.price_bucket_start,
    roi_percentage: 0,
    scope_key: getScopeKey(sportGroup, row),
    scope_type: row.scope_type,
    selection_count: 0,
    selection_type: row.selection_type ?? null,
    source: null,
    sport_group: sportGroup,
    team_name: row.team_name ?? null,
    team_source_id: null,
    total_goals: 0,
    total_return: 0,
    total_stake: 0,
    total_tries: 0,
    unmatched_count: 0,
    win_count: 0,
    win_percentage: 0,
  };
}

/**
 * Adds one league aggregate row into a sport-group bucket.
 */
function addRowToBucket(bucket, row, league) {
  bucket._leagues.add(league.key);
  bucket.date_from = minDate(bucket.date_from, row.date_from);
  bucket.date_to = maxDate(bucket.date_to, row.date_to);
  bucket.event_count += numeric(row.event_count);
  bucket.missing_price_count += numeric(row.missing_price_count);
  bucket.missing_result_count += numeric(row.missing_result_count);
  bucket.net_return += numeric(row.net_return);
  bucket.pending_count += numeric(row.pending_count);
  bucket.selection_count += numeric(row.selection_count);
  bucket.total_goals += league.totalColumn === "total_goals" ? numeric(row.total_goals) : 0;
  bucket.total_return += numeric(row.total_return);
  bucket.total_stake += numeric(row.total_stake);
  bucket.total_tries += league.totalColumn === "total_tries" ? numeric(row.total_tries) : 0;
  bucket.unmatched_count += numeric(row.unmatched_count);
  bucket.win_count += numeric(row.win_count);
}

/**
 * Chooses the earlier non-null ISO date.
 */
function minDate(left, right) {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return left < right ? left : right;
}

/**
 * Chooses the later non-null ISO date.
 */
function maxDate(left, right) {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return left > right ? left : right;
}

/**
 * Finalizes a summed bucket into the row shape stored for app reads.
 */
function finalizeBucket(bucket) {
  const totalStake = numeric(bucket.total_stake);
  const leagues = [...bucket._leagues].sort();

  delete bucket._leagues;

  return {
    ...bucket,
    average_return_per_dollar: totalStake > 0 ? roundNumber(bucket.total_return / totalStake, 6) : 0,
    included_leagues: leagues,
    net_return: roundNumber(bucket.net_return, 6),
    roi_percentage: totalStake > 0 ? roundNumber((bucket.net_return / totalStake) * 100, 3) : 0,
    source_league_count: leagues.length,
    total_return: roundNumber(bucket.total_return, 6),
    total_stake: roundNumber(totalStake, 6),
    win_percentage: bucket.selection_count > 0 ? roundNumber((bucket.win_count / bucket.selection_count) * 100, 3) : 0,
  };
}

/**
 * Reads source league rows and returns combined sport-group aggregate rows.
 */
async function buildSportGroupRows(client, sportGroup) {
  const config = GROUP_CONFIGS[sportGroup];
  const buckets = new Map();

  for (const league of config.leagues) {
    const rows = await client.selectAll(league.table, {
      select: getLeagueSelect(league.totalColumn),
    });

    for (const row of rows) {
      if (!INCLUDED_SCOPE_TYPES.has(row.scope_type)) {
        continue;
      }

      const groupKey = getGroupKey(row);
      const bucket = buckets.get(groupKey) ?? createBucket(sportGroup, row);

      addRowToBucket(bucket, row, league);
      buckets.set(groupKey, bucket);
    }
  }

  return [...buckets.values()].map(finalizeBucket);
}

/**
 * Deletes only the rebuilt sport-group rows so source league aggregates remain untouched.
 */
async function deleteSportGroupRows(client, sportGroup) {
  await client.request("sport_group_insight_aggregates", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      sport_group: `eq.${sportGroup}`,
    },
  });
}

/**
 * Rebuilds app-facing aggregate rows for the selected sport groups.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const config = getSupabaseWriteConfig();

  if (!config) {
    const message = "Supabase service-role config is missing; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.";

    if (options.requireSupabase) {
      throw new Error(message);
    }

    console.log(JSON.stringify({ dryRun: options.dryRun, skipped: true, reason: message }, null, 2));
    return;
  }

  const client = createSupabaseRestClient(config, options.batchSize);
  const summary = [];

  for (const sportGroup of options.groups) {
    const rows = await buildSportGroupRows(client, sportGroup);
    summary.push({
      rows: rows.length,
      sportGroup,
    });

    if (!options.dryRun) {
      await deleteSportGroupRows(client, sportGroup);
      await client.upsert("sport_group_insight_aggregates", rows, "scope_key");
    }
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    groups: summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
