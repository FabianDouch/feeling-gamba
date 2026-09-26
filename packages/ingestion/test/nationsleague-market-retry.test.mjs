import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseRestClient } from '../scripts/refresh-nationsleague-market-snapshots-from-tab.mjs';
const config = {url:'https://example.invalid',key:'test-secret'};

// Exercise the real capture client while replacing transport and retry delays.
function client(fetchImpl, logs=[]) {
  return createSupabaseRestClient(config, 300, {fetchImpl, sleep:async()=>{}, log:line=>logs.push(line)});
}

// Model the same nested ECONNRESET error emitted by Node fetch in Actions.
function reset() {
  return new TypeError('fetch failed', {cause:Object.assign(new Error('read ECONNRESET'), {code:'ECONNRESET'})});
}

test('Supabase lookup retries a connection reset and returns parsed matches', async()=>{
  let attempts=0;const logs=[];
  const result=await client(async()=>{
    if(++attempts===1)throw reset();
    return new Response('[{"id":"match"}]');
  }, logs).request('nationsleague_matches');
  assert.deepEqual(result,[{id:'match'}]); assert.equal(attempts,2);
  assert.match(logs[0],/Supabase nationsleague_matches GET.*ECONNRESET/);
  assert(!logs.join('').includes(config.key));
});

test('upsert retry replays the same conflict-key batch after a response-body reset', async()=>{
  const calls=[];
  await client(async(url,init)=>{
    calls.push({url:String(url),body:init.body,method:init.method,prefer:init.headers.prefer});
    if(calls.length===1)return {ok:true,text:async()=>{throw reset();}};
    return new Response('',{status:200});
  }).upsert('nationsleague_market_snapshots',[{source_snapshot_key:'tab:one'}],'source_snapshot_key');
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.match(calls[0].url,/on_conflict=source_snapshot_key/);
  assert.equal(calls[0].prefer,'resolution=merge-duplicates,return=minimal');
});

test('transient HTTP errors retry, but authentication and schema failures stop immediately', async()=>{
  for(const status of [429,503,401,403,400]){
    let calls=0;
    const api=client(async()=>{calls++;return new Response(status===400?'PGRST205 nationsleague_matches':'Unavailable',{status});});
    await assert.rejects(()=>api.request('nationsleague_matches'),new RegExp(`Supabase nationsleague_matches GET.*HTTP ${status}`));
    assert.equal(calls,[429,503].includes(status)?3:1);
  }
});

test('exhausted resets report the failing operation and stop after three attempts',async()=>{
  let calls=0;
  await assert.rejects(()=>client(async()=>{calls++;throw reset();}).request('nationsleague_matches'),/Supabase nationsleague_matches GET failed on attempt 3\/3: ECONNRESET/);
  assert.equal(calls,3);
});

test('a stalled response is aborted and retried with a fresh signal',async()=>{
  const signals=[];
  const api=createSupabaseRestClient(config,300,{timeoutMs:5,sleep:async()=>{},log:()=>{},fetchImpl:async(_url,{signal})=>{
    signals.push(signal);
    if(signals.length===2)return new Response('[]');
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
  }});
  assert.deepEqual(await api.request('nationsleague_matches'),[]);
  assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
});
