import { fetchTabGraphql } from './tab-graphql.mjs';

// Public sportsbook operations from vendor-graphql-ops-web-DFzR5PHG.js, verified 2026-11-24.
// Pin explicit source contracts; unknown/retired hashes fail rather than silently returning no markets.
export const TAB_SPORTS_OPERATIONS = {
  SportingCompetitionScreen: '2fd0c21755f04cc22957f8549a2906a06d972d708107be7392e715257f8090e2',
  SportingEvents: 'dc1a46de286e4a2b5cddfc25a250ae76f1a5b4eb8e28d293ecd3d88bfd294d42',
  SportingEventScreenV2: '05ce22ced74b99d80e74701220169bce80395456a24867db8ed0d98c5e31cee7',
  SportingMarketGroupContainer: '84cb884939a88d2508aae3e33a006870236a34fca74d22a5a6b59a2b04fe9c85',
};

// Extract only source-backed standard fixed-win price buttons, deduplicated across UI groups.
export function marketsFromGroups(groups) {
  const markets = new Map();
  // Groups contain nested match cards; alternate/boosted product prices must never replace Fixed Win.
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    const { market, entrant, price } = value;
    if (market?.id && entrant?.id && price?.odds && market.productType?.name === 'Fixed Win'
      && market.status === 'OPEN' && !market.isSuspended) {
      let row = markets.get(market.id);
      if (!row) {
        row = { ...market, entrants: new Map() };
        markets.set(market.id, row);
      }
      const next = { ...entrant, isSuspended: Boolean(entrant.isSuspended || value.isSuspended), price };
      const previous = row.entrants.get(entrant.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(next)) throw new Error('Conflicting TAB entrant prices across market groups');
      row.entrants.set(entrant.id, next);
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(groups);
  return [...markets.values()].map(({ entrants, ...market }) => ({
    ...market, entrantCount: entrants.size, entrants: { nodes: [...entrants.values()] },
  }));
}

// Treat missing connection fields as contract failures, not inactive competitions.
function eventNodes(payload, field) {
  // TAB explicitly returns league:null/upcomingEvents:null when no open competition exists.
  if (field === 'upcomingEvents' && payload.data?.league === null && payload.data?.[field] === null) return [];
  const nodes = payload.data?.[field]?.events?.nodes;
  if (!Array.isArray(nodes)) throw new Error(`TAB ${field} is missing event nodes`);
  return nodes;
}

// Use TAB's published persisted GET operations and adapt their public fields to existing capture rows.
export async function fetchTabSportsMarkets(source, _operationName, _query, variables, headers, {
  marketScope = 'primary', request = fetchTabGraphql,
} = {}) {
  // Public client identification is required; no user session, cookies or authentication are sent.
  const publicHeaders = {
    accept: 'application/json', origin: 'https://www.tab.co.nz', referer: 'https://www.tab.co.nz/',
    'graphql-client-name': 'sportsbook',
  };
  const router = { ...source, endpoint: 'https://api.tab.co.nz/gql/router' };
  // Reuse bounded retries and outage evidence for every list/detail request.
  const read = (operation, args) => request(router, operation, '', args, publicHeaders, { persistedHash: TAB_SPORTS_OPERATIONS[operation] });
  const competition = Boolean(variables.competitionSlug);
  const payload = await read(competition ? 'SportingCompetitionScreen' : 'SportingEvents', competition ? {
    category: variables.category, competitionSlug: variables.competitionSlug,
    includeUpcomingEvents: true, upcomingEventsCount: variables.upcomingEventsCount,
    upcomingEventsGroupBy: 'UNSPECIFIED', statuses: ['OPEN'],
  } : {
    category: variables.category, first: variables.upcomingEventsCount,
    statuses: ['OPEN'], eventTypes: ['MATCH'], detailedView: true, groupByLeague: false,
  });
  const events = eventNodes(payload, competition ? 'upcomingEvents' : 'sportingEvents');
  const normalized = [];
  for (const event of events) {
    if (!event?.id || !event.markets || !Array.isArray(event.markets.nodes)) throw new Error('TAB event is missing identity or primary markets');
    let markets = event.markets.nodes;
    if (marketScope === 'all') {
      const details = await read('SportingEventScreenV2', { eventId: event.id });
      const screen = details.data?.sportingEventScreen;
      if (screen?.event?.id !== event.id || !Array.isArray(screen.marketTypeGroupsContainers)) throw new Error('TAB event detail contract mismatch');
      const groups = [];
      for (const container of screen.marketTypeGroupsContainers) {
        if (Array.isArray(container.marketTypeGroups)) groups.push(...container.marketTypeGroups);
        else {
          if (!container.id) throw new Error('TAB lazy market group is missing its id');
          const detail = await read('SportingMarketGroupContainer', { eventId: event.id, marketGroupContainerId: container.id });
          if (!Array.isArray(detail.data?.marketGroups)) throw new Error('TAB market group contract mismatch');
          groups.push(...detail.data.marketGroups);
        }
      }
      markets = marketsFromGroups(groups);
      // Published group queries have no market/entrant limits: retain complete observed groups.
    }
    const url = event.competition?.url;
    normalized.push({ ...event,
      competition: event.competition ? { ...event.competition, slug: url ? url.split('/').filter(Boolean).at(-1) : null } : event.competition,
      markets: { nodes: markets },
    });
  }
  return { data: { ...payload.data, upcomingEvents: { events: { nodes: normalized } } } };
}
