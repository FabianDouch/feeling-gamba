import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTabGraphql } from '../scripts/lib/tab-graphql.mjs';
import { fetchTabSportsMarkets, marketsFromGroups, TAB_SPORTS_OPERATIONS } from '../scripts/lib/tab-sports-markets.mjs';

const source = { source: 'tab', endpoint: 'https://api.tab.co.nz/graphql' };
const event = { id: 'SportingEvent:1', name: 'A vs B', competition: { name: 'ATP Test', url: '/sports/tennis/atp-test' }, markets: { nodes: [] } };
const variables = { category: 'SOCCER', competitionSlug: 'premier-league', upcomingEventsCount: 20, marketsFirst: 500, entrantsFirst: 80 };

// Representative public price-button fields; only these observed source values become captured prices.
function button(id, extra = {}) {
  return { market: { id: 'SportingMarket:1', name: 'Anytime Goalscorer', status: 'OPEN', productType: { name: 'Fixed Win' }, ...extra },
    entrant: { id, name: id, isSuspended: false }, price: { odds: { numerator: 3, denominator: 2 } } };
}

test('persisted requests encode GET variables and published hash without sending a query body', async () => {
  await fetchTabGraphql(source, 'SportingEvents', '', { category: 'TENNIS' }, {}, {
    persistedHash: TAB_SPORTS_OPERATIONS.SportingEvents,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined);
      assert.deepEqual(JSON.parse(parsed.searchParams.get('variables')), { category: 'TENNIS' });
      assert.equal(JSON.parse(parsed.searchParams.get('extensions')).persistedQuery.sha256Hash, TAB_SPORTS_OPERATIONS.SportingEvents);
      return Response.json({ data: { sportingEvents: { events: { nodes: [] } } } });
    },
  });
});

test('competition discovery uses public router/client identity and preserves primary source prices', async () => {
  const row = { ...event, markets: { nodes: [{ name: 'Match Result', entrantCount: 3 }] } };
  const result = await fetchTabSportsMarkets(source, 'ignored', 'ignored', variables, { authorization: 'must not forward', cookie: 'must not forward' }, {
    request: async (actualSource, operation, query, args, headers, options) => {
      assert.equal(actualSource.endpoint, 'https://api.tab.co.nz/gql/router');
      assert.equal(operation, 'SportingCompetitionScreen');
      assert.equal(query, '');
      assert.equal(args.includeUpcomingEvents, true);
      assert.equal(args.upcomingEventsCount, 20);
      assert.equal(headers['graphql-client-name'], 'sportsbook');
      assert.equal(headers.authorization, undefined);
      assert.equal(headers.cookie, undefined);
      assert.equal(options.persistedHash, TAB_SPORTS_OPERATIONS[operation]);
      return { data: { league: { name: 'Premier League' }, upcomingEvents: { events: { nodes: [row] } } } };
    },
  });
  assert.deepEqual(result.data.upcomingEvents.events.nodes[0].markets, row.markets);
});

test('only the explicit no-open-competition shape succeeds; missing connections fail', async () => {
  const read = (data) => fetchTabSportsMarkets(source, '', '', variables, {}, { request: async () => ({ data }) });
  assert.deepEqual((await read({ league: null, upcomingEvents: null })).data.upcomingEvents.events.nodes, []);
  for (const data of [{}, { league: null }, { upcomingEvents: {} }, { league: { name: 'EPL' }, upcomingEvents: null }]) {
    await assert.rejects(read(data), /missing event nodes/);
  }
});

test('tennis uses public events list and derives tournament slug from the source URL', async () => {
  const result = await fetchTabSportsMarkets(source, '', '', { category: 'TENNIS', upcomingEventsCount: 200 }, {}, {
    request: async (_source, operation, _query, args) => {
      assert.equal(operation, 'SportingEvents');
      assert.equal(args.first, 200);
      assert.equal(args.detailedView, true);
      return { data: { sportingEvents: { events: { nodes: [event] } } } };
    },
  });
  assert.equal(result.data.upcomingEvents.events.nodes[0].competition.slug, 'atp-test');
});

test('scorer capture loads lazy groups before returning and deduplicates source entrants', async () => {
  const calls = [];
  const request = async (_source, operation) => {
    calls.push(operation);
    if (operation === 'SportingCompetitionScreen') return { data: { upcomingEvents: { events: { nodes: [event] } } } };
    if (operation === 'SportingEventScreenV2') return { data: { sportingEventScreen: { event, marketTypeGroupsContainers: [
      { id: 'top', marketTypeGroups: [{ buttons: [button('a')] }] }, { id: 'players', marketTypeGroups: null },
    ] } } };
    return { data: { marketGroups: [{ buttons: [button('a'), button('b')] }] } };
  };
  const result = await fetchTabSportsMarkets(source, '', '', variables, {}, { marketScope: 'all', request });
  const markets = result.data.upcomingEvents.events.nodes[0].markets.nodes;
  assert.equal(markets.length, 1);
  assert.equal(markets[0].entrantCount, 2);
  assert.deepEqual(markets[0].entrants.nodes[0].price.odds, { numerator: 3, denominator: 2 });
  assert.deepEqual(calls, ['SportingCompetitionScreen', 'SportingEventScreenV2', 'SportingMarketGroupContainer']);
  const complete = await fetchTabSportsMarkets(source, '', '', { ...variables, entrantsFirst: 1 }, {}, { marketScope: 'all', request });
  assert.equal(complete.data.upcomingEvents.events.nodes[0].markets.nodes[0].entrantCount, 2);
});

test('missing lazy data or a retired persisted query fails rather than silently losing markets', async () => {
  await assert.rejects(fetchTabSportsMarkets(source, '', '', variables, {}, { marketScope: 'all', request: async (_source, operation) => {
    if (operation === 'SportingCompetitionScreen') return { data: { upcomingEvents: { events: { nodes: [event] } } } };
    if (operation === 'SportingEventScreenV2') return { data: { sportingEventScreen: { event, marketTypeGroupsContainers: [{ id: 'players', marketTypeGroups: null }] } } };
    return { data: {} };
  } }), /market group contract mismatch/);
  await assert.rejects(fetchTabGraphql(source, 'SportingEvents', '', {}, {}, {
    persistedHash: TAB_SPORTS_OPERATIONS.SportingEvents,
    fetchImpl: async () => Response.json({ errors: [{ message: 'PersistedQueryNotFound' }] }),
  }), /PersistedQueryNotFound/);
});

test('boosted/closed markets are excluded, suspended entrants remain marked and conflicting prices fail', () => {
  assert.deepEqual(marketsFromGroups([button('x', { productType: { name: 'Boost' } }), button('x', { status: 'CLOSED' })]), []);
  const suspended = { ...button('x'), isSuspended: true };
  assert.equal(marketsFromGroups([suspended])[0].entrants.nodes[0].isSuspended, true);
  assert.throws(() => marketsFromGroups([button('x'), { ...button('x'), price: { odds: { numerator: 5, denominator: 1 } } }]), /Conflicting/);
});
