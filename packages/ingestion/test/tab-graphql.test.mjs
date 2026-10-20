import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTabGraphql } from '../scripts/lib/tab-graphql.mjs';

// Exercise response handling without network calls or retry delays.
function request(responses, extra = {}) {
  let calls = 0;
  const result = fetchTabGraphql({endpoint:'https://example.test/graphql',label:'test'}, 'Markets', 'query Markets { events }', {}, {}, {
    fetchImpl: async () => { const response = responses[Math.min(calls++, responses.length - 1)]; if (response instanceof Error) throw response; return response.clone(); },
    sleep: async () => {}, log: () => {}, ...extra,
  });
  return { result, calls: () => calls };
}

test('empty and truncated responses retry before valid empty markets succeed', async () => {
  const run = request([new Response(''),new Response('{'),Response.json({data:{events:[]}})]);
  assert.deepEqual(await run.result,{data:{events:[]}});
  assert.equal(run.calls(),3);
});

test('persistent empty response fails with diagnostics after three attempts', async () => {
  const run = request([new Response('',{headers:{server:'cloudflare','content-length':'0'}})]);
  await assert.rejects(run.result,/attempt 3\/3: empty response body.*HTTP 200.*server=cloudflare.*body-bytes=0/);
  assert.equal(run.calls(),3);
});

test('schema errors, rejected access and missing data fail without retries', async () => {
  for (const response of [Response.json({errors:[{message:'Unknown field'}]}),new Response('denied',{status:403}),Response.json({})]) {
    const run=request([response]);
    await assert.rejects(run.result);
    assert.equal(run.calls(),1);
  }
});

test('rate limits, service failures and connection resets retry', async () => {
  for (const response of [new Response('',{status:429}),new Response('',{status:503}),new Error('fetch failed',{cause:{code:'ECONNRESET'}})]) {
    const run=request([response,Response.json({data:{events:null}})]);
    assert.deepEqual(await run.result,{data:{events:null}});
    assert.equal(run.calls(),2);
  }
});

test('timeouts abort each attempt and stop after the configured limit', async () => {
  const run=request([], {timeoutMs:5,fetchImpl: (_url, {signal}) => new Promise((_resolve,reject) => signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  await assert.rejects(run.result,/attempt 3\/3: request timed out/);
});
