import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_DAYS_FROM = 3;

/**
 * Parses the scheduled Tennis post-match settlement options.
 */
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    daysFrom: DEFAULT_DAYS_FROM,
    dryRun: false,
    requireSupabase: false,
    skipInsights: false,
    skipReconcile: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-insights") {
      options.skipInsights = true;
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--days-from=")) {
      options.daysFrom = Number(arg.slice("--days-from=".length));
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (!Number.isInteger(options.daysFrom) || options.daysFrom < 1) {
    throw new Error("--days-from must be a positive integer.");
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
  const flags = [
    `--batch-size=${options.batchSize}`,
  ];

  if (options.dryRun) {
    flags.push("--dry-run");
  }

  if (options.requireSupabase) {
    flags.push("--require-supabase");
  }

  return flags;
}

/**
 * Builds child refresh commands for Tennis settlement and read-model rebuilds.
 */
function buildRefreshCommands(options) {
  const commands = [
    buildCommand("refresh_tennis_results", "refresh-tennis-results-from-odds-api.mjs", [
      `--days-from=${options.daysFrom}`,
      ...getWriteFlags(options),
    ]),
  ];
  const writeFlags = getWriteFlags(options);

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
 * Runs Tennis result settlement and app-facing aggregate refresh.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const commands = buildRefreshCommands(options);

  for (const command of commands) {
    console.log(`[${command.label}] ${command.command} ${command.args.join(" ")}`);
    await runCommand(command);
  }

  console.log(JSON.stringify({
    daysFrom: options.daysFrom,
    dryRun: options.dryRun,
    ok: true,
    steps: commands.map((command) => command.label),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
