import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;
const SOURCE_TIME_ZONE = "Pacific/Auckland";
const FIXED_WIN_MODEL = "nrl_fixed_win_percentage_single_v1";
const TRY_SCORER_MODEL = "nrl_try_scorer_percentage_single_v1";
const TRY_SCORER_CANDIDATES_PER_TEAM = 3;
const NRL_SINGLE_PREDICTION_COLUMNS = [
  "advertised_start_at",
  "away_team_name",
  "bucket_sample_size",
  "home_team_name",
  "lineup_status",
  "match_label",
  "matched_nrl_match_id",
  "other_team_fixed_win_price",
  "other_team_name",
  "predicted_at",
  "predicted_fixed_win_price",
  "predicted_player_name",
  "predicted_player_source_id",
  "predicted_team_name",
  "predicted_team_source_id",
  "prediction_model",
  "prediction_rank",
  "prediction_signature",
  "raw",
  "signal_detail",
  "signal_label",
  "signal_tone",
  "source",
  "source_date",
  "source_event_id",
  "source_market_id",
  "source_match_id",
  "source_prediction_key",
  "source_time_zone",
  "win_score",
];

/**
 * Parses NRL single prediction generation options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    requireSupabase: false,
    sourceDate: getSourceDate(new Date()),
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--source-date=")) {
      options.sourceDate = arg.slice("--source-date=".length);
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.sourceDate)) {
    throw new Error("--source-date must be YYYY-MM-DD.");
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
 * Reads Supabase service-role config for local prediction generation.
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
 * Converts a timestamp to the Auckland source date used by prediction rows.
 */
function getSourceDate(date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}`;
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
 * Minimal Supabase REST client for NRL prediction generation.
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
 * Matches full team names against nicknames such as Broncos or Melbourne Storm.
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
 * Converts nullable database numbers to finite numbers for scoring.
 */
function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rounds model scores to a stable precision before writing.
 */
function roundNumber(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

/**
 * Keeps only the latest snapshot for each bookmaker/event pair.
 */
function getLatestSnapshots(snapshots) {
  const latestByEvent = new Map();

  for (const snapshot of snapshots) {
    const key = `${snapshot.source}:${snapshot.source_event_id}`;
    const existing = latestByEvent.get(key);

    if (!existing || String(snapshot.snapshot_at) > String(existing.snapshot_at)) {
      latestByEvent.set(key, snapshot);
    }
  }

  return Array.from(latestByEvent.values());
}

/**
 * Builds season-to-date team records from official settled NRL matches.
 */
function buildTeamRecords(matches) {
  const records = new Map();

  function addTeam(teamSourceId, teamName, won) {
    if (!teamName) {
      return;
    }

    const key = teamSourceId ?? normalizeName(teamName);
    const record = records.get(key) ?? {
      losses: 0,
      selectionCount: 0,
      teamName,
      teamSourceId,
      wins: 0,
    };
    record.selectionCount += 1;

    if (won) {
      record.wins += 1;
    } else {
      record.losses += 1;
    }

    records.set(key, record);
  }

  for (const match of matches) {
    if (
      match.result_status !== "settled"
      || !Number.isFinite(Number(match.home_score))
      || !Number.isFinite(Number(match.away_score))
      || Number(match.home_score) === Number(match.away_score)
    ) {
      continue;
    }

    const homeWon = Number(match.home_score) > Number(match.away_score);
    addTeam(match.home_team_source_id, match.home_team_name, homeWon);
    addTeam(match.away_team_source_id, match.away_team_name, !homeWon);
  }

  return records;
}

/**
 * Finds the official team identity for a bookmaker-selected team on a match.
 */
function resolveTeam(match, teamName) {
  if (!match || !teamName) {
    return {
      otherFixedWinPrice: null,
      otherTeamName: null,
      teamName,
      teamSourceId: null,
    };
  }

  if (namesMatch(teamName, match.home_team_name)) {
    return {
      otherTeamName: match.away_team_name,
      teamName: match.home_team_name,
      teamSourceId: match.home_team_source_id,
    };
  }

  if (namesMatch(teamName, match.away_team_name)) {
    return {
      otherTeamName: match.home_team_name,
      teamName: match.away_team_name,
      teamSourceId: match.away_team_source_id,
    };
  }

  return {
    otherTeamName: null,
    teamName,
    teamSourceId: null,
  };
}

/**
 * Creates a fixed-win percentage signal from official team record history.
 */
function createTeamSignal(record) {
  const selections = record?.selectionCount ?? 0;
  const wins = record?.wins ?? 0;
  const score = selections > 0 ? roundNumber((wins / selections) * 100) : 0;
  const tone = score >= 65 ? "positive" : score >= 50 ? "neutral" : "caution";

  return {
    detail: `${wins} wins from ${selections} settled 2026 matches`,
    score,
    tone,
  };
}

/**
 * Builds current fixed-win single predictions from latest fixed-win favourites.
 */
function buildFixedWinPredictions({ matchesById, predictedAt, snapshots, sourceDate, teamRecords }) {
  const rows = [];

  for (const snapshot of getLatestSnapshots(snapshots)) {
    if (!snapshot.favourite_team_name || !snapshot.matched_nrl_match_id) {
      continue;
    }

    const match = matchesById.get(snapshot.matched_nrl_match_id);

    if (!match || match.result_status !== "pending") {
      continue;
    }

    const team = resolveTeam(match, snapshot.favourite_team_name);
    const record = team.teamSourceId
      ? teamRecords.get(team.teamSourceId)
      : null;
    const signal = createTeamSignal(record);
    const isHome = namesMatch(team.teamName, match.home_team_name);
    const otherFixedWinPrice = isHome
      ? snapshot.away_fixed_win_price
      : snapshot.home_fixed_win_price;

    rows.push({
      advertised_start_at: snapshot.advertised_start_at,
      away_team_name: snapshot.away_team_name,
      bucket_sample_size: record?.selectionCount ?? 0,
      home_team_name: snapshot.home_team_name,
      lineup_status: "not_applicable",
      match_label: `${snapshot.home_team_name} vs ${snapshot.away_team_name}`,
      matched_nrl_match_id: snapshot.matched_nrl_match_id,
      other_team_fixed_win_price: otherFixedWinPrice,
      other_team_name: team.otherTeamName,
      predicted_at: predictedAt,
      predicted_fixed_win_price: snapshot.favourite_fixed_win_price,
      predicted_team_name: team.teamName,
      predicted_team_source_id: team.teamSourceId,
      prediction_model: FIXED_WIN_MODEL,
      prediction_rank: null,
      prediction_signature: [
        snapshot.source_snapshot_key,
        team.teamSourceId ?? team.teamName,
        snapshot.favourite_fixed_win_price,
        signal.score,
      ].join(":"),
      raw: {
        scoreSource: "official_2026_team_win_percentage",
        sourceSnapshotKey: snapshot.source_snapshot_key,
      },
      signal_detail: signal.detail,
      signal_label: `${signal.score.toFixed(2)}% team win rate`,
      signal_tone: signal.tone,
      source: snapshot.source,
      source_date: sourceDate,
      source_event_id: snapshot.source_event_id,
      source_market_id: snapshot.source_market_id,
      source_match_id: match.source_match_id,
      source_prediction_key: [
        FIXED_WIN_MODEL,
        snapshot.source,
        sourceDate,
        snapshot.source_event_id,
      ].join(":"),
      source_time_zone: SOURCE_TIME_ZONE,
      win_score: signal.score,
    });
  }

  return rankRows(rows);
}

/**
 * Selects the strongest historical try-scorer candidates for each upcoming team.
 */
function getTopTryScorerRowsByTeam(aggregates) {
  const byTeam = new Map();

  for (const row of aggregates) {
    if (
      row.insight_type !== "try_scorer_percentage"
      || row.scope_type !== "player_team"
      || !row.team_source_id
      || !row.player_source_id
      || numeric(row.selection_count) < 1
    ) {
      continue;
    }

    const teamRows = byTeam.get(row.team_source_id) ?? [];
    teamRows.push(row);
    byTeam.set(row.team_source_id, teamRows);
  }

  for (const [teamSourceId, teamRows] of byTeam.entries()) {
    teamRows.sort((left, right) => {
      const scoreDifference = numeric(right.win_percentage) - numeric(left.win_percentage);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return numeric(right.selection_count) - numeric(left.selection_count);
    });
    byTeam.set(teamSourceId, teamRows.slice(0, TRY_SCORER_CANDIDATES_PER_TEAM));
  }

  return byTeam;
}

/**
 * Builds current try-scorer percentage singles from upcoming teams and historical player/team rates.
 */
function buildTryScorerPredictions({ aggregates, matches, predictedAt, sourceDate }) {
  const rows = [];
  const tryScorersByTeam = getTopTryScorerRowsByTeam(aggregates);

  for (const match of matches) {
    if (match.result_status !== "pending") {
      continue;
    }

    const teams = [
      {
        opponentName: match.away_team_name,
        teamName: match.home_team_name,
        teamSourceId: match.home_team_source_id,
      },
      {
        opponentName: match.home_team_name,
        teamName: match.away_team_name,
        teamSourceId: match.away_team_source_id,
      },
    ];

    for (const team of teams) {
      const candidates = team.teamSourceId
        ? tryScorersByTeam.get(team.teamSourceId) ?? []
        : [];

      for (const candidate of candidates) {
        const score = roundNumber(numeric(candidate.win_percentage));

        rows.push({
          advertised_start_at: match.kickoff_at,
          away_team_name: match.away_team_name,
          bucket_sample_size: candidate.selection_count,
          home_team_name: match.home_team_name,
          lineup_status: "historical_team_roster",
          match_label: `${match.home_team_name} vs ${match.away_team_name}`,
          matched_nrl_match_id: match.id,
          other_team_name: team.opponentName,
          predicted_at: predictedAt,
          predicted_player_name: candidate.player_name,
          predicted_player_source_id: candidate.player_source_id,
          predicted_team_name: team.teamName,
          predicted_team_source_id: team.teamSourceId,
          prediction_model: TRY_SCORER_MODEL,
          prediction_rank: null,
          prediction_signature: [
            match.source_match_id,
            candidate.team_source_id,
            candidate.player_source_id,
            candidate.selection_count,
            score,
          ].join(":"),
          raw: {
            scoreSource: "official_2026_player_team_try_scorer_percentage",
            totalTries: candidate.total_tries,
          },
          signal_detail: `${candidate.win_count} scoring appearances from ${candidate.selection_count} settled team appearances`,
          signal_label: `${score.toFixed(2)}% try rate`,
          signal_tone: score >= 40 ? "positive" : score >= 25 ? "neutral" : "caution",
          source: "official_nrl",
          source_date: sourceDate,
          source_event_id: match.source_match_id,
          source_match_id: match.source_match_id,
          source_prediction_key: [
            TRY_SCORER_MODEL,
            "official_nrl",
            sourceDate,
            match.source_match_id,
            candidate.player_source_id,
          ].join(":"),
          source_time_zone: SOURCE_TIME_ZONE,
          win_score: score,
        });
      }
    }
  }

  return rankRows(rows);
}

/**
 * Adds global rank ordering by score and advertised start.
 */
function rankRows(rows) {
  return [...rows]
    .sort((left, right) => {
      const scoreDifference = numeric(right.win_score) - numeric(left.win_score);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return new Date(left.advertised_start_at ?? 0).valueOf()
        - new Date(right.advertised_start_at ?? 0).valueOf();
    })
    .map((row, index) => ({
      ...row,
      prediction_rank: index + 1,
    }));
}

/**
 * Gives every prediction row the same nullable column set for PostgREST bulk writes.
 */
function normalizeRowForWrite(row) {
  return Object.fromEntries(NRL_SINGLE_PREDICTION_COLUMNS.map((column) => [
    column,
    row[column] ?? null,
  ]));
}

/**
 * Loads source rows needed by both NRL single prediction models.
 */
async function readSourceRows(supabase) {
  const [snapshots, matches, aggregates] = await Promise.all([
    supabase.selectAll("nrl_market_snapshots", {
      order: "snapshot_at.desc",
      select: [
        "id",
        "source",
        "source_snapshot_key",
        "source_event_id",
        "source_market_id",
        "matched_nrl_match_id",
        "snapshot_at",
        "advertised_start_at",
        "home_team_name",
        "away_team_name",
        "home_fixed_win_price",
        "away_fixed_win_price",
        "favourite_team_name",
        "favourite_fixed_win_price",
      ].join(","),
      source: "eq.tab",
    }),
    supabase.selectAll("nrl_matches", {
      order: "kickoff_at.asc",
      select: [
        "id",
        "source",
        "source_match_id",
        "season",
        "round_number",
        "kickoff_at",
        "result_status",
        "home_team_source_id",
        "home_team_name",
        "home_score",
        "away_team_source_id",
        "away_team_name",
        "away_score",
      ].join(","),
    }),
    supabase.selectAll("nrl_insight_aggregates", {
      insight_type: "eq.try_scorer_percentage",
      order: "win_percentage.desc",
      select: [
        "insight_type",
        "scope_type",
        "team_source_id",
        "team_name",
        "player_source_id",
        "player_name",
        "selection_count",
        "win_count",
        "win_percentage",
        "total_tries",
      ].join(","),
    }),
  ]);

  return {
    aggregates,
    matches,
    snapshots,
  };
}

/**
 * Writes generated NRL single predictions to Supabase.
 */
async function writeRows(supabase, rows, sourceDate) {
  await supabase.request("nrl_single_predictions", {
    expectJson: false,
    method: "DELETE",
    prefer: "return=minimal",
    search: {
      prediction_model: `in.(${FIXED_WIN_MODEL},${TRY_SCORER_MODEL})`,
      source_date: `eq.${sourceDate}`,
    },
  });

  await supabase.upsert(
    "nrl_single_predictions",
    rows.map(normalizeRowForWrite),
    "source_prediction_key",
  );

  return {
    nrlSinglePredictions: rows.length,
    ok: true,
    skipped: false,
  };
}

/**
 * Produces a compact generation summary.
 */
function summarize(sourceRows, fixedWinRows, tryScorerRows) {
  return {
    fixedWinPredictions: fixedWinRows.length,
    sourceMarketSnapshots: sourceRows.snapshots.length,
    sourceNrlInsightAggregates: sourceRows.aggregates.length,
    sourceNrlMatches: sourceRows.matches.length,
    tryScorerPredictions: tryScorerRows.length,
  };
}

/**
 * Runs the local NRL single prediction generation workflow.
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

  const predictedAt = new Date().toISOString();
  const supabase = createSupabaseRestClient(config, options.batchSize);
  const sourceRows = await readSourceRows(supabase);
  const matchesById = new Map(sourceRows.matches.map((match) => [match.id, match]));
  const teamRecords = buildTeamRecords(sourceRows.matches);
  const fixedWinRows = buildFixedWinPredictions({
    matchesById,
    predictedAt,
    snapshots: sourceRows.snapshots,
    sourceDate: options.sourceDate,
    teamRecords,
  });
  const tryScorerRows = buildTryScorerPredictions({
    aggregates: sourceRows.aggregates,
    matches: sourceRows.matches,
    predictedAt,
    sourceDate: options.sourceDate,
  });
  const rows = [...fixedWinRows, ...tryScorerRows];
  const summary = summarize(sourceRows, fixedWinRows, tryScorerRows);

  if (options.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sample: rows.slice(0, 10).map((row) => ({
        match: row.match_label,
        model: row.prediction_model,
        player: row.predicted_player_name,
        price: row.predicted_fixed_win_price,
        rank: row.prediction_rank,
        score: row.win_score,
        source: row.source,
        team: row.predicted_team_name,
      })),
      summary,
    }, null, 2));
    return;
  }

  const supabaseWrite = await writeRows(supabase, rows, options.sourceDate);

  console.log(JSON.stringify({
    summary,
    supabaseWrite,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
