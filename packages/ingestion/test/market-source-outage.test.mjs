import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchTabGraphql } from '../scripts/lib/tab-graphql.mjs';
import { main as runMarket, classifyMarketRun } from '../scripts/run-market-refresh.mjs';
import { MARKET_LEAGUES } from '../scripts/lib/market-workflows.mjs';
import { marketRunStatus, incidentAction, monitor } from '../../../.github/scripts/monitor-tab-market-source.mjs';

// Exercise genuine transport classification without contacting TAB or waiting between retries.
async function sourceRequest(response, failureFile, extra = {}) {
  return fetchTabGraphql({ endpoint: 'https://api.tab.co.nz/graphql', source: 'tab' }, 'Markets', 'query Markets { events }', {}, {}, {
    fetchImpl: async () => response.clone(), sleep: async () => {}, log: () => {}, failureFile, ...extra,
  });
}

test('exhausted empty responses and access denial record typed evidence, never response bodies', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'market-test-'));
  try {
    for (const response of [new Response(''), new Response('private error body', { status: 403 }), new Response('{'), new Response('', { status: 503 })]) {
      const file = path.join(directory, 'failure.json');
      await assert.rejects(sourceRequest(response, file), { code: 'TAB_SOURCE_UNAVAILABLE' });
      const marker = await readFile(file, 'utf8');
      assert.equal(JSON.parse(marker).code, 'TAB_SOURCE_UNAVAILABLE');
      assert(!marker.includes('private error body'));
      await rm(file);
    }
    for (const response of [Response.json({ errors: [{ message: 'Unknown field' }] }), Response.json({}), new Response('', { status: 401 }), new Response('', { status: 400 })]) {
      const file = path.join(directory, 'failure.json');
      await assert.rejects(sourceRequest(response, file), (error) => error.code !== 'TAB_SOURCE_UNAVAILABLE');
      await assert.rejects(readFile(file), { code: 'ENOENT' });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('valid no-events responses and recovered retries do not create outage evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'market-test-'));
  const file = path.join(directory, 'failure.json');
  let calls = 0;
  try {
    const payload = await sourceRequest(null, file, { fetchImpl: async () => ++calls === 1 ? new Response('') : Response.json({ data: { events: [] } }) });
    assert.deepEqual(payload, { data: { events: [] } });
    assert.equal(calls, 2);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('network exhaustion is classified but unrelated exceptions are not', async () => {
  await assert.rejects(sourceRequest(null, undefined, { fetchImpl: async () => { throw new Error('fetch failed', { cause: { code: 'ECONNRESET' } }); } }), { code: 'TAB_SOURCE_UNAVAILABLE' });
  await assert.rejects(sourceRequest(null, undefined, { fetchImpl: async () => { throw new Error('programming error'); } }), (error) => error.code !== 'TAB_SOURCE_UNAVAILABLE');
});

test('only a nonzero pipeline exit with typed evidence is a source outage', () => {
  assert.equal(classifyMarketRun(0), 'healthy');
  assert.equal(classifyMarketRun(1), 'failed');
  assert.equal(classifyMarketRun(1, { code: 'OTHER' }), 'failed');
  assert.equal(classifyMarketRun(0, { code: 'TAB_SOURCE_UNAVAILABLE' }), 'failed');
  assert.equal(classifyMarketRun(1, { code: 'TAB_SOURCE_UNAVAILABLE' }), 'source-unavailable');
});

test('wrapper defers scheduled source outages only and records evidence for the monitor', async () => {
  const keys = ['GITHUB_EVENT_NAME', 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'RUNNER_TEMP'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const directory = await mkdtemp(path.join(tmpdir(), 'market-wrapper-test-'));
  try {
    process.env.RUNNER_TEMP = directory;
    process.env.GITHUB_OUTPUT = path.join(directory, 'outputs');
    process.env.GITHUB_STEP_SUMMARY = path.join(directory, 'summary');
    const failedSource = async (_league, _args, file) => {
      await writeFile(file, JSON.stringify({ code: 'TAB_SOURCE_UNAVAILABLE' }));
      return 1;
    };
    process.env.GITHUB_EVENT_NAME = 'schedule';
    assert.equal(await runMarket(['npc'], failedSource), 0);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'tab-market-outcome.json'))).status, 'source-unavailable');
    assert.match(await readFile(process.env.GITHUB_STEP_SUMMARY, 'utf8'), /not a no-events result/);
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    assert.equal(await runMarket(['npc'], failedSource), 1);
    process.env.GITHUB_EVENT_NAME = 'schedule';
    assert.equal(await runMarket(['npc'], async () => 2), 2);
    assert.equal(await runMarket(['npc'], async () => 0), 0);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'tab-market-outcome.json'))).status, 'healthy');
    await assert.rejects(runMarket(['invalid'], async () => 0), /Unsupported/);
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    await rm(directory, { recursive: true, force: true });
  }
});

test('monitor requires current-attempt artifacts and successful completion to prove health', () => {
  const run = { conclusion: 'success', run_attempt: 2 };
  assert.equal(marketRunStatus(run, [{ name: 'tab-market-healthy-2' }]), 'healthy');
  assert.equal(marketRunStatus(run, [{ name: 'tab-market-source-unavailable-2' }]), 'source-unavailable');
  for (const artifacts of [[], [{ name: 'tab-market-healthy-1' }], [{ name: 'tab-market-healthy-2', expired: true }]]) assert.equal(marketRunStatus(run, artifacts), 'unknown');
  assert.equal(marketRunStatus({ ...run, conclusion: 'failure' }, [{ name: 'tab-market-healthy-2' }]), 'unknown');
  assert.equal(marketRunStatus(null, []), 'unknown');
});

test('one global incident persists through repeat failures and unknown states', () => {
  const healthy = MARKET_LEAGUES.map((league) => ({ league, status: 'healthy' }));
  const outage = [...healthy.slice(1), { league: 'epl', status: 'source-unavailable' }];
  assert.equal(incidentAction(outage, null), 'open');
  assert.equal(incidentAction(outage, { number: 1 }), 'unchanged');
  assert.equal(incidentAction([...healthy.slice(1), { status: 'unknown' }], { number: 1 }), 'unchanged');
  assert.equal(incidentAction([], { number: 1 }), 'unchanged');
  assert.equal(incidentAction(healthy, { number: 1 }), 'close');
  assert.equal(incidentAction(healthy, null), 'unchanged');
});

test('monitor opens once, stays quiet, then closes after scheduled recovery', async () => {
  let incident;
  let outage = true;
  const writes = [];
  const api = async (route, method = 'GET', body) => {
    if (method !== 'GET') {
      writes.push({ route, method, body });
      if (method === 'POST') incident = { ...body, number: 7, html_url: 'https://github.com/example/repo/issues/7' };
      return incident;
    }
    if (route.startsWith('issues?')) return incident ? [incident] : [];
    if (route.includes('/runs?')) {
      assert.match(route, /event=schedule&branch=main&status=completed/);
      return { workflow_runs: [{ id: 42, run_attempt: 1, conclusion: 'success', html_url: 'https://github.com/example/repo/actions/runs/42' }] };
    }
    return { artifacts: [{ name: `tab-market-${outage ? 'source-unavailable' : 'healthy'}-1` }] };
  };
  assert.equal((await monitor(api, 'main')).action, 'open');
  assert.equal(writes.length, 1);
  assert.equal((await monitor(api, 'main')).action, 'unchanged');
  assert.equal(writes.length, 1);
  outage = false;
  assert.equal((await monitor(api, 'main')).action, 'close');
  assert.equal(writes.length, 2);
  assert.equal(writes[1].body.state, 'closed');
  assert.match(writes[1].body.body, /not backfill/);
});


test('all 14 real capture pipelines stop on source denial and preserve evidence across child processes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'market-child-test-'));
  const preload = path.join(directory, 'source-stub.mjs');
  try {
    await writeFile(preload, `globalThis.fetch = async (url) => {
      if (new URL(url).hostname !== 'api.tab.co.nz') throw new Error('Unexpected downstream request');
      return new Response('denied', { status: 403 });
    };`);
    for (const league of MARKET_LEAGUES) {
      const output = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/run-market-refresh.mjs', import.meta.url)), league, '--dry-run'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
        env: { ...process.env, NODE_OPTIONS: `--import="${pathToFileURL(preload).href}"`, GITHUB_EVENT_NAME: 'schedule', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' },
      });
      assert.match(output, /"status":"source-unavailable"/, league);
      assert.doesNotMatch(output, /Unexpected downstream request|\n\[(reconcile|rebuild|generate|refresh_football)/, league);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
