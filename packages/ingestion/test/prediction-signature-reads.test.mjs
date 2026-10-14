import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchExistingPredictionSignatures } from '../../../supabase/functions/_shared/current-promotions-core.mjs';

test('signature reads deduplicate model race IDs, bound URLs and retain paged signatures', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (target) => {
    const url = new URL(target);
    calls.push(url);
    assert(url.toString().length < 5000);
    assert.equal(url.searchParams.get('order'), 'id.asc');
    const ids = JSON.parse(`[${url.searchParams.get('source_race_card_id').slice(4, -1)}]`);
    assert(ids.length <= 40);
    assert.equal(new Set(ids).size, ids.length);
    const page = calls.length === 1 ? Array.from({ length: 1000 }, (_, i) => ({
      prediction_model: `model-${i}`, source: 'betcha', source_race_card_id: ids[0], prediction_signature: `sig-${i}`,
    })) : [{ prediction_model: 'last', source: 'betcha', source_race_card_id: ids[0], prediction_signature: 'kept' }];
    return Response.json(page);
  });
  const rows = Array.from({ length: 12 }, () => Array.from({ length: 81 }, (_, i) => ({
    source: 'betcha', source_race_card_id: `RacingRaceCard:00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  }))).flat();
  const result = await fetchExistingPredictionSignatures({ rows, supabaseKey: 'test', supabaseUrl: 'https://example.supabase.co' });
  assert.equal(calls.length, 4);
  assert.equal(calls[1].searchParams.get('offset'), '1000');
  assert.equal(result.size, 1003);
});

test('signature read errors stop the write preparation rather than treating history as absent', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(fetchExistingPredictionSignatures({ rows: [{ source: 'betcha', source_race_card_id: 'race' }],
    supabaseKey: 'test', supabaseUrl: 'https://example.supabase.co' }), /HTTP 503/);
});
