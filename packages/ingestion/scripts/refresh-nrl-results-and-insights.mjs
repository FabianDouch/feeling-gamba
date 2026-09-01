import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOT_ENV_FILES = [".env.local", ".env"];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_LOOKBACK_DAYS = 10;
const DEFAULT_MAX_ROUND = 35;
const OFFICIAL_NRL_DRAW_URL = "https://www.nrl.com/draw/data";
const OFFICIAL_NRL_ORIGIN = "https://www.nrl.com";

/**
 * Parses the scheduled NRL post-match settlement options.
 */
function parseArgs(argv) {
  const now = new Date();
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    maxRound: DEFAULT_MAX_ROUND,
    requireSupabase: false,
    season: now.getUTCFullYear(),
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-supabase") {
      options.requireSupabase = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--lookback-days=")) {
      options.lookbackDays = Number(arg.slice("--lookback-days=".length));
    } else if (arg.startsWith("--max-round=")) {
      options.maxRound = Number(arg.slice("--max-round=".length));
    } else if (arg.startsWith("--season=")) {
      options.season = Number(arg.slice("--season=".length));
    }
  }

  for (const [name, value] of [
    ["--batch-size", options.batchSize],
    ["--lookback-days", options.lookbackDays],
    ["--max-round", options.maxRound],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }

  if (!Number.isInteger(options.season) || options.season < 2000) {
    throw new Error("--season must be a four-digit year.");
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

function getNrlHeaders(referer) {
  return {
    accept: "application/json,text/plain,*/*",
    referer: referer ?? `${OFFICIAL_NRL_ORIGIN}/draw/`,
    "user-agent": "Mozilla/5.0 (compatible; FeelingGambaBot/0.1; +https://www.nrl.com)",
  };
}

/**
 * Fetches one official NRL draw round for scheduled result discovery.
 */
async function fetchDrawRound(season, round) {
  const url = new URL(OFFICIAL_NRL_DRAW_URL);
  url.searchParams.set("competition", "111");
  url.searchParams.set("round", String(round));
  url.searchParams.set("season", String(season));

  const response = await fetch(url, {
    headers: getNrlHeaders(`${OFFICIAL_NRL_ORIGIN}/draw/?competition=111&round=${round}&season=${season}`),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Official NRL draw round ${round} failed with HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  return await response.json();
}

/**
 * Reads fixture kickoff fields across the official draw payload variants.
 */
function getFixtureKickoff(fixture) {
  return fixture?.clock?.kickOffTimeLong
    ?? fixture?.kickOffTimeLong
    ?? fixture?.startTime
    ?? fixture?.matchStartTime
    ?? null;
}

function isCompletedFixture(fixture) {
  return fixture?.matchState === "FullTime" || fixture?.matchMode === "Post";
}

function isWithinLookback(isoString, cutoff, now) {
  const date = new Date(isoString);

  if (Number.isNaN(date.valueOf())) {
    return false;
  }

  return date.valueOf() >= cutoff.valueOf() && date.valueOf() <= now.valueOf();
}

/**
 * Finds official rounds with completed fixtures inside the recent settlement window.
 */
async function discoverRecentCompletedRounds(options) {
  const now = new Date();
  const cutoff = new Date(now.valueOf() - options.lookbackDays * 24 * 60 * 60 * 1000);
  const rounds = [];
  const scannedRounds = [];

  for (let round = 1; round <= options.maxRound; round += 1) {
    const payload = await fetchDrawRound(options.season, round);
    const fixtures = payload.fixtures ?? [];
    const completedInWindow = fixtures.filter((fixture) =>
      isCompletedFixture(fixture) && isWithinLookback(getFixtureKickoff(fixture), cutoff, now));

    scannedRounds.push({
      completedInWindow: completedInWindow.length,
      fixtureCount: fixtures.length,
      round,
    });

    if (completedInWindow.length > 0) {
      rounds.push(round);
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    now: now.toISOString(),
    rounds,
    scannedRounds,
  };
}

function buildCommand(label, scriptName, args) {
  return {
    args: [path.join(SCRIPT_DIR, scriptName), ...args],
    command: process.execPath,
    label,
  };
}

/**
 * Builds child refresh commands after recent completed NRL rounds are known.
 */
function buildRefreshCommands(options, rounds) {
  const writeFlags = [
    `--batch-size=${options.batchSize}`,
  ];

  if (options.dryRun) {
    writeFlags.push("--dry-run");
  }

  if (options.requireSupabase) {
    writeFlags.push("--require-supabase");
  }

  const minRound = Math.min(...rounds);
  const maxRound = Math.max(...rounds);

  return [
    buildCommand("refresh_official_nrl_results", "refresh-nrl-results-from-official.mjs", [
      `--season=${options.season}`,
      `--from-round=${minRound}`,
      `--to-round=${maxRound}`,
      ...writeFlags,
    ]),
    buildCommand("reconcile_nrl_fixed_win", "reconcile-nrl-fixed-win-snapshots.mjs", writeFlags),
    buildCommand("rebuild_nrl_same_game_multis", "rebuild-nrl-same-game-multis.mjs", writeFlags),
    buildCommand("rebuild_nrl_insights", "rebuild-nrl-insight-aggregates.mjs", writeFlags),
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
 * Runs recent NRL settlement and all app-facing derived read-model rebuilds.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadDotEnvFiles();

  const discovery = await discoverRecentCompletedRounds(options);

  if (!discovery.rounds.length) {
    console.log(JSON.stringify({
      ok: true,
      reason: "No completed NRL fixtures found in the lookback window.",
      settlementWindow: {
        cutoff: discovery.cutoff,
        now: discovery.now,
      },
      skipped: true,
    }, null, 2));
    return;
  }

  const commands = buildRefreshCommands(options, discovery.rounds);

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    recentCompletedRounds: discovery.rounds,
    settlementWindow: {
      cutoff: discovery.cutoff,
      now: discovery.now,
    },
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
    recentCompletedRounds: discovery.rounds,
    stepsCompleted: commands.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
