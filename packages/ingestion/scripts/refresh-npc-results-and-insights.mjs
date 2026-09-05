import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;

/**
 * Parses the scheduled NPC post-match settlement options.
 */
function parseArgs(argv) {
  const now = new Date();
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    includeFixtures: true,
    optaSeason: null,
    requireSupabase: false,
    season: now.getUTCFullYear(),
    skipInsights: false,
    skipPredictions: false,
    skipReconcile: false,
    skipSameGameMultis: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-include-fixtures") {
      options.includeFixtures = false;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg === "--skip-insights") {
      options.skipInsights = true;
    } else if (arg === "--skip-predictions") {
      options.skipPredictions = true;
    } else if (arg === "--skip-reconcile") {
      options.skipReconcile = true;
    } else if (arg === "--skip-same-game-multis") {
      options.skipSameGameMultis = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--opta-season=")) {
      options.optaSeason = Number(arg.slice("--opta-season=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    }
  }

  if (!isPositiveInteger(options.batchSize)) {
    throw new Error("--batch-size must be a positive integer.");
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("--season must be a four-digit year.");
  }

  if (options.optaSeason !== null && !isPositiveInteger(options.optaSeason)) {
    throw new Error("--opta-season must be a positive integer.");
  }

  return options;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
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
 * Builds child refresh commands for official NPC settlement and read models.
 */
function buildRefreshCommands(options) {
  const commands = [];
  const writeFlags = getWriteFlags(options);
  const resultFlags = [
    `--season=${options.season}`,
    ...writeFlags,
  ];

  if (options.includeFixtures) {
    resultFlags.push("--include-fixtures");
  }

  if (options.optaSeason !== null) {
    resultFlags.push(`--opta-season=${options.optaSeason}`);
  }

  commands.push(buildCommand("refresh_official_npc_results", "refresh-npc-results-from-official.mjs", resultFlags));

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
 * Runs official NPC settlement and app-facing derived read-model rebuilds.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const commands = buildRefreshCommands(options);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    includeFixtures: options.includeFixtures,
    season: options.season,
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
    season: options.season,
    stepsCompleted: commands.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
