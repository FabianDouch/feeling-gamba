import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_EVENT_COUNT = 200;
const DEFAULT_MARKETS_FIRST = 80;
const DEFAULT_RESULTS_DAYS_FROM = 3;

/**
 * Parses the Tennis current-market refresh orchestration options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: null,
    dryRun: false,
    eventCount: DEFAULT_EVENT_COUNT,
    marketsFirst: DEFAULT_MARKETS_FIRST,
    requireSupabase: false,
    resultsDaysFrom: DEFAULT_RESULTS_DAYS_FROM,
    skipFixedWin: false,
    skipInsights: false,
    skipReconcile: false,
    skipResults: false,
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
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg === "--skip-results") {
      options.skipResults = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--event-count=")) {
      options.eventCount = Number(arg.slice("--event-count=".length));
    } else if (arg.startsWith("--markets-first=")) {
      options.marketsFirst = Number(arg.slice("--markets-first=".length));
    } else if (arg.startsWith("--results-days-from=")) {
      options.resultsDaysFrom = Number(arg.slice("--results-days-from=".length));
    }
  }

  for (const [name, value] of [
    ["--event-count", options.eventCount],
    ["--markets-first", options.marketsFirst],
    ["--results-days-from", options.resultsDaysFrom],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (options.batchSize !== null && (!Number.isInteger(options.batchSize) || options.batchSize < 1)) {
    throw new Error("--batch-size must be a positive integer.");
  }

  return options;
}

function buildCommand(label, scriptName, args) {
  return {
    args: [path.join(SCRIPT_DIR, scriptName), ...args],
    command: process.execPath,
    label,
  };
}

/**
 * Builds the shared Supabase/write flags used by the child Tennis workers.
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
 * Builds the ordered Tennis current-market capture and read-model refresh commands.
 */
function buildRefreshCommands(options) {
  const commands = [];
  const writeFlags = getWriteFlags(options);

  if (!options.skipFixedWin) {
    commands.push(buildCommand("capture_tennis_fixed_win_markets", "refresh-tennis-market-snapshots-from-tab.mjs", [
      `--event-count=${options.eventCount}`,
      `--markets-first=${options.marketsFirst}`,
      ...writeFlags,
    ]));
  }

  if (!options.skipResults) {
    commands.push(buildCommand("refresh_tennis_results", "refresh-tennis-results-from-odds-api.mjs", [
      `--days-from=${options.resultsDaysFrom}`,
      ...writeFlags,
    ]));
  }

  if (!options.skipReconcile) {
    commands.push(buildCommand("reconcile_tennis_fixed_win", "reconcile-tennis-fixed-win-snapshots.mjs", writeFlags));
  }

  if (!options.skipInsights) {
    commands.push(buildCommand("rebuild_tennis_insights", "rebuild-tennis-insight-aggregates.mjs", writeFlags));
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
 * Runs Tennis fixed-win market capture and app-facing aggregate refresh.
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
