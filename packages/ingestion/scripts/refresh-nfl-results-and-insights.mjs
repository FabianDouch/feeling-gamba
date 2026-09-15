import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_LOOKBACK_WEEKS = 2;
const DEFAULT_SEASON_TYPE = 2;

/**
 * Parses the scheduled NFL post-match settlement options.
 */
function parseArgs(argv) {
  const now = new Date();
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    fromRound: null,
    lookbackWeeks: DEFAULT_LOOKBACK_WEEKS,
    requireSupabase: false,
    season: now.getUTCFullYear(),
    seasonType: DEFAULT_SEASON_TYPE,
    toRound: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--lookback-weeks=")) {
      options.lookbackWeeks = Number(arg.slice("--lookback-weeks=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    } else if (arg.startsWith("--season-type=")) {
      options.seasonType = Number(arg.slice("--season-type=".length));
    } else if (arg.startsWith("--from-round=")) {
      options.fromRound = Number(arg.slice("--from-round=".length));
    } else if (arg.startsWith("--to-round=")) {
      options.toRound = Number(arg.slice("--to-round=".length));
    }
  }

  for (const [name, value] of [
    ["--batch-size", options.batchSize],
    ["--lookback-weeks", options.lookbackWeeks],
  ]) {
    if (!isPositiveInteger(value)) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("--season must be a four-digit year.");
  }

  if (![1, 2, 3].includes(options.seasonType)) {
    throw new Error("--season-type must be 1, 2, or 3.");
  }

  if ((options.fromRound !== null && options.toRound === null) || (options.fromRound === null && options.toRound !== null)) {
    throw new Error("Pass both --from-round=N and --to-round=N, or neither.");
  }

  if (options.fromRound !== null) {
    if (!isPositiveInteger(options.fromRound) || !isPositiveInteger(options.toRound)) {
      throw new Error("--from-round and --to-round must be positive integers.");
    }

    if (options.fromRound > options.toRound) {
      throw new Error("--from-round must be before or equal to --to-round.");
    }
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

function getWriteFlags(options) {
  const flags = [`--batch-size=${options.batchSize}`];

  if (options.dryRun) {
    flags.push("--dry-run");
  }

  if (options.requireSupabase) {
    flags.push("--require-supabase");
  }

  return flags;
}

/**
 * Estimates the current NFL week from the regular-season calendar start date.
 */
function getEstimatedCurrentWeek(season) {
  const regularSeasonStart = Date.UTC(season, 8, 6, 7, 0, 0);
  const now = Date.now();

  if (now < regularSeasonStart) {
    return 1;
  }

  return Math.min(18, Math.max(1, Math.floor((now - regularSeasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1));
}

/**
 * Builds the ordered NFL result and aggregate refresh commands.
 */
function buildRefreshCommands(options) {
  const writeFlags = getWriteFlags(options);
  const toRound = options.toRound ?? getEstimatedCurrentWeek(options.season);
  const fromRound = options.fromRound ?? Math.max(1, toRound - options.lookbackWeeks + 1);

  return [
    buildCommand("refresh_nfl_results", "refresh-nfl-results-from-nflverse.mjs", [
      `--season=${options.season}`,
      `--season-type=${options.seasonType}`,
      `--from-round=${fromRound}`,
      `--to-round=${toRound}`,
      "--include-fixtures",
      ...writeFlags,
    ]),
    buildCommand("reconcile_nfl_fixed_win", "reconcile-nfl-fixed-win-snapshots.mjs", writeFlags),
    buildCommand("rebuild_nfl_insights", "rebuild-nfl-insight-aggregates.mjs", writeFlags),
  ];
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
 * Runs the complete NFL result settlement and Insights refresh.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const commands = buildRefreshCommands(options);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    season: options.season,
    seasonType: options.seasonType,
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
