# Scheduled Race Ingestion Plan

## Context

The MVP needs to capture TAB favourite and MarketMover before each race jumps,
then reconcile final results and payout data after the race settles.

Historical collection starts from a configured collection start date, initially
set at `2025-12-15` for the local backfill. Six months is only the starting
point for the first dataset, not a rolling limit on storage, filtering, or
statistics.

The Ellerslie 2026-05-23 check confirmed the preferred route:

- Use TAB GraphQL `racingDay` to discover TAB `RacingRace` IDs for target meetings.
- Convert `RacingRace:<uuid>` to `RacingRaceCard:<uuid>` for live race-card data.
- Read `finalField.runnerRows[].prices` for fixed-win favourite snapshots.
- Read `finalField.runnerRows[].isMarketMover` for TAB MarketMover.
- Use TAB Form Guide as a declared-field/form-data source when GraphQL is missing
  runner counts or when comparing declared runners against current starters.

## Recommendation

Use Supabase Edge Functions plus Supabase Cron for the MVP.

This fits the current workload because the first target set is small, race days are
predictable, and each fetch can be short-lived and idempotent. Supabase Cron can
invoke Edge Functions on a schedule, and Supabase's guidance is to keep jobs short,
observable, and within platform limits.

Move to an external worker later if:

- ingestion routinely approaches the 10 minute cron-job runtime guidance;
- the app expands to every NZ, AU, and international meeting;
- TAB GraphQL requires browser-like session handling;
- we need high-frequency snapshots across many tracks.

## Target Coverage

Initial pilot tracks, retained only for diagnostics and small source checks:

- Ellerslie
- New Plymouth
- Te Rapa
- Addington
- Alexandra Park
- Doomben
- Wingatui
- Whanganui
- Cambridge

Australian promotion coverage:

- Because TAB/Betcha racing promos can apply to Australian thoroughbred,
  greyhound, and harness races, the production race-day collection target is all
  AUS and NZ domestic meetings returned by the source for `HORSE`, `HARNESS`,
  and `GREYHOUND`.
- On 2026-06-20 the historical and weekly race-day collectors were moved to an
  explicit `--all-domestic` / `all_domestic` coverage mode by default. The old
  configured pilot list remains available through `--pilot-tracks` only for
  small diagnostics.
- This change is intended to capture tracks previously missed by the pilot
  allow-list, including Randwick when Betcha returns a Randwick domestic
  meeting in the selected date window.
- The current completeness claim is source-backed: the collector can capture
  every AUS/NZ horse, harness, and greyhound race returned by Betcha
  `racingDay(categories: [HORSE, HARNESS, GREYHOUND], regions: [DOMESTIC])`.
  It is not an independent guarantee against official-code calendars until
  reconciliation against NZTR, HRNZ, GRNZ, and Australian official sources is
  added.
- Tier 1 AU tracks were the previous local-historical collector scope and remain
  useful examples when checking old pilot fixtures. They were selected from
  high-frequency AU tracks observed in the bundled `2025-12-15` to
  `2026-06-15` source window.
- Tier 1 thoroughbred tracks: Ascot, Sunshine Coast, Ipswich, Eagle Farm,
  Pakenham, Doomben, Morphettville, Newcastle, Gold Coast, Toowoomba,
  Townsville, Cranbourne.
- Tier 1 harness tracks: Albion Park, Redcliffe, Globe Derby, Gloucester Park,
  Menangle, Newcastle, Melton, Bathurst, Pinjarra, Penrith, Shepparton,
  Mildura.
- Tier 1 greyhound tracks: Q1 Lakeside, Mandurah, Angle Park, Richmond,
  Healesville, Warragul, The Gardens, Ballarat, Geelong, Shepparton, Taree,
  Q Straight, Q2 Parklands, Nowra, Warrnambool.
- Tier 2 should continue by source frequency after Tier 1 is reliable; examples
  include Sandown Park, Mount Gambier, Capalaba, Wentworth Park, The Meadows,
  Rockhampton, Sale, Bendigo, and Cannington for greyhounds; Hobart,
  Launceston, Tamworth, Wagga (H), Maryborough, Kilmore, and Bendigo for
  harness; Randwick, Belmont, Rockhampton, Gosford, Sandown, Taree, Launceston,
  Hobart, Wyong, and Geelong for thoroughbreds.
- Do not use AU coverage as betting recommendations; broad coverage defines
  data collection for statistical comparison and promotion eligibility only.

## Local Historical Fixture Status

Canonical raw JSON fixtures live under `data/raw/betcha-graphql`. They are now
development/backfill input only. Race Days and Insights runtime data should come
from Supabase read models, not bundled Expo fixture copies.

Collected pilot-track ranges so far:

- `2025-12-15`: 1 matched meeting and 12 races.
- `2025-12-16` to `2025-12-31`: 18 matched meetings and 184 races.
- `2026-01-01` to `2026-01-31`: 36 matched meetings and 357 races.
- `2026-02-01` to `2026-02-28`: 33 matched meetings and 321 races.
- `2026-03-01` to `2026-03-31`: 35 matched meetings and 341 races.
- `2026-04-01` to `2026-04-30`: 37 matched meetings and 345 races.
- `2026-05-01` to `2026-05-31`: 42 matched meetings and 394 races.
- `2026-06-01` to `2026-06-15`: 165 matched meetings and 1,705 races after
  Tier 1 Australian comparison tracks were added to the local collector.

The bundled local fixture range contains 183 daily JSON files from
`2025-12-15` through `2026-06-15`. The app fixture directory is about 158 MB,
which is one reason the runtime app should move to Supabase-backed read models
before more AU data is added.

Local fixture validation now has a first automated test suite at
`apps/mobile/test/fixturePipeline.test.mjs`, run with
`npm --workspace @feeling-gamba/mobile test`. It reads the bundled saved JSON
fixtures directly and checks the collected date range, flattened race-card ID
uniqueness, active-starter parsing from scratched/vacant rows, AU/NZ track
filter metadata, bet-back bonus starter thresholds, and exclusion of missing
favourite results from settled denominators.

For backfill, prefer race-level `derived.favourites` rows over older saved
`summary.favouriteOutcomes` buckets. Some historical fixture summaries were
generated before missing-result handling was consistent. Once rows are loaded
into Supabase, insight derivation should store aggregate results in
`insight_aggregates`; the frontend should not recompute historical insights
from bundled fixtures at runtime.

The `2026-06-01` to `2026-06-15` AU-inclusive backfill produced:

- AUS: 146 matched meetings, 1,518 races, and 1,521 settled favourite
  selections.
- NZ: 19 matched meetings, 187 races, and 187 settled favourite selections.
- AUS discipline split: 79 greyhound meetings / 945 races, 46 harness meetings
  / 405 races, and 21 thoroughbred meetings / 168 races.
- NZ discipline split: 9 greyhound meetings / 93 races, 6 harness meetings / 59
  races, and 4 thoroughbred meetings / 35 races.
- Co-favourite races can create more favourite selections than races; aggregate
  denominators should count settled favourite selections, not only race rows.

Track matching should normalize case and aliases:

- `New plymouth` -> `New Plymouth`
- `Cambridge (G)` -> greyhound Cambridge
- `Cambridge` -> harness/thoroughbred Cambridge, distinguished by `race_code`
- `Doomben` is AUS in Betcha venue data, kept as comparison data rather than
  domestic NZ, and should be visible through the AUS country and course filters.
- On `2026-06-16`, corrected Doomben matching from `AU` to Betcha's `AUS`
  country code and backfilled the affected bundled/raw fixtures.
- Backfill result: 21 Doomben meetings, 174 Doomben races, 163 settled
  favourite selections, and no remaining Doomben entries in ignored source
  meetings.
- The `2026-06-10` and `2026-06-11` Doomben meetings were abandoned; their races
  remain visible as race rows but do not count as favourite-result selections.

## Edge Functions

### `discover-races`

Purpose:

- Find today's and tomorrow's target-track meetings.
- Upsert `meetings`, `races`, and initial `runners`.
- Store all known source IDs.

Inputs:

```json
{
  "date": "2026-05-23",
  "tracks": ["Ellerslie", "New Plymouth"],
  "codes": ["horse", "harness", "greyhound"]
}
```

Source order:

1. TAB GraphQL `racingDay` for `RacingRace` IDs and open market status.
2. Betcha GraphQL `racingDay` as a secondary race-card and promotions source.
3. TAB Form Guide date/race pages for declared runners and form metadata.
4. Code-specific official sources when available, such as HRNZ for harness.

Expected writes:

- `meetings`
- `races`
- `runners`
- `source_fetches`

### `capture-market-snapshots`

Purpose:

- Capture current fixed-win favourite and TAB MarketMover while the race-card
  market is open.
- Run repeatedly for races near jump time.

Selection rule:

- Find races for target tracks where:
  - `advertised_start` is between now and 2 hours ahead, or
  - `advertised_start` was within the last 10 minutes and no near-jump snapshot exists.
  - `status` is not final/abandoned.

Source:

- TAB GraphQL `node(id: "RacingRaceCard:<uuid>")`.
- Betcha GraphQL `node(id: "RacingRaceCard:<uuid>")` when a matching Betcha
  race-card ID is available.

Parsing rules:

- Current starter count = runner rows where `scratchedTimestamp is null`.
- Fixed-win product type = `940b8704-e497-4a76-b390-00918ff7d282`.
- Favourite = shortest non-null fixed-win decimal price among non-scratched runners.
- MarketMover = runner row where `isMarketMover = true`.
- Store one `odds_snapshots` row per runner per snapshot.
- Mark `is_favourite = true` only for the shortest fixed-win runner at that snapshot.
- Mark `is_market_mover = true` only when TAB explicitly flags the runner.

Snapshot cadence:

- Every 10 minutes from T-120 to T-30.
- Every 5 minutes from T-30 to T-5.
- Every 1 minute from T-5 to jump if volume remains low.
- Always derive the MVP favourite/MM from the closest successful snapshot before
  `advertised_start`, preferably inside the final 5 minutes.

### `collect-results`

Purpose:

- Fetch final results, finishing position, dividends, margins, and final starter
  counts after each race.

Selection rule:

- Find races where `advertised_start` is between 5 minutes and 48 hours ago and either:
  - no result has been stored, or
  - status is not final, or
  - the most recent result fetch failed.

Source order:

1. TAB GraphQL race-card `results` for runner-level result and dividends.
2. Betcha GraphQL race-card `results` as a secondary source.
3. HRNZ result pages for harness final placings/favourite rank.
4. NZTR/LOVERACING result feeds/pages for thoroughbred final results.
5. GRNZ official result source once confirmed.

Expected writes:

- `race_results`
- `race_dividends`
- updates to `races.status`, `starter_count`, `scratched_count`
- `source_fetches`

### `reconcile-race-day`

Purpose:

- A lower-frequency cleanup job that fills gaps after the meeting has finished.
- Re-fetches missing final results and compares declared runner count vs starters.

Suggested schedule:

- Daily at 21:30 NZ time.
- Daily at 06:00 NZ time for the previous day.

### `backfill-historical-results`

Purpose:

- Pull race results from the initial collection start date through the current
  date for thoroughbred, harness, and greyhound racing.
- Populate final results, starter counts, dividends, and favourite data where a
  source can explicitly identify it.
- Support favourite-performance statistics without inventing missing favourite
  or MarketMover values.

Initial mode:

- Manual worker or manually invoked Edge Function.
- Do not enable as a broad recurring job until source terms, rate limits, and
  parser reliability are confirmed.

Selection rule:

- Race dates between the configured collection start date and the current date.
- Race codes: `horse`, `harness`, `greyhound`.
- Use `--all-domestic` for normal historical backfills so all AUS/NZ domestic
  meetings returned by the source are written to Supabase.
- Use `--pilot-tracks` only for targeted diagnostics or reproducing older
  fixture files.

Source order:

1. TAB GraphQL race-card `results` for settled results, dividends, and retained
   favourite/market fields where available.
2. Betcha GraphQL race-card `results` as a secondary source.
3. TAB Form Guide for declared fields and runner metadata.
4. HRNZ result pages for harness official results and result-page favourite rank.
5. NZTR/LOVERACING and GRNZ official sources once confirmed.

Expected writes:

- `meetings`
- `races`
- `runners`
- `odds_snapshots` only when historical market data is explicitly available
- `race_results`
- `race_dividends`
- `source_fetches`
- `ingestion_runs`

Statistics rules:

- Pre-race favourite statistics should use the closest known pre-jump snapshot.
- If only result-page favourite rank is available, store it separately and do not
  silently merge it into pre-race favourite percentages.
- Exclude races with missing favourite or final result from percentage
  denominators and count them separately.
- Group starter-count breakdowns by final `starter_count`, not declared runner
  count.

### `refresh-race-days-and-insights`

Purpose:

- Run weekly to discover and ingest the latest completed race dates.
- Include all available races for horse, harness, and greyhound across all
  countries/courses returned by the configured source coverage.
- Upsert `race_day_entries` for the refreshed window and rebuild
  `insight_aggregates` across the full collected range after new race-day data
  is inserted or reconciled.

Selection rule:

- Local/manual implementation:
  `npm --workspace @feeling-gamba/ingestion run refresh:race-days-and-insights`.
- Hosted implementation:
  `supabase/functions/refresh-race-days-and-insights`.
- Both implementations default to `all_domestic` coverage for AUS/NZ domestic
  `HORSE`, `HARNESS`, and `GREYHOUND` meetings returned by Betcha.
- The local worker defaults to the latest 14 completed Auckland dates, ending
  yesterday, so late results and corrections can be picked up.
- The hosted Edge Function defaults to the latest 7 completed Auckland dates,
  ending yesterday, to stay inside Supabase Edge Function runtime limits.
- Operators can pass `--from=YYYY-MM-DD --to=YYYY-MM-DD` for a fixed window.
- Operators can pass `--pilot-tracks` or hosted `coverageMode: "pilot"` only
  when they intentionally want the old allow-list coverage for a small run.
- Both implementations fetch current source data first, then write the selected
  window to Supabase, then rebuild all-time `insight_aggregates` from
  `race_day_entries` / collected race data through the refreshed window end.
- Both implementations reconcile stored promotion predictions after race data is
  refreshed, then rebuild `prediction_aggregates` for the Predictions tab.
- The hosted function requires `RACE_DAY_REFRESH_ADMIN_TOKEN` as an Edge
  Function secret and `x-refresh-token` request header for write runs.
- If a manual backfill has inserted older records, leave them in storage and
  only fill gaps; do not cap historical storage to two weeks.

Expected writes:

- `meetings`
- `races`
- `runners`
- `odds_snapshots` when explicit prices are available
- `race_results`
- `race_dividends`
- `race_day_entries`
- `insight_aggregate_runs`
- `insight_aggregates`
- `source_fetches`
- `ingestion_runs`

Runtime app rule:

- The Race Days tab should request the latest 20 races across AUS/NZ from
  `race_day_entries` when opened.
- After the user applies filters, the app should query Supabase with those
  filter parameters instead of downloading all historical rows.

Six-month catch-up command:

- To repair the missing historical coverage, run the broad local fetch and
  backfill for the six-month window. From 2026-06-20 this is
  `2025-12-20` through `2026-06-19`; using the configured collection start
  `2025-12-15` is acceptable and gives a few extra days.
- Fetch source fixtures:
  `npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --from=2025-12-15 --to=2026-06-19 --all-domestic`
- Upsert the same window to Supabase:
  `npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --from=2025-12-15 --to=2026-06-19 --all-domestic --require-supabase`
- Reconcile prediction outcomes after the backfill:
  `npm --workspace @feeling-gamba/ingestion run reconcile:predictions -- --require-supabase`

### `fetch-current-promotions`

Purpose:

- Fetch current public racing promotions from TAB and Betcha.
- Page through all active public promotion results from each provider using the
  broad public promotions query, then filter the app-facing set to race-specific
  racing promotion signals.
- Match race-specific promotion URLs to current race cards.
- Expand race-range promotions, such as Races 1-2, to each covered race card.
- Derive current favourite, fixed-win price, starter count, MarketMover, and
  missing-price state.
- Attach historical starter-count, price-bucket, and cash-plus-bonus statistical
  signals for race-specific promotion cards.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run fetch:current-promotions`.
- The manual worker loads `.env`/`.env.local`, writes local raw/app fixtures,
  and upserts the generated app-facing payload to Supabase
  `current_promotion_snapshots` when `EXPO_PUBLIC_SUPABASE_URL` plus
  `FEELING_GAMBA_SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, or
  `SUPABASE_SERVICE_ROLE_KEY` are configured. For hosted Edge Function secrets,
  prefer `FEELING_GAMBA_SUPABASE_SECRET_KEY` because `SUPABASE_*` names are
  reserved by Supabase.
- `EXPO_PUBLIC_SUPABASE_URL` should be the Supabase project URL origin, such as
  `https://example.supabase.co`; the worker normalizes copied REST URLs that
  include `/rest/v1`.
- Promos treats `current_promotion_snapshots` rows older than 15 minutes as
  stale. The app can call an optional backend refresh endpoint configured as
  `EXPO_PUBLIC_PROMOTION_REFRESH_URL`; that endpoint must run server-side with
  source access and Supabase service-role secrets, never from Expo.
- The first backend refresh endpoint is scaffolded as the
  `refresh-current-promotions` Supabase Edge Function under
  `supabase/functions/refresh-current-promotions`.
- `refresh-current-promotions` reuses the shared promotion generator, reads
  global, race-code, and country+race-code starter, price, distance-band, and
  track-condition signal rows from `insight_aggregates`, fetches fresh public
  TAB/Betcha promotion race-card data, then upserts
  `current_promotion_snapshots`.
- `supabase/config.toml` sets
  `[functions.refresh-current-promotions].verify_jwt = false` so the Expo app
  can call the refresh URL without user auth. The function still keeps Supabase
  secret keys server-side, skips source calls when the latest snapshot is under
  15 minutes old, and only honours `force: true` when
  `PROMOTION_REFRESH_ADMIN_TOKEN` is configured and sent as `x-refresh-token`.
- The worker should run at least daily for the Auckland source date, and more
  often during live race windows if source terms and rate limits allow.

### `fetch-current-predictions`

Purpose:

- Scan Betcha current race cards for configured NZ and Tier 1 Australian
  pilot-track races independently of active promotions.
- Derive current favourite, fixed-win price, starter count, MarketMover, and
  missing-price state.
- Attach historical starter-count, price-bucket, distance-band,
  track-condition, cash, and cash-plus-bonus statistical signals from stored
  `insight_aggregates`.
- Rank bet-back candidates by discipline and model, including
  `global_bucket_cash_blend_v1` and `global_bucket_cash_even_blend_v1`.
- Keep candidate rankings available in Predictions even when no public
  race-specific promotion URL matches current race cards.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run fetch:current-predictions`.
- Immediate write run for today's race cards after the migration is applied:
  `npm --workspace @feeling-gamba/ingestion run fetch:current-predictions -- --require-supabase`.
- The manual worker loads `.env`/`.env.local`, writes local raw/app fixtures,
  and upserts the generated app-facing payload to Supabase
  `current_prediction_snapshots` when `EXPO_PUBLIC_SUPABASE_URL` plus
  `FEELING_GAMBA_SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, or
  `SUPABASE_SERVICE_ROLE_KEY` are configured.
- Predictions treats `current_prediction_snapshots` rows older than 15 minutes
  as stale. The app can call an optional backend refresh endpoint configured as
  `EXPO_PUBLIC_PREDICTION_REFRESH_URL`; that endpoint must run server-side with
  source access and Supabase service-role secrets, never from Expo.
- The backend refresh endpoint is scaffolded as the
  `refresh-current-predictions` Supabase Edge Function under
  `supabase/functions/refresh-current-predictions`.
- `refresh-current-predictions` reads historical signal rows from stored
  `insight_aggregates`, fetches fresh public Betcha current race-card data, and
  upserts `current_prediction_snapshots`.
- The prediction refresh stores Betcha bet-back candidate predictions in
  `promotion_predictions`. The unique key is
  `(prediction_model, source, source_race_card_id)` so model variations can run
  in parallel on the same race card. Existing rows are replaced only when the
  prediction signature changes, such as favourite, fixed-win price, starter
  count, rank, model score, or signal changing.
- After storing predictions, the prediction refresh rebuilds
  `prediction_aggregates` so the Predictions tab can show pending predictions
  before any races have settled.
- `refresh-race-days-and-insights` reconciles non-settled predictions after it
  writes weekly race data. It matches `source_race_card_id` to stored races and
  the predicted runner number to `runners` / `race_results`, then stores the
  outcome on `promotion_predictions`.
- No-race matches remain `pending` until at least 24 hours after advertised
  start so same-day predictions are not marked `race_not_found` before
  race-day ingestion catches up.
- Prediction return outcomes use the predicted fixed-win price and the same
  bonus-credit rule as Insights: 2nd earns `$1` for 5+ final starters, and 3rd
  earns `$1` for 8+ final starters.
- After reconciliation, the weekly refresh rebuilds model-scoped
  `prediction_aggregates` for the Predictions tab. The app reads these stored
  aggregates instead of calculating prediction performance from raw prediction
  rows.
- `supabase/config.toml` sets
  `[functions.refresh-current-predictions].verify_jwt = false` so the Expo app
  can call the refresh URL without user auth. The function still keeps Supabase
  secret keys server-side, skips source calls when the latest snapshot is under
  15 minutes old, and only honours `force: true` when
  `PREDICTION_REFRESH_ADMIN_TOKEN` or `PROMOTION_REFRESH_ADMIN_TOKEN` is
  configured and sent as `x-refresh-token`.
- The worker should run every day for the Auckland source date, and more
  frequently during active race windows if TAB/Betcha terms and rate limits
  permit it.

Source order:

1. TAB GraphQL public `PromotionsList`.
2. Betcha GraphQL public `PromotionsList`.
3. TAB/Betcha race-card `node(id: "RacingRaceCard:<uuid>")` for race facts.
4. TAB/Betcha `racingDay` to expand race ranges from the same meeting.
5. Betcha `racingDay` and race-card `node` for daily bet-back candidate scans.

Parsing rules:

- Treat `rootCategoryGroup`, `/racing` URI, and racing keywords in description
  as promotion classification signals, but exclude generic account, signup,
  withdrawal, safer-betting, and clearly sports-only housekeeping entries from
  the app-facing racing promotion list.
- Request `pageInfo { hasNextPage endCursor }` from `PromotionsList` and keep
  fetching with `after` until `hasNextPage` is false.
- Store/count all active public promotions from each provider before filtering
  to racing promotions for the app view.
- Include lightweight summaries of all active public promotions in generated
  diagnostics and Supabase payloads, but the Promos page should display only
  race-specific promotion signals from `current_promotion_snapshots`.
- Record `sourceDate` using `Pacific/Auckland` and include Auckland refresh
  metadata so stale Supabase snapshots can be identified in the app.
- Deduplicate user-facing racing recommendations by normalized description and
  URI because providers can return the same broad offer under multiple IDs.
- Extract direct race-card UUIDs from `/racing/<track>/<uuid>` URLs.
- Extract race ranges from text like `Races 1-2`.
- Extract target runner numbers from text like `#4` where present.
- Use fixed-win prices only when the source returns numeric fixed-win decimals.
- If fixed-win decimals are missing, show a missing-price state and do not
  invent a favourite.
- Exclude favourites with missing final result positions from favourite outcome
  denominators so abandoned or unsettled races do not count as losses.
- For Betcha bet-back candidates, scan configured pilot-track races:
  Ellerslie, New Plymouth, Te Rapa, Addington, Alexandra Park, Wingatui,
  Whanganui/Hatrick, Cambridge, and Doomben. Doomben is the explicit Australian
  comparison track.
- Derive each candidate favourite from the current shortest fixed-win price.
- The current default prediction model ranks candidates by a blended historical
  cash-plus-bonus average: 65% favourite price bucket and 35% final
  starter-count bucket using global history.
- The global cash bucket blend ranks candidates with 65% favourite price-bucket
  cash average and 35% starter-count cash average, excluding bonus-credit value.
- The global cash 50/50 blend ranks candidates with 50% favourite price-bucket
  cash average and 50% starter-count cash average, excluding bonus-credit value.
- The country+discipline model ranks the same source-backed favourites using
  country+discipline buckets where available, with each bucket value shrunk
  toward the matching global bucket value before the same 65%/35% blend.
- The distance+condition model ranks the same favourites with a conservative
  country+discipline blend of 45% price bucket, 25% starter-count bucket, 20%
  distance-band bucket, and 10% track-condition bucket, each shrunk toward the
  matching broader bucket where available.
- Group candidate rankings by discipline and keep at most five candidates per
  discipline.
- Use the same `$1` bonus-credit rule as Insights: favourite win pays fixed-win
  cash return; favourite 2nd or 3rd earns one `$1` bonus face-value credit.
- Show candidate rankings as statistical signals, not instructions to bet.
- Recommendation labels are statistical signals only; do not produce stake
  sizing, bankroll guidance, or automated wagering actions.

Prototype status on 2026-06-15:

- Script path:
  `packages/ingestion/scripts/fetch-current-promotions.mjs`.
- Canonical output:
  `data/raw/promotions/current-racing-promotions-2026-06-15.json`.
- Former app fixture / development diagnostic:
  `apps/mobile/src/data/fixtures/currentRacingPromotions.json`.
- Live public promotions fetched: 3 racing promotions across TAB and Betcha.
- All active public promotion pages fetched: Betcha returned 10 promotions over
  1 page; TAB returned 10 promotions over 1 page.
- Race-specific promotions matched: 2.
- Matched current races: Whanganui Straight R1 and R2.
- Both matched sources returned starter counts but no numeric fixed-win decimals
  at fetch time, so the app shows price unavailable and starter-history signals.

Source check on 2026-06-16:

- TAB `PromotionsList` with `positions: [PROMOTIONS]`, `positions:
  [INDICATORS]`, both positions, desktop/mobile/no `availableOn`, and no
  position filter was checked for the expected Cambridge thoroughbred Wednesday
  promo.
- Omitting the `positions` filter exposed more public racing-related TAB items
  than the global promotions-page query, so `fetch-current-promotions` now uses
  the broader public promotions query before filtering.
- The expected Cambridge race-specific promo was not present in any checked
  unauthenticated TAB public promotions result.
- TAB's web bundle exposes authenticated/client promotion surfaces such as
  race-level `promotion(positions: [INDICATORS])`, `ClientPromotions`, and
  `PersonalisedPromotionsList`, but unauthenticated probes returned forbidden or
  unauthenticated errors. Treat those as future authenticated-source candidates,
  not current public MVP inputs.
- Current refreshed payload: 11 deduplicated racing-related public promotions
  across TAB and Betcha, including 2 race-specific promotion groups. The Promos
  page hides broad unmatched racing offers and keeps them as diagnostics only.
- Betcha bet-back candidate scan on the same refresh checked 1 configured
  pilot-track meeting, 12 Whanganui Straight races, and wrote 8 ranked
  candidates to the local diagnostic payload. Doomben is now included in the
  scan configuration and appears when Betcha returns a current Doomben meeting.

Source check on 2026-06-18:

- Refreshed current promotions using Auckland source date `2026-06-18`.
- Current payload now records `sourceTimeZone: Pacific/Auckland` and
  `generatedAtNz` alongside the UTC `generatedAt`.
- Public TAB/Betcha promotion refresh found 16 racing-related public promos, 5
  race-specific promotion groups, and 8 Betcha bet-back candidates.
- The Betcha Cambridge R1/R2 race-specific cards now return fixed-win
  favourites, confirming the earlier missing-price state was stale fixture data
  or prices not yet available at the earlier fetch time rather than a permanent
  source limitation.
- The Promos page shows a stale-cache warning when the Supabase promotion
  snapshot is older than the live-racing freshness target or its `sourceDate`
  differs from today's Auckland date. It does not fall back to bundled
  promotion JSON when Supabase configuration, cache rows, or cache reads are
  unavailable.

## Recurring Scheduling

Use scheduled invocations to keep Edge Functions current. Prefer GitHub Actions
for the first daily race-day catch-up so no database cron migration is needed;
Supabase Cron remains available for jobs that are safer to manage inside the
database later.

Proposed recurring jobs:

| Job | Schedule | Function | Notes |
| --- | --- | --- | --- |
| `discover-today-races` | `0 6 * * *` NZ time | `discover-races` | Creates today's race records early. |
| `discover-tomorrow-races` | `0 18 * * *` NZ time | `discover-races` | Pre-loads future race cards when available. |
| `refresh-race-discovery` | `0 * * * *` | `discover-races` | Captures late markets, changed fields, or added meetings. |
| `capture-market-snapshots` | `*/5 * * * *` | `capture-market-snapshots` | The function decides which races need snapshots. |
| `collect-results` | `*/10 * * * *` | `collect-results` | Runs during and after race windows. |
| `reconcile-race-day` | `30 21 * * *` and `0 6 * * *` NZ time | `reconcile-race-day` | Backfills failures and final results. |
| `refresh-race-days-and-insights` | active: daily GitHub Actions schedule `10 18 * * *` UTC | `refresh-race-days-and-insights` | Refreshes the latest 4 completed Auckland source dates as one request per date/country/category slice, then runs one aggregate/reconcile-only request. |
| `refresh-current-promotions` | daily, for example `0 7 * * *` NZ time, plus optional manual/app-triggered stale refreshes | `refresh-current-promotions` | Refreshes current public racing promotion cache. Function skips unnecessary source calls when cache is fresher than 15 minutes. |
| `refresh-current-predictions` | every 15 minutes during active NZ/AU race-card windows, for example `*/15 22-10 * * *` UTC | `refresh-current-predictions` | Refreshes current Betcha prediction candidates independently of promotions, writes all model variants including the global cash blends, and skips source calls when the prediction cache is fresher than 15 minutes. |

Historical backfill should start as a manual run in bounded chunks. Add a
recurring schedule only after source terms, runtime, and parser reliability are
confirmed.

The daily race-day refresh is deployed as `refresh-race-days-and-insights` and
scheduled through `.github/workflows/overnight-race-refresh.yml`. The workflow
calls the hosted Edge Function at `18:10` UTC, which is early morning in New
Zealand. The scheduled run uses a 4-day completed Auckland-date lookback, but it
does not send that as one large Edge Function request. Instead, it loops over
each completed source date and calls the hosted function with `from` and `to`
set to that date. Each date is further sliced by country (`NZ`, `AUS`) and
source category (`HORSE`, `HARNESS`, `GREYHOUND`). These source-fetch chunks
use `refreshRaceData: true`, `rebuildInsights: false`, and
`reconcileOutcomes: false`. After all source slices finish, the workflow makes
one final aggregate/reconcile-only request with `refreshRaceData: false`,
`rebuildInsights: true`, and `reconcileOutcomes: true`. This keeps Race Days
current, settles prediction outcomes, and avoids the 150 second request idle
timeout seen when a 4-day all-domestic window and then a single all-domestic
date were sent as one request. Manual workflow dispatch can use a larger
lookback, up to 14 completed Auckland dates, for catch-up runs such as
recovering data after the app only shows race days through `2026-06-21`.

Deploy `refresh-race-days-and-insights` after merging changes to the slice
request body. If the workflow is updated before the Edge Function is redeployed,
the hosted function will ignore new `countries`, `categories`,
`refreshRaceData`, and `reconcileOutcomes` fields and can still time out on
all-domestic requests.

Supabase Edge Function limits are a practical constraint: request idle timeout
is 150 seconds, with a 150 second Free plan / 400 second Paid plan worker
wall-clock limit. Keep the scheduled window bounded and review logs before
expanding the lookback.

Required GitHub repository secrets for the overnight workflow:

- `SUPABASE_PROJECT_REF`
- `RACE_DAY_REFRESH_ADMIN_TOKEN`

The same `RACE_DAY_REFRESH_ADMIN_TOKEN` value must also be configured as a
Supabase Edge Function secret for `refresh-race-days-and-insights`.

Troubleshooting:

- If the workflow returns `401` with `Unauthorized refresh request.`, the
  `RACE_DAY_REFRESH_ADMIN_TOKEN` GitHub repository secret is missing or does not
  match the Supabase Edge Function secret of the same name.
- Set or rotate the Supabase-side value with
  `npx supabase secrets set RACE_DAY_REFRESH_ADMIN_TOKEN=<same-token> --project-ref <project-ref>`.
- If the workflow returns `504` with `IDLE_TIMEOUT`, reduce the manual
  `lookback_days` and confirm the latest `refresh-race-days-and-insights` Edge
  Function has been deployed. The workflow chunks by date, country, and source
  category, but a single very large source slice can still exceed Supabase's
  request idle timeout.
- The workflow must fail on non-2xx HTTP responses. Each `curl` call writes the
  response to a file before `jq` formats it so pipe handling cannot hide HTTP
  failures.

Manual local refresh dry run:

```bash
npm --workspace @feeling-gamba/ingestion run refresh:race-days-and-insights -- --dry-run
```

Manual local refresh write:

```bash
npm --workspace @feeling-gamba/ingestion run refresh:race-days-and-insights -- --require-supabase
```

Manual prediction-only reconciliation:

```bash
npm --workspace @feeling-gamba/ingestion run reconcile:predictions -- --require-supabase
```

First live weekly-refresh catch-up on `2026-06-19`:

- Command:
  `npm --workspace @feeling-gamba/ingestion run refresh:race-days-and-insights -- --from=2026-06-16 --to=2026-06-18 --require-supabase`
- Source fetch wrote raw fixtures for `2026-06-16`, `2026-06-17`, and
  `2026-06-18`.
- Matched 32 meetings and 331 races across the refreshed window.
- Supabase full-window upsert run `591aa091-7fa8-45ee-bda1-f60bf43b4b5e`
  wrote 331 `race_day_entries`, 2,479 `race_results`, 2,556
  `odds_snapshots`, and 1,394 `race_dividends`.
- All-time insight rebuild run `36e2aa0c-438c-4dd9-9cef-249a7e9bea5a`
  rebuilt 878 `insight_aggregates` from `2025-12-15` through `2026-06-18`.
- Hosted dry-run on `2026-06-19` returned the expected 7-day Auckland window:
  `2026-06-12` through `2026-06-18`.
- Hosted one-day write on `2026-06-19` for `2026-06-18` succeeded:
  run `72a17af5-9158-4cda-8cc3-ae9fd341fcc2` refreshed 129
  `race_day_entries`; aggregate run `7bbb354c-dca2-4bfb-b564-51d0d4e2eb44`
  rebuilt 878 `insight_aggregates` from 4,140 `race_day_entries`.
- Previous Supabase Cron job: `refresh-race-days-and-insights-weekly`, schedule
  `0 7 * * 1`, called the hosted function with `lookbackDays: 7` and
  `rebuildInsights: true`. It was superseded by the daily GitHub Actions
  overnight workflow so prediction outcomes are not stuck pending for most of
  the week.

## Edge Function Deployment Notes

The Supabase CLI is not required for local Expo development, but it is needed to
deploy Edge Functions from this repo.

Install or run the CLI:

```bash
npx supabase --help
```

or install it as a local dev dependency:

```bash
npm install supabase --save-dev
```

Production deployment sequence:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase secrets set FEELING_GAMBA_SUPABASE_SECRET_KEY=<rotated-secret-key>
npx supabase functions deploy refresh-current-promotions --no-verify-jwt --use-api
npx supabase functions deploy refresh-current-predictions --no-verify-jwt --use-api
```

`--no-verify-jwt` matches the checked-in function config for public app-triggered
refreshes. `--use-api` avoids needing a local Docker daemon for bundling.

After deploy, set the Expo public refresh URL:

```bash
EXPO_PUBLIC_PROMOTION_REFRESH_URL=https://<project-ref>.supabase.co/functions/v1/refresh-current-promotions
EXPO_PUBLIC_PREDICTION_REFRESH_URL=https://<project-ref>.supabase.co/functions/v1/refresh-current-predictions
```

Apply `supabase/sql/schedule-refresh-current-predictions.sql` after replacing
the project ref and bearer token to keep prediction snapshots refreshing during
the active race-card window.

The hosted Edge Function also supports Supabase's default secret-key environment
shape (`SUPABASE_SECRET_KEYS` or legacy `SUPABASE_SERVICE_ROLE_KEY`), but custom
secrets set through the CLI must not use the reserved `SUPABASE_` prefix. If a
secret is pasted into chat or logs, rotate it before setting the replacement
secret.

## Manual Historical Fixture

The local historical fixture command supports either a single date or a date
range.

Single date:

```bash
npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --date=2025-12-15
```

Date range:

```bash
npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --from=2025-12-16 --to=2025-12-31
```

Course filter:

```bash
npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --date=2025-12-20 --tracks="Te Rapa"
```

Multiple course filters use comma-separated names or aliases:

```bash
npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --from=2025-12-16 --to=2025-12-31 --tracks="Addington,Cambridge"
```

Output:

- `data/raw/betcha-graphql/pilot-tracks-2025-12-15.json`
- `data/raw/betcha-graphql/pilot-tracks-2025-12-16-to-2025-12-31.manifest.json`
- Daily range files such as
  `data/raw/betcha-graphql/pilot-tracks-2025-12-18.json`
- Filtered course files include the filter slug, for example
  `data/raw/betcha-graphql/pilot-tracks-cambridge-2025-12-18.json`
- Bundled Expo preview copy:
  `apps/mobile/src/data/fixtures/pilot-tracks-2025-12-15.json`

## Manual Supabase Fixture Backfill

After the race-data schema migration is applied, saved raw fixtures can be
loaded into Supabase without making source-network requests.

Dry run one date:

```bash
npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --date=2025-12-15 --dry-run
```

Write one date to Supabase:

```bash
npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --date=2025-12-15 --require-supabase
```

Write a bounded date range:

```bash
npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --from=2025-12-15 --to=2025-12-31 --require-supabase
```

Rules:

- Load `.env.local` and `.env` without printing secrets.
- Use `FEELING_GAMBA_SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or
  `SUPABASE_SECRET_KEY`; do not use the public Expo key for writes.
- Upsert normalized `meetings`, `races`, `runners`, `odds_snapshots`,
  `race_results`, `race_market_state`, `race_day_entries`, and
  `insight_aggregates`.
- Delete and reinsert `race_dividends` for the target races during reruns
  because dividend combinations can be null and are source-derived rows.
- Insert `source_fetches`, `ingestion_runs`, and `insight_aggregate_runs` for
  auditability.

Verified sample run on `2026-06-18`:

- Command:
  `npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --date=2025-12-15 --require-supabase`
- Supabase ingestion run id: `b151ff50-295f-4421-a108-bafc8da145d4`.
- Rows written/upserted: 1 meeting, 12 races, 107 runners, 83 odds snapshots,
  83 race results, 60 race dividends, 12 race market states, 12
  `race_day_entries`, 28 `insight_aggregates`, and 1 `source_fetches` row.
- Read-back count check confirmed 12 `race_day_entries` for `2025-12-15` and
  28 `insight_aggregates`.

Verified full collected-range run on `2026-06-18`:

- Command:
  `npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --from=2025-12-15 --to=2026-06-15 --require-supabase`
- Supabase ingestion run id: `3c479fbe-69a9-4500-84c5-0434927f05e5`.
- Rows written/upserted: 385 meetings, 3,809 races, 36,680 runners, 31,238
  odds snapshots, 30,536 race results, 17,505 race dividends, 3,809 race market
  states, 3,809 `race_day_entries`, 756 `insight_aggregates`, and 183
  `source_fetches` rows.
- Read-back count check confirmed 3,809 `race_day_entries` for
  `2025-12-15` through `2026-06-15` and 756 `insight_aggregates`.
- Follow-up on `2026-06-18`: the first full backfill only inserted
  starter-count and price-bucket aggregate scopes because the aggregate-scope
  filter accidentally dropped rows without `starter_count`. The local script now
  keeps overall, country, course, race-code, starter-count, and price-bucket
  scopes, and supports
  `npm --workspace @feeling-gamba/ingestion run backfill:race-fixtures -- --from=2025-12-15 --to=2026-06-15 --insights-only --require-supabase`
  to upsert corrected `insight_aggregates` without rewriting race rows.

Observed for `2025-12-15` on 2026-06-15:

- TAB Form Guide returned no meetings for `2025-12-15`.
- Betcha GraphQL returned 20 source meetings for `regions: ["DOMESTIC"]`.
- Pilot-track alias filtering matched Addington greyhounds only.
- The fixture contains 12 Addington races, race-card runner rows, fixed-win
  prices, MarketMover flags, final result rows, dividends, active starter counts,
  derived `$1` fixed-win favourite return fields, bonus-bet credit fields, and
  aggregate favourite outcome summaries.
- Fixture aggregate: 12 favourite selections, 6 wins, 2 seconds, 1 third, `$12`
  total stake, `$9.24` total return, `-$2.76` profit/loss, and `0.77` average
  return per `$1` staked.
- Bonus-bet fixture aggregate: 3 bonus-bet credits for favourites finishing 2nd
  or 3rd, `$3.00` bonus face value, `$12.24` cash-plus-bonus face value,
  `$0.24` cash-plus-bonus net value, and `1.02` average cash-plus-bonus value
  per `$1` staked.
- Bonus-bet credit is tracked as face value and is not converted into
  withdrawable cash value.
- At that stage, the Expo preview mapped bundled December 2025 daily fixtures
  through `apps/mobile/src/data/collectedRaceDay.ts`; the current direction is
  to move runtime race-day data to Supabase read models.
- Other pilot tracks had no matched meeting on that date:
  Ellerslie, New Plymouth, Te Rapa, Alexandra Park, Doomben, Wingatui,
  Whanganui, and Cambridge.

Observed for `2025-12-16` to `2025-12-31` on 2026-06-15:

- Betcha GraphQL returned 381 source meetings.
- Pilot-track alias filtering matched 18 meetings and 184 races.
- Matched tracks:
  - Addington: 6 greyhound meetings, 70 races.
  - Cambridge: 4 meetings across greyhound and harness, 39 races.
  - Alexandra Park: 2 harness meetings, 22 races.
  - New Plymouth: 2 thoroughbred meetings, 15 races.
  - Whanganui: 1 greyhound meeting, 12 races.
  - Ellerslie: 1 thoroughbred meeting, 10 races.
  - Te Rapa: 1 thoroughbred meeting, 8 races.
  - Wingatui: 1 thoroughbred meeting, 8 races.
- No Doomben pilot comparison meetings matched in this range.
- Favourite aggregate for Dec 16-31:
  - 189 favourite selections, 85 wins, 29 seconds, 21 thirds.
  - `$189.00` staked, `$174.50` cash returned, `-$14.50` cash net.
  - `$50.00` bonus-bet credit, `$224.50` cash-plus-bonus face value,
    `$35.50` cash-plus-bonus net.
  - Cash average return: `0.923`; cash-plus-bonus average value: `1.188`.
- At that stage, the Expo preview bundled all local December daily fixtures from
  `apps/mobile/src/data/fixtures/pilot-tracks-2025-12-15.json` through
  `apps/mobile/src/data/fixtures/pilot-tracks-2025-12-31.json`.
- Full local December aggregate, Dec 15-31:
  - 201 favourite selections, 91 wins, 31 seconds, 22 thirds.
  - `$201.00` staked, `$183.74` cash returned, `-$17.26` cash net.
  - `$53.00` bonus-bet credit, `$236.74` cash-plus-bonus face value,
    `$35.74` cash-plus-bonus net.
  - Cash average return: `0.914`; cash-plus-bonus average value: `1.178`.

Observed for `2026-01-01` to `2026-01-31` on 2026-06-15:

- Ran `npm --workspace @feeling-gamba/ingestion run fetch:pilot-date -- --from=2026-01-01 --to=2026-01-31`.
- Output daily files:
  `data/raw/betcha-graphql/pilot-tracks-2026-01-01.json` through
  `data/raw/betcha-graphql/pilot-tracks-2026-01-31.json`.
- Output manifest:
  `data/raw/betcha-graphql/pilot-tracks-2026-01-01-to-2026-01-31.manifest.json`.
- Betcha GraphQL returned 782 source meetings.
- Pilot-track alias filtering matched 36 meetings and 357 races.
- Matched tracks:
  - Addington: 14 meetings across greyhound and harness, 158 races.
  - Whanganui: 6 meetings across greyhound and thoroughbred, 63 races.
  - Cambridge: 6 meetings across greyhound and harness, 54 races.
  - Ellerslie: 4 thoroughbred meetings, 33 races.
  - Te Rapa: 2 thoroughbred meetings, 17 races.
  - Alexandra Park: 2 harness meetings, 15 races.
  - Wingatui: 1 thoroughbred meeting, 9 races.
  - New Plymouth: 1 thoroughbred meeting, 8 races.
- No Doomben pilot comparison meetings matched in this range.
- Favourite aggregate for Jan 2026:
  - 372 favourite selections, 145 wins, 67 seconds, 50 thirds.
  - Win rate `38.98%`, 2nd rate `18.01%`, 3rd rate `13.44%`.
  - `$372.00` staked, `$318.18` cash returned, `-$53.82` cash net.
  - `$117.00` bonus-bet credit, `$0.315` bonus average per `$1` staked.
  - `$435.18` cash-plus-bonus face value, `$63.18` cash-plus-bonus net.
  - Cash average return: `0.855`; cash-plus-bonus average value: `1.170`.
- Discipline aggregates for Jan 2026:
  - Thoroughbred: 88 selections, 28 wins, `$78.70` cash returned from `$88.00`,
    `$26.00` bonus credit, cash average `0.894`, cash-plus-bonus average `1.190`.
  - Greyhound: 228 selections, 99 wins, `$198.83` cash returned from `$228.00`,
    `$74.00` bonus credit, cash average `0.872`, cash-plus-bonus average `1.197`.
  - Harness: 56 selections, 18 wins, `$40.65` cash returned from `$56.00`,
    `$17.00` bonus credit, cash average `0.726`, cash-plus-bonus average `1.029`.
- January was collected as a monthly chunk. Continue the year-to-date backfill in
  bounded month chunks before attempting one large Jan 1 to current-date run.
- The Expo preview later bundled Dec 2025 and Jan 2026 daily fixture copies via
  `apps/mobile/src/data/fixtures/localRaceFixtures.ts`. That remains useful for
  development tests, but new runtime data should be backfilled into Supabase
  instead of copied into the app bundle.

If Supabase Cron runs in UTC for the project, convert NZ schedules explicitly.
Prefer storing all race times as `timestamptz` and using `Pacific/Auckland` only
for human scheduling/reporting.

## Database Additions

The existing model is enough for race data, but ingestion will be easier with
small operational tables.

### `ingestion_runs`

One row per Edge Function invocation.

Suggested fields:

- `id uuid primary key`
- `function_name text not null`
- `triggered_by text` - `cron`, `manual`, `retry`
- `started_at timestamptz not null`
- `finished_at timestamptz`
- `success boolean`
- `summary jsonb`
- `error_message text`

### `ingestion_locks`

Lightweight lock to prevent overlapping jobs for the same date/source.

Suggested fields:

- `lock_key text primary key`
- `locked_at timestamptz not null`
- `expires_at timestamptz not null`
- `run_id uuid references ingestion_runs(id)`

Use short TTLs. If a function crashes, the next run can proceed after expiry.

### `race_market_state`

Optional derived table for fast app reads.

Suggested fields:

- `race_id uuid primary key references races(id)`
- `selected_snapshot_id uuid references odds_snapshots(id)`
- `favourite_runner_id uuid references runners(id)`
- `market_mover_runner_id uuid references runners(id)`
- `snapshot_at timestamptz`
- `source text not null`
- `updated_at timestamptz not null`

This table should be derived from `odds_snapshots`, not used as the source of truth.

### `race_day_entries`

Stored app-facing race-day read model.

Suggested fields:

- `race_id uuid primary key`
- `meeting_date date`
- `country text`
- `race_code text`
- `course_name text`
- `course_slug text`
- `race_number int`
- `advertised_start timestamptz`
- `declared_runner_count int`
- `starter_count int`
- favourite, MarketMover, winner, price, return, bonus-credit, and missing-data
  columns.

Use this table for the Race Days default latest-20-race read and filtered race-day
queries.

### `insight_aggregate_runs`

One row per insight derivation run. Store source date bounds, run summary,
success state, and error message.

### `insight_aggregates`

Stored app-facing aggregate read model for Insights and promotion signals.

Rules:

- Store scope-specific rows for overall, country, course, race code,
  country+race-code, starter-count, and price-bucket views.
- Starter-count and price-bucket rows should include country+race-code scoped
  variants for prediction model comparisons.
- The app may derive Insight country and track filter options from any stored
  aggregate rows carrying `country`, `course_name`, and `course_slug`; do not
  make filter metadata depend only on direct `country` or `course` scope rows.
- Scope filtering must only drop invalid starter-count rows with missing
  `starter_count`; overall, country, course, and race-code scopes do not carry a
  starter count and must still be stored.
- Include cash return, bonus-credit, cash-plus-bonus, denominators, and
  missing-data counts.
- Rebuild or upsert after `refresh-race-days-and-insights`, historical backfill,
  and reconciliation jobs change settled race data.
- Public app reads should use this table; source/raw normalized tables remain
  server-side.

## Idempotency Rules

- Upsert meetings by `(race_code, country, course_slug, meeting_date)`.
- Upsert races by `(meeting_id, race_number)`.
- Upsert runners by `(race_id, runner_number)`.
- Insert odds snapshots append-only, but de-dupe by
  `(race_id, runner_id, source, snapshot_at)` if retries reuse the same timestamp.
- Upsert final results by `(race_id, runner_id)`.
- Always write a `source_fetches` row for success and failure.

## Error Handling

- Record raw TAB/Form Guide/official-source responses in `source_fetches`.
- Treat schema errors as parser failures, not race failures.
- Retry failed race-card fetches on the next scheduled run.
- If TAB GraphQL fails for a race, keep Form Guide metadata and mark market state
  as missing rather than inventing favourite/MM.
- Alert manually if a target-track meeting has no successful discovery by 09:00 NZ.

## Security

- Keep TAB calls server-side only.
- Store Supabase service role key as an Edge Function secret.
- Use Row Level Security for app-facing tables; ingestion functions write through
  service role only.
- If invoking functions through Cron HTTP calls, store project URL and invocation
  token in Supabase Vault or project secrets.
- Review TAB terms before running broad or high-frequency automated jobs.

## Implementation Steps

1. Add Supabase CLI configuration and migrations.
2. Create the data model tables already outlined in `data-model.md`.
3. Add operational tables: `ingestion_runs`, `ingestion_locks`, and optionally
   `race_market_state`.
4. Implement source adapters in shared Edge Function code:
   - TAB GraphQL client
   - Betcha GraphQL client
   - TAB Form Guide parser
   - HRNZ parser
   - placeholder NZTR/GRNZ result adapters
5. Implement `discover-races`.
6. Implement `capture-market-snapshots`.
7. Implement `collect-results`.
8. Add Cron schedules.
9. Add historical backfill support from the initial collection start date
   through the current date for thoroughbred, harness, and greyhound results.
10. Add statistics derivation for favourite win, 2nd, and 3rd percentages,
    including starter-count breakdowns, and store the results in
    `insight_aggregates`.
11. Add the weekly `refresh-race-days-and-insights` job after manual missing-day
    ingestion is reliable.
12. Add fixtures and parser tests for Ellerslie 2026-05-23 and Cambridge harness
   2026-05-21.
13. Run one day in manual mode before enabling recurring schedules.
14. Run a small historical backfill sample before attempting full monthly chunks.

## Validation Plan

Planned checks:

- Unit tests for TAB GraphQL race-card parsing.
- Unit tests for TAB Form Guide race page parsing.
- Unit tests for favourite selection from fixed-win prices.
- Unit tests for `isMarketMover` mapping.
- Manual dry run for Ellerslie using 2026-05-23 race-card IDs.
- Manual dry run for Cambridge harness using 2026-05-21 result pages.
- Manual dry run for a small historical backfill window before full monthly
  chunks.
- Statistics checks for favourite win/2nd/3rd percentages and denominator counts.

Operational checks:

- Confirm each target track has a meeting row only when actually racing.
- Confirm every race has one selected pre-jump snapshot before deriving MVP stats.
- Confirm races with scratchings show different declared runner count and starter
  count where applicable.
- Confirm `source_fetches` has a row for every external request.
- Confirm races missing favourite or final result data are excluded from
  percentage denominators and counted separately.

## Sources

- Supabase scheduled Edge Functions: `https://supabase.com/docs/guides/functions/schedule-functions`
- Supabase Edge Functions: `https://supabase.com/docs/guides/functions`
- Supabase Cron: `https://supabase.com/docs/guides/cron`
- TAB GraphQL notes: `../integrations/tab-api.md`
- Betcha GraphQL notes: `../integrations/betcha-api.md`
- TAB Form Guide notes: `../integrations/tab-form-guide.md`
- Race ID discovery notes: `../integrations/race-id-discovery.md`
