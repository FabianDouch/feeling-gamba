import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_TIME_ZONE = "Pacific/Auckland";
const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_COLLECTION_START = "2025-12-15";
const COVERAGE_MODE_ALL_DOMESTIC = "all_domestic";
const COVERAGE_MODE_PILOT = "pilot";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");

/**
 * Parses the weekly refresh options and chooses a safe default completed-date window.
 */
function parseArgs(argv) {
  const options = {
    batchSize: null,
    collectionStart: DEFAULT_COLLECTION_START,
    coverageMode: COVERAGE_MODE_ALL_DOMESTIC,
    dryRun: false,
    from: null,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    requireSupabase: false,
    skipBackfill: false,
    skipFetch: false,
    skipInsights: false,
    skipPredictions: false,
    to: null,
    tracks: null,
  };

  for (const arg of argv) {
    if (arg === "--all-domestic" || arg === "--coverage=all-domestic" || arg === "--coverage=all_domestic") {
      options.coverageMode = COVERAGE_MODE_ALL_DOMESTIC;
    } else if (arg === "--pilot-tracks" || arg === "--coverage=pilot") {
      options.coverageMode = COVERAGE_MODE_PILOT;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-fetch") {
      options.skipFetch = true;
    } else if (arg === "--skip-backfill") {
      options.skipBackfill = true;
    } else if (arg === "--skip-insights") {
      options.skipInsights = true;
    } else if (arg === "--skip-predictions") {
      options.skipPredictions = true;
    } else if (arg.startsWith("--from=")) {
      options.from = arg.slice("--from=".length);
    } else if (arg.startsWith("--to=")) {
      options.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--lookback-days=")) {
      options.lookbackDays = Number(arg.slice("--lookback-days=".length));
    } else if (arg.startsWith("--collection-start=")) {
      options.collectionStart = arg.slice("--collection-start=".length);
    } else if (arg.startsWith("--tracks=") || arg.startsWith("--courses=")) {
      options.tracks = arg.slice(arg.indexOf("=") + 1);
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

  if (!isValidDate(options.collectionStart)) {
    throw new Error("Pass --collection-start as YYYY-MM-DD.");
  }

  if (!Number.isInteger(options.lookbackDays) || options.lookbackDays < 1) {
    throw new Error("--lookback-days must be a positive integer.");
  }

  if (options.batchSize !== null && (!Number.isInteger(options.batchSize) || options.batchSize < 1)) {
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

/**
 * Reads the current Auckland date so weekly windows do not drift on UTC.
 */
function getTodayInSourceTimeZone() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SOURCE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

/**
 * Defaults to the latest completed Auckland dates, leaving today to settle first.
 */
function getRefreshWindow(options) {
  if (options.from && options.to) {
    return {
      from: options.from,
      to: options.to,
    };
  }

  const yesterday = addDays(getTodayInSourceTimeZone(), -1);

  return {
    from: addDays(yesterday, -(options.lookbackDays - 1)),
    to: yesterday,
  };
}

function buildCommand(label, args) {
  return {
    args,
    command: process.execPath,
    label,
  };
}

/**
 * Creates the ordered fetch, upsert, and aggregate rebuild commands for a refresh run.
 */
function buildRefreshCommands(options, window) {
  const commands = [];
  const sharedBackfillFlags = [];

  if (options.requireSupabase) {
    sharedBackfillFlags.push("--require-supabase");
  }

  if (options.batchSize !== null) {
    sharedBackfillFlags.push(`--batch-size=${options.batchSize}`);
  }

  const sharedCoverageFlags = options.coverageMode === COVERAGE_MODE_ALL_DOMESTIC
    ? ["--all-domestic"]
    : [];

  if (!options.skipFetch) {
    commands.push(buildCommand("fetch_source_race_days", [
      path.join(SCRIPT_DIR, "fetch-pilot-date.mjs"),
      `--from=${window.from}`,
      `--to=${window.to}`,
      ...sharedCoverageFlags,
      ...(options.tracks ? [`--tracks=${options.tracks}`] : []),
    ]));
  }

  if (!options.skipBackfill) {
    commands.push(buildCommand("upsert_weekly_race_days", [
      path.join(SCRIPT_DIR, "backfill-race-fixtures-to-supabase.mjs"),
      `--from=${window.from}`,
      `--to=${window.to}`,
      ...sharedCoverageFlags,
      ...sharedBackfillFlags,
    ]));
  }

  if (!options.skipInsights) {
    commands.push(buildCommand("rebuild_all_insight_aggregates", [
      path.join(SCRIPT_DIR, "backfill-race-fixtures-to-supabase.mjs"),
      `--from=${options.collectionStart}`,
      `--to=${window.to}`,
      "--insights-only",
      ...sharedCoverageFlags,
      ...sharedBackfillFlags,
    ]));
  }

  if (!options.skipPredictions) {
    commands.push(buildCommand("reconcile_prediction_outcomes", [
      path.join(SCRIPT_DIR, "reconcile-prediction-outcomes.mjs"),
      ...sharedBackfillFlags,
    ]));
  }

  return commands;
}

/**
 * Runs one child command while streaming output so operator logs remain useful.
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
 * Executes the weekly source fetch, Supabase upsert, and all-time insight rebuild flow.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const window = getRefreshWindow(options);

  if (new Date(`${window.from}T00:00:00.000Z`) > new Date(`${window.to}T00:00:00.000Z`)) {
    throw new Error("--from must be before or equal to --to.");
  }

  const commands = buildRefreshCommands(options, window);
  const summary = {
    collectionStart: options.collectionStart,
    coverageMode: options.coverageMode,
    dryRun: options.dryRun,
    lookbackDays: options.lookbackDays,
    sourceTimeZone: SOURCE_TIME_ZONE,
    steps: commands.map((command) => ({
      args: command.args,
      command: command.command,
      label: command.label,
    })),
    window,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (options.dryRun) {
    return;
  }

  for (const command of commands) {
    await runCommand(command);
  }

  console.log(JSON.stringify({
    ok: true,
    window,
    insightsRebuiltThrough: options.skipInsights ? null : window.to,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
