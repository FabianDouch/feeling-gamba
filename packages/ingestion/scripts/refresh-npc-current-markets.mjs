import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_EVENT_COUNT = 20;
const DEFAULT_ENTRANTS_FIRST = 60;
const DEFAULT_MARKETS_FIRST = 500;

/**
 * Parses the NPC current-market refresh orchestration options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: null,
    dryRun: false,
    entrantsFirst: DEFAULT_ENTRANTS_FIRST,
    eventCount: DEFAULT_EVENT_COUNT,
    marketsFirst: DEFAULT_MARKETS_FIRST,
    requireSupabase: false,
    skipFixedWin: false,
    skipInsights: false,
    skipPredictions: false,
    skipReconcile: false,
    skipSameGameMultis: false,
    skipTryScorers: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-fixed-win") {
      options.skipFixedWin = true;
    } else if (arg === "--skip-insights") {
      options.skipInsights = true;
    } else if (arg === "--skip-predictions") {
      options.skipPredictions = true;
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg === "--skip-same-game-multis") {
      options.skipSameGameMultis = true;
    } else if (arg === "--skip-try-scorers") {
      options.skipTryScorers = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--entrants-first=")) {
      options.entrantsFirst = Number(arg.slice("--entrants-first=".length));
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    }
  }

  if (!isPositiveInteger(options.entrantsFirst)) {
    throw new Error("--entrants-first must be a positive integer.");
  }

  if (!isPositiveInteger(options.eventCount)) {
    throw new Error("--event-count must be a positive integer.");
  }

  if (!isPositiveInteger(options.marketsFirst)) {
    throw new Error("--markets-first must be a positive integer.");
  }

  if (options.batchSize !== null && !isPositiveInteger(options.batchSize)) {
    throw new Error("--batch-size must be a positive integer.");
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
 * Builds the shared Supabase/write flags used by the child NPC workers.
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
 * Builds the ordered NPC current-market refresh command list.
 */
function buildRefreshCommands(options) {
  const commands = [];
  const writeFlags = getWriteFlags(options);

  if (!options.skipFixedWin) {
    commands.push(buildCommand("capture_npc_fixed_win_markets", "refresh-npc-market-snapshots-from-tab.mjs", [
      `--event-count=${options.eventCount}`,
      `--markets-first=${options.marketsFirst}`,
      ...writeFlags,
    ]));

    commands.push(buildCommand("capture_npc_half_time_full_time_markets", "refresh-npc-half-time-full-time-snapshots-from-tab.mjs", [
      `--event-count=${options.eventCount}`,
      `--markets-first=${options.marketsFirst}`,
      ...writeFlags,
    ]));
  }

  if (!options.skipTryScorers) {
    commands.push(buildCommand("capture_npc_try_scorer_markets", "refresh-npc-try-scorer-market-snapshots-from-tab.mjs", [
      `--entrants-first=${options.entrantsFirst}`,
      `--event-count=${options.eventCount}`,
      `--markets-first=${options.marketsFirst}`,
      ...writeFlags,
    ]));
  }

  if (!options.skipReconcile) {
    commands.push(buildCommand("reconcile_npc_fixed_win", "reconcile-npc-fixed-win-snapshots.mjs", writeFlags));
    commands.push(buildCommand("reconcile_npc_half_time_full_time", "reconcile-npc-half-time-full-time-snapshots.mjs", writeFlags));
  }

  if (!options.skipSameGameMultis) {
    commands.push(buildCommand("rebuild_npc_same_game_multis", "rebuild-npc-same-game-multis.mjs", writeFlags));
  }

  if (!options.skipInsights) {
    commands.push(buildCommand("rebuild_npc_insights", "rebuild-npc-insight-aggregates.mjs", writeFlags));
  }

  if (!options.skipPredictions) {
    commands.push(buildCommand("generate_npc_single_predictions", "generate-npc-single-predictions.mjs", writeFlags));
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
 * Runs the NPC current-market capture and derived read-model refresh pipeline.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const commands = buildRefreshCommands(options);

  for (const command of commands) {
    console.log(`[${command.label}] ${command.command} ${command.args.join(" ")}`);
    await runCommand(command);
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    ok: true,
    steps: commands.map((command) => command.label),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
