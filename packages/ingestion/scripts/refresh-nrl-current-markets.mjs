import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_EVENT_COUNT = 20;
const DEFAULT_ENTRANTS_FIRST = 60;
const DEFAULT_MARKETS_FIRST = 500;

/**
 * Parses the NRL current-market refresh orchestration options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: null,
    dryRun: false,
    entrantsFirst: DEFAULT_ENTRANTS_FIRST,
    eventCount: DEFAULT_EVENT_COUNT,
    fromRound: null,
    marketsFirst: DEFAULT_MARKETS_FIRST,
    requireSupabase: false,
    round: null,
    season: null,
    skipFixedWin: false,
    skipFixturePreload: false,
    skipInsights: false,
    skipPredictions: false,
    skipReconcile: false,
    skipSameGame: false,
    skipTryScorers: false,
    toRound: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-fixed-win") {
      options.skipFixedWin = true;
    } else if (arg === "--skip-fixture-preload") {
      options.skipFixturePreload = true;
    } else if (arg === "--skip-insights") {
      options.skipInsights = true;
    } else if (arg === "--skip-predictions") {
      options.skipPredictions = true;
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg === "--skip-same-game") {
      options.skipSameGame = true;
    } else if (arg === "--skip-try-scorers") {
      options.skipTryScorers = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--entrants-first=")) {
      options.entrantsFirst = Number(arg.slice("--entrants-first=".length));
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--from-round=")) {
      options.fromRound = Number(arg.slice("--from-round=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    } else if (arg.startsWith("--round=")) {
      options.round = Number(arg.slice("--round=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    } else if (arg.startsWith("--to-round=")) {
      options.toRound = Number(arg.slice("--to-round=".length));
    }
  }

  if (!isPositiveInteger(options.eventCount)) {
    throw new Error("--event-count must be a positive integer.");
  }

  if (!isPositiveInteger(options.marketsFirst)) {
    throw new Error("--markets-first must be a positive integer.");
  }

  if (!isPositiveInteger(options.entrantsFirst)) {
    throw new Error("--entrants-first must be a positive integer.");
  }

  if (options.batchSize !== null && !isPositiveInteger(options.batchSize)) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (options.round !== null && (options.fromRound !== null || options.toRound !== null)) {
    throw new Error("Pass either --round=N or --from-round=N --to-round=N, not both.");
  }

  if ((options.fromRound !== null && options.toRound === null) || (options.fromRound === null && options.toRound !== null)) {
    throw new Error("Pass both --from-round=N and --to-round=N, or neither.");
  }

  for (const [name, value] of [
    ["--season", options.season],
    ["--round", options.round],
    ["--from-round", options.fromRound],
    ["--to-round", options.toRound],
  ]) {
    if (value !== null && !isPositiveInteger(value)) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (!options.skipFixturePreload && (options.round !== null || options.fromRound !== null) && !isPositiveInteger(options.season)) {
    throw new Error("Pass --season=YYYY when preloading official NRL fixtures.");
  }

  if (options.fromRound !== null && options.fromRound > options.toRound) {
    throw new Error("--from-round must be before or equal to --to-round.");
  }

  return options;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function buildCommand(label, scriptName, args) {
  return {
    args: [path.join(SCRIPT_DIR, scriptName), ...args],
    command: process.execPath,
    label,
  };
}

/**
 * Builds the shared Supabase/write flags used by the child ingestion workers.
 */
function getWriteFlags(options) {
  const flags = [];

  if (options.dryRun) {
    flags.push("--dry-run");
  }

  if (options.requireSupabase) {
    flags.push("--require-supabase");
  }

  if (options.batchSize !== null) {
    flags.push(`--batch-size=${options.batchSize}`);
  }

  return flags;
}

/**
 * Builds the ordered NRL current-market refresh command list.
 */
function buildRefreshCommands(options) {
  const commands = [];
  const writeFlags = getWriteFlags(options);
  const marketFlags = [
    `--event-count=${options.eventCount}`,
    ...writeFlags,
  ];

  if (!options.skipFixturePreload && (options.round !== null || options.fromRound !== null)) {
    const roundFlags = options.round !== null
      ? [`--round=${options.round}`]
      : [`--from-round=${options.fromRound}`, `--to-round=${options.toRound}`];

    commands.push(buildCommand("preload_official_nrl_fixtures", "refresh-nrl-results-from-official.mjs", [
      `--season=${options.season}`,
      ...roundFlags,
      "--include-fixtures",
      ...writeFlags,
    ]));
  }

  if (!options.skipFixedWin) {
    commands.push(buildCommand("capture_nrl_fixed_win_markets", "refresh-nrl-market-snapshots-from-tab.mjs", [
      ...marketFlags,
      `--markets-first=${options.marketsFirst}`,
    ]));

    commands.push(buildCommand("capture_nrl_half_time_full_time_markets", "refresh-nrl-half-time-full-time-snapshots-from-tab.mjs", [
      ...marketFlags,
      `--markets-first=${options.marketsFirst}`,
    ]));
  }

  if (!options.skipTryScorers) {
    commands.push(buildCommand("capture_nrl_try_scorer_markets", "refresh-nrl-try-scorer-market-snapshots-from-tab.mjs", [
      ...marketFlags,
      `--markets-first=${options.marketsFirst}`,
      `--entrants-first=${options.entrantsFirst}`,
    ]));
  }

  if (!options.skipReconcile) {
    commands.push(buildCommand("reconcile_nrl_fixed_win", "reconcile-nrl-fixed-win-snapshots.mjs", writeFlags));
    commands.push(buildCommand("reconcile_nrl_half_time_full_time", "reconcile-nrl-half-time-full-time-snapshots.mjs", writeFlags));
  }

  if (!options.skipSameGame) {
    commands.push(buildCommand("rebuild_nrl_same_game_multis", "rebuild-nrl-same-game-multis.mjs", writeFlags));
  }

  if (!options.skipInsights) {
    commands.push(buildCommand("rebuild_nrl_insights", "rebuild-nrl-insight-aggregates.mjs", writeFlags));
  }

  if (!options.skipPredictions) {
    commands.push(buildCommand("generate_nrl_single_predictions", "generate-nrl-single-predictions.mjs", writeFlags));
  }

  return commands;
}

/**
 * Runs one child ingestion command while streaming logs for auditability.
 */
async function runCommand(command) {
  await new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command.label} failed with exit code ${code}.`));
    });
  });
}

/**
 * Runs the complete current NRL market capture and derived-read-model refresh.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const commands = buildRefreshCommands(options);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    eventCount: options.eventCount,
    steps: commands.map((command) => ({
      args: command.args,
      command: command.command,
      label: command.label,
    })),
  }, null, 2));

  for (const command of commands) {
    await runCommand(command);
  }

  console.log(JSON.stringify({
    ok: true,
    stepsCompleted: commands.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
