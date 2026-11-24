import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_LEAGUES } from './lib/market-workflows.mjs';

// Keep operational failures distinct from a recorded TAB transport/access outage.
export function classifyMarketRun(exitCode, marker) {
  if (exitCode === 0 && !marker) return 'healthy';
  if (exitCode !== 0 && marker?.code === 'TAB_SOURCE_UNAVAILABLE') return 'source-unavailable';
  return 'failed';
}

// Run the existing fail-fast pipeline without allowing subsequent steps after a source outage.
async function runPipeline(league, args, markerPath) {
  const script = fileURLToPath(new URL(`./refresh-${league}-current-markets.mjs`, import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'inherit', env: { ...process.env, TAB_SOURCE_FAILURE_FILE: markerPath },
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

// Scheduled source outages are deferred with evidence; manual and unrelated failures stay red.
export async function main([league, ...args], run = runPipeline) {
  if (!MARKET_LEAGUES.includes(league)) throw new Error('Unsupported market league');
  const directory = await mkdtemp(path.join(tmpdir(), 'tab-market-'));
  try {
    const markerPath = path.join(directory, 'source-failure.json');
    const exitCode = await run(league, args, markerPath);
    let marker;
    try { marker = JSON.parse(await readFile(markerPath, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const status = classifyMarketRun(exitCode, marker);
    const outcome = { league, status, observedAt: new Date().toISOString(), exitCode, sourceFailure: marker ?? null };
    if (process.env.GITHUB_OUTPUT) {
      const outcomePath = path.join(process.env.RUNNER_TEMP, 'tab-market-outcome.json');
      await writeFile(outcomePath, JSON.stringify(outcome, null, 2));
      await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\noutcome-path=${outcomePath}\n`);
    }
    const message = status === 'source-unavailable'
      ? 'TAB source unavailable. Capture stopped; downstream steps were not continued. This is not a no-events result. See the TAB Market Source Monitor incident.'
      : status === 'healthy' ? 'Market refresh completed (a valid empty event list is allowed).'
        : 'Market refresh failed; this is not a classified TAB source outage.';
    console.log(JSON.stringify(outcome));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## ${league}: ${status}\n\n${message}\n`);
    if (status === 'source-unavailable') console.warn(`::warning title=TAB source unavailable::${message}`);
    return status === 'source-unavailable' && process.env.GITHUB_EVENT_NAME === 'schedule' ? 0 : exitCode || (status === 'failed' ? 1 : 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
