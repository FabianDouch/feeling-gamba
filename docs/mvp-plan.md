# MVP Plan

## Context

The app should create a historical log of favourites in New Zealand domestic races across:

- Thoroughbred racing
- Harness racing
- Greyhound racing

For each race, the app should store the field size, favourite, actual finishing position, payout/dividend data, and eventually TAB's market mover (`MM`) selection where it is available.

The first statistics target uses all collected historical race data starting
from the initial collection start date. That start point was chosen at roughly
six months before project start, but the product should keep expanding the
dataset as new race days are collected instead of capping statistics to a
rolling six-month window. The view should show how often favourites win, run
2nd, or run 3rd across thoroughbred, harness, and greyhound races, including
breakdowns by final starter count and a notional `$1` unit-stake return view by
racing discipline. It should also include a favourite price breakdown that
groups fixed-win favourite prices into 50c bands and shows win percentage for
each band.

The first source investigation found three relevant public surfaces:

- TAB web GraphQL endpoint: `https://api.tab.co.nz/graphql`
- TAB Form Guide: `https://formguide.tab.co.nz`
- HRNZ result pages: `https://infohorse.hrnz.co.nz/datahrs/results/`

## MVP Scope

1. Create an Expo app shell.
2. Create a Supabase project and schema for meetings, races, runners, odds snapshots, results, and source fetch logs.
3. Build a server-side ingestion process, preferably Supabase Edge Functions or a small scheduled worker, not client-side scraping.
4. Ingest daily meetings and race lists for the initial pilot tracks.
5. Identify favourites before or near race jump where prices are available.
6. Store total runners, final starters after scratchings, results, and dividends after races are final.
7. Expose a simple app view:
   - Date selector
   - Country filter: all countries, NZ, AUS
   - Code filter: horse, harness, greyhound
   - Racecourse filter scoped by selected country
   - Race list
   - Field size / starter count
   - Favourite runner
   - Result
   - Payout/dividend
   - Market mover when available
8. Plan and then expose favourite-performance statistics:
   - Default to the full collected date range.
   - Allow users to narrow the date range without discarding older collected data.
   - Show favourite win, 2nd, and 3rd percentages.
   - Break those percentages down by final starter count.
   - Break favourite win percentage down by fixed-win favourite price in 50c
     increments, such as `$1.00-$1.49`, `$1.50-$1.99`, and onward.
   - Show `$1` unit-stake average return, total returned, net return, and ROI.
   - Apply starter-count eligibility to bonus-credit returns: 5-7 starters
     credits 2nd only, 8+ starters credits 2nd/3rd, and fewer than 5 starters
     earns no place-style bonus credit unless a source promo overrides it.
   - Separate statistics by thoroughbred, harness, and greyhound racing.
   - Show denominators and missing-data counts beside percentages.
   - Filter `$1` favourite return by discipline, starter-count breakdown, and
     favourite price breakdown by all countries or one selected country, then
     all tracks or a selected individual track.
9. Add a promotions/recommendations view:
   - Fetch all current public promotions from TAB and Betcha for source
     diagnostics.
   - Display only race-specific racing promotion signals in the frontend.
   - Filter racing promotions into race-specific signal cards where possible.
   - Match race-specific promotion URLs to current race cards.
   - Scan current Betcha race cards for configured NZ and Tier 1 Australian
     pilot-track races, and rank bet-back candidates using historical favourite
     price and starter buckets.
   - Show current favourite, fixed-win price, starter count, and MarketMover where available.
   - Compare current race facts with historical starter-count and price-bucket statistics.
   - Show statistical signals only; no stake sizing, bankroll guidance, or automated wagering.

Initial pilot tracks are documented in [Pilot tracks](./architecture/pilot-tracks.md). The pilot started mostly domestic NZ racing, with Doomben included as an explicit Australian comparison track. Australian promotion coverage is now in scope for statistics planning; staged AU backfill has started with the Tier 1 high-frequency tracks documented in the pilot-track notes before moving toward all AU domestic meetings.

## Non-Goals For MVP

- No stake sizing, bankroll guidance, or automated wagering.
- No user bankroll or bet tracking.
- No push notifications until ingestion is reliable.
- No claim that TAB GraphQL is a supported API unless TAB confirms usage rights.

## Recommended Architecture

Use Expo for the mobile UI and Supabase for persistence plus backend ingestion.

Suggested components:

- Expo app: browse logged races and basic stats.
- Recommendations view: browse source-backed racing promotions with current
  race-card facts and historical statistical signals.
- Supabase Postgres: canonical racing data.
- Supabase Edge Functions invoked by Supabase Cron for MVP ingestion.
- External cron worker later if source volume, runtime, or retry requirements outgrow short Edge Function jobs.
- Source adapters:
  - `tabGraphqlAdapter`
  - `tabFormGuideAdapter`
  - `hrnzAdapter`

Keep ingestion outside the Expo client because source APIs/pages may change, require CORS workarounds, or need rate limiting.

The detailed schedule and job design is documented in [Scheduled ingestion plan](./architecture/ingestion-plan.md).

## Data Flow

1. Daily discovery job runs early NZ morning.
2. Fetch configured NZ and AU comparison meetings and races from the best
   available source.
3. Upsert meetings/races/runners into Supabase.
4. Pre-race odds job captures favourite and market mover if TAB race-card market data is available.
5. Post-race results job captures placing, dividends, margins, and final status.
6. Stored statistics read models derive favourite finish-position rates from
   normalized race, favourite, starter-count, result, price-bucket,
   country-scope, and track-scope data.
7. Promotion ingestion fetches current public TAB/Betcha promotions, filters the
   app-facing set to race-specific racing promotion signals, matches
   race-specific URLs to race cards, and ranks Betcha bet-back candidates for
   configured NZ and Tier 1 Australian pilot tracks.
8. App reads race-day records, stored derived statistics, and promotion signals
   from Supabase app-facing read models, not bundled race fixtures.

## Integration Strategy

Start with source-specific confidence levels:

- High confidence: HRNZ harness final results, because result pages are static and public.
- Medium confidence: TAB Form Guide meeting/race discovery, because pages expose race IDs and form metadata but may be generated by Next.js.
- Medium/low confidence: TAB GraphQL, because it is observable from the site but not documented as public and introspection is disabled.

For MVP, separate "favourite from source" from "favourite inferred from shortest price":

- `favourite_source = "hrnz_result_fav_rank"` when coming from HRNZ result page `Fav` rank.
- `favourite_source = "tab_odds_snapshot"` when inferred from TAB odds.
- `market_mover_source = "tab_race_card"` only when `isMarketMover` is observed on a TAB race card.
- Promotion recommendations should be labelled as statistical signals. They may
  compare historical bucket win rates to implied price probability, but must not
  tell users how much to stake.

## Open Questions

- Can TAB race-card IDs be reliably mapped for NZ harness and greyhound races, or only for some events?
- Does TAB retain `isMarketMover` after races settle, or is it only available pre-race?
- What are TAB's terms for automated access to `api.tab.co.nz/graphql` and `formguide.tab.co.nz`?
- What are TAB/Betcha terms for recurring automated public promotion access?
- Do greyhound results have an official public source equivalent to HRNZ?
- Is there a supported NZTR/thoroughbred result feed we can use instead of relying only on TAB/Form Guide?
- Can historical pre-race favourite data be recovered reliably from the
  collection start date, or should accurate pre-race favourite statistics begin
  from the first live snapshot date?

## Implementation Plan

1. Scaffold Expo app in the project root.
2. Add Supabase client and environment configuration.
3. Create SQL migrations for the MVP schema.
4. Build ingestion scripts locally first:
   - Discover race days and meetings.
   - Fetch race details by race/form ID.
   - Parse results.
   - Upsert into Supabase.
5. Convert proven scripts into scheduled jobs.
6. Build Expo screens:
   - Home/date list
   - Race detail
   - Basic favourite performance summary
7. Add statistics read models:
   - Favourite win/2nd/3rd percentages for a date range.
   - Favourite win/2nd/3rd percentages by final starter count.
   - Favourite win percentages by 50c fixed-win price bucket.
   - `$1` unit-stake favourite returns by racing code.
   - Country and track scoped versions of the return, starter-count, and price
     bucket tables.
   - Missing favourite/result/price/starter-count totals.
   - Store the app-facing aggregate rows in Supabase so Insights does not
     calculate historical tables from local fixtures at runtime.
8. Add promotion/recommendation ingestion:
   - Current public TAB/Betcha racing promotions.
   - Race-card matching and race-range expansion.
   - Current favourite, fixed-win price, starter count, and historical signal.
9. Add observability:
   - Store source URL, fetched timestamp, status, parser version, and error messages.
   - Add admin/debug screen or Supabase table views for failed fetches.

## Validation Plan

Planned checks:

- Unit tests for each parser using saved fixture HTML/JSON.
- Integration test against a small known date, such as Cambridge harness on 2026-05-21.
- Database constraints to prevent duplicate race/runner rows.
- Manual check that final placings match official source pages.
- Manual check that favourite statistics denominators exclude races with missing
  favourite or final result data.

Deferred checks:

- Long-term backfill validation across all race codes.
- Market mover retention validation, because it needs pre-race snapshots.

## Follow-Ups

- Decide whether to create a separate backend package inside the repo, for example `apps/mobile` and `packages/ingestion`.
- Confirm Supabase scheduling approach.
- Add source terms/compliance review before any recurring fetch job runs at scale.
