# Scheduled Race Ingestion Plan

## Context

The MVP needs to capture TAB favourite and MarketMover before each race jumps,
then reconcile final results and payout data after the race settles.

Historical collection starts from a configured collection start date, initially
set at `2025-12-15` for the local backfill. Six months is only the starting
point for the first dataset, not a rolling limit on storage, filtering, or
statistics.

The Ellerslie 2026-05-23 check confirmed the preferred TAB route:

- Use TAB GraphQL `racingDay` to discover TAB `RacingRace` IDs for target meetings.
- Convert `RacingRace:<uuid>` to `RacingRaceCard:<uuid>` for live race-card data.
- Read `finalField.runnerRows[].prices` for fixed-win favourite snapshots.
- Read `finalField.runnerRows[].isMarketMover` for TAB MarketMover.
- Use TAB Form Guide as a declared-field/form-data source when GraphQL is missing
  runner counts or when comparing declared runners against current starters.

The Betcha racing detail route changed by 2026-08-14. Betcha `racingDay` still
returns `RacingRace:<uuid>` rows, but the old `node(id:
"RacingRaceCard:<uuid>")` / `RacingRaceCardSnapshot` detail query can return
HTTP 200 with an empty body. Betcha racing ingestion now calls the web-bundle
`BlackbookRaceEntrantInfo` operation against `RacingRace:<uuid>`, reads
`marketsConnection(types: [FINAL_FIELD])`, and adapts entrant rows back to the
internal race-card shape while preserving `RacingRaceCard:<uuid>` as the stored
source race-card key.

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

Australian and Hong Kong promotion coverage:

- Because TAB/Betcha racing promos can apply to Australian and Hong Kong
  thoroughbred, greyhound, and harness races, the production race-day collection
  target is all AUS, NZ, and HK domestic-region meetings returned by the source
  for `HORSE`, `HARNESS`, and `GREYHOUND`.
- On 2026-06-20 the historical and weekly race-day collectors were moved to an
  explicit `--all-domestic` / `all_domestic` coverage mode by default. The old
  configured pilot list remains available through `--pilot-tracks` only for
  small diagnostics.
- This change is intended to capture tracks previously missed by the pilot
  allow-list, including Randwick when Betcha returns a Randwick domestic
  meeting in the selected date window.
- The current completeness claim is source-backed: the collector can capture
  every AUS/NZ/HK horse, harness, and greyhound race returned by Betcha
  `racingDay(categories: [HORSE, HARNESS, GREYHOUND], regions: [DOMESTIC])`.
  It is not an independent guarantee against official-code calendars until
  reconciliation against NZTR, HRNZ, GRNZ, Australian official sources, and
  Hong Kong official sources is added.
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
uniqueness, active-starter parsing from scratched/vacant rows, AU/NZ/HK track
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
- Betcha GraphQL `BlackbookRaceEntrantInfo` with `node(id:
  "RacingRace:<uuid>")` and `marketsConnection(types: [FINAL_FIELD])`; store
  the compatible `RacingRaceCard:<uuid>` key for downstream matching.

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
- Use `--all-domestic` for normal historical backfills so all AUS/NZ/HK
  domestic-region meetings returned by the source are written to Supabase.
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
- Both implementations default to `all_domestic` coverage for AUS/NZ/HK
  domestic-region `HORSE`, `HARNESS`, and `GREYHOUND` meetings returned by
  Betcha.
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

- The Historical Data tab should request the latest 20 racing rows across
  AUS/NZ/HK from `race_day_entries` when opened with the Racing sport selected.
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

### `backfill-ufc-kaggle`

Purpose:

- Import the first five-year UFC historical baseline.
- Use the Vali Hameed UFC master Kaggle dataset as the result source.
- Fill result-only prices from the Jerzy Szocik daily UFC betting odds dataset
  when there is an exact event-date plus unordered fighter-pair match.
- Rebuild UFC favourite price, other fighter price, and price-difference
  aggregate buckets for the UFC Insights sport toggle.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run backfill:ufc-kaggle -- --master-csv=/path/to/ufc-master.csv --odds-csv=/path/to/UFC_betting_odds.csv --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run backfill:ufc-kaggle -- --master-csv=/path/to/ufc-master.csv --odds-csv=/path/to/UFC_betting_odds.csv --dry-run`
- Default date window is `2021-07-24` through `2026-07-24`.
- Operators can override the window with `--from=YYYY-MM-DD --to=YYYY-MM-DD`.

Expected writes:

- `ufc_fight_entries`
- `ufc_insight_aggregates`

Import rules:

- Convert Vali `RedOdds` and `BlueOdds` from American moneyline to decimal
  fixed-win prices.
- Keep Vali-priced rows as `price_match_status = 'master_priced'`.
- For rows missing one or both Vali odds, search daily odds by exact
  `event_date` plus unordered normalized fighter pair.
- Reduce duplicate daily odds rows by taking the latest row per `source +
  region`, then the median decimal price for each fighter.
- Store exact daily fills as `price_match_status = 'daily_exact'`.
- Leave unmatched rows as `price_match_status = 'result_only'`.
- Exclude result-only rows, equal-price fights, draws/no contests, and unknown
  winners from UFC favourite-return denominators.
- Do not use same-date word-order matches or +/- one-day date matches in
  Insights until a review workflow explicitly approves them.

Runtime app rule:

- The Historical Data tab should show a Racing/UFC sport toggle.
- The UFC view should read the latest 20 fights from `ufc_fight_entries` by
  default and query Supabase by event-date range when the user changes dates.
- Historical Data should also show a Model backtests view backed by
  `historical_multi_backtest_recommendations` and
  `historical_multi_backtest_legs`; the app displays all-time aggregate
  performance through `get_historical_multi_backtest_summary` rather than an
  individual multi history/date browser. Rebuild it with:
  `npm --workspace @feeling-gamba/ingestion run backfill:historical-multi-backtests -- --sport=all --require-supabase`.
  The rebuild must score each source date from rows strictly before that date.
- The Insights tab should show a Racing/UFC sport toggle.
- The UFC Insights view should read `ufc_insight_aggregates` and display
  favourite price, other fighter price, and price-difference breakdowns.

### `refresh-nrl-results`

Purpose:

- Load completed NRL fixture results from official NRL public match-centre data.
- Store source-specific NRL teams, players, matches, and try-scorer events.
- Store player-match appearance rows from official rosters so try-scorer
  percentage insights have a real denominator.
- Provide settlement data for future NRL fixed-win, try-scorer, and same-game
  model history.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=25 --require-supabase`
- Upcoming fixture preload:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=26 --include-fixtures --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=25 --dry-run`
- Multi-round catch-up:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --from-round=1 --to-round=25 --require-supabase`

Source rules:

- Use official NRL `draw/data` for fixture rows and final scores.
- Use each fixture's `matchCentreUrl + "data"` route for stable official
  `matchId`. Completed fixtures also return timeline events and roster-backed
  player names.
- Send explicit browser-like `User-Agent`, `Accept`, and `Referer` headers;
  the direct JSON route returned HTTP `406` without them on 2026-08-25.
- Store official NRL rows with `source = 'official_nrl'`.
- Store upcoming fixture shells as `result_status = 'pending'`.
- Keep ESPN as a fallback/cross-check only unless official NRL becomes
  unavailable.

Expected writes:

- `nrl_teams`
- `nrl_players`
- `nrl_player_match_appearances`
- `nrl_matches`
- `nrl_try_scorers`

### `refresh-nrl-market-snapshots`

Purpose:

- Capture current NRL fixed-win prices from open `Match Betting`
  markets.
- Store one `nrl_market_snapshots` row per event and snapshot time.
- Best-effort match snapshots to existing official NRL match rows by home/away
  team names, nickname suffixes, and kickoff time.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-market-snapshots -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-market-snapshots -- --dry-run --event-count=8`
- Source checks:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-market-snapshots -- --source=tab --dry-run`

Source rules:

- Query the retained market adapter with `category = RUGBY_LEAGUE` and
  `competitionSlug = nrl`.
- Use open `MATCH` events only.
- Refuse to store rows when the generated snapshot time is at or after the
  event's advertised start.
- Select the open market named `Match Betting`.
- Require non-suspended `HOME` and `AWAY` entrants with fractional odds.
- Convert fractional odds to decimal odds before storage.
- Mark a favourite only when one side has a strictly lower fixed-win price.

Expected writes:

- `nrl_market_snapshots`

Current limitation:

- The snapshot adapter can only attach `matched_nrl_match_id` when a matching
  official NRL row already exists.
- NRL try-scorer cash and true same-game cash remain blocked until enough
  source-backed player try-scorer price history or quoted SGM prices exist.

### `validate-nrl-try-scorer-markets`

Purpose:

- Run a read-only TAB NRL market probe for exact `Anytime Try Scorer` markets.
- Confirm whether upcoming match events expose priced player try-scorer entrants
  before adding write ingestion.

Initial mode:

- Manual local validation:
  `npm --workspace @feeling-gamba/ingestion run validate:nrl-try-scorer-markets -- --event-count=10 --markets-first=500 --entrants-first=60 --sample-entrants=5`

Source rules:

- Query open NRL `MATCH` events through the retained TAB market adapter.
- Use `marketsConnection(first: 500)` or pagination; smaller pages can miss the
  exact `Anytime Try Scorer` market on full match payloads.
- Treat `Anytime Try Scorer` as the source-backed player try-scorer price market
  for the current Same Game percentage model.
- Do not write Supabase rows from this validation script.

2026-08-28 finding:

- The validation run found seven exact `Anytime Try Scorer` markets across 10
  open NRL payload events, with 238 priced player entrants.
- Production capture writes those entrants with
  `refresh-nrl-try-scorer-market-snapshots` before kickoff.
- The write worker must match TAB entrant names and team roles back to official
  `nrl_player_match_appearances` rows so Same Game settlement can use official
  scorer IDs.

### `refresh-nrl-try-scorer-market-snapshots`

Purpose:

- Capture current NRL `Anytime Try Scorer` player prices from open match
  markets.
- Store one `nrl_try_scorer_market_snapshots` row per event-market-player
  selection, updating the latest captured price for that selection.
- Match events to official NRL fixture shells and match player entrants to
  official NRL player-match appearances for same-game settlement.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-try-scorer-market-snapshots -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-try-scorer-market-snapshots -- --dry-run --event-count=10 --markets-first=500 --entrants-first=60`

Source rules:

- Query open NRL `MATCH` events through the retained TAB market adapter.
- Use `marketsConnection(first: 500)` by default because smaller pages can miss
  the exact player try-scorer market.
- Refuse to store rows when the generated snapshot time is at or after the
  event's advertised start.
- Require the event to expose `Match Betting` so home/away teams can be matched
  to official NRL fixtures.
- Parse entrant labels formatted as `Player Name (Team Name)`.
- Use the entrant home/away role and parsed team name to match against
  `nrl_player_match_appearances`; unresolved player IDs are retained for audit
  but cannot settle same-game scorer outcomes.

Expected writes:

- `nrl_try_scorer_market_snapshots`

### `refresh-nrl-current-markets`

Purpose:

- Run the regular pre-match NRL market collection flow in one operator command.
- Capture fixed-win `Match Betting` snapshots and `Anytime Try Scorer` player
  price snapshots from the same open-event window.
- Reconcile fixed-win rows, rebuild same-game multi tracking rows, rebuild NRL
  Insights, and regenerate current NRL single predictions.

Initial mode:

- Scheduled GitHub Actions workflow:
  `.github/workflows/nrl-market-refresh.yml`
- Scheduled command:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-current-markets -- --require-supabase`
- Manual fixture preload plus market capture:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-current-markets -- --season=2026 --round=26 --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run refresh:nrl-current-markets -- --dry-run --event-count=10`

Source rules:

- The recurring run scans open NRL market events and assumes official fixture
  shells/player appearances have already been loaded for the relevant round.
- The GitHub Actions schedule runs every 15 minutes during the usual NRL match
  window so current fixed-win and try-scorer prices are captured before
  advertised kickoff.
- Passing `--season` plus `--round` or `--from-round` / `--to-round` preloads
  official fixture shells before market capture.
- The job runs fixed-win capture before try-scorer capture, then reconciles and
  rebuilds the same-game/insight/prediction read models.
- Recurring schedules are useful only while markets are open before kickoff; a
  match that closes before player prices are captured will remain
  `missing_price` in the same-game audit.

Expected writes:

- `nrl_market_snapshots`
- `nrl_try_scorer_market_snapshots`
- `nrl_fixed_win_snapshot_results`
- `nrl_same_game_multi_results`
- `nrl_insight_aggregates`
- `nrl_single_predictions`

### `reconcile-nrl-fixed-win`

Purpose:

- Convert stored NRL fixed-win snapshots into explicit result/status
  rows.
- Match snapshots to official NRL result rows through `matched_nrl_match_id`.
- Store `$1` fixed-win returns for home, away, and favourite selections once a
  matched official result is settled.
- Preserve pending, unmatched, missing-result, draw, and non-standard statuses
  for auditability.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run reconcile:nrl-fixed-win -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run reconcile:nrl-fixed-win -- --dry-run --limit=200`

Source rules:

- Use `nrl_market_snapshots` as the price source of truth.
- Use official `nrl_matches` rows as the settlement source of truth.
- Do not infer settled outcomes for snapshots that are not attached to an
  official NRL match row.
- Keep pending and unresolved rows out of settled return denominators.

Expected writes:

- `nrl_fixed_win_snapshot_results`

### `rebuild-nrl-insight-aggregates`

Purpose:

- Rebuild app-facing NRL Insights rows from stored fixed-win snapshot results,
  official NRL matches, player appearances, and try events.
- Store fixed-win single performance for favourites, home/away sides, price
  buckets, seasons, and rounds.
- Store try-scorer percentage rows from player-match appearances and official
  try events.
- Store try-scorer price-bucket rows from captured `Anytime Try Scorer` prices
  and official try-scorer settlement.
- Store same-game multi percentage rows from `nrl_same_game_multi_results` once
  player try-scorer price snapshots exist.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run rebuild:nrl-insight-aggregates -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run rebuild:nrl-insight-aggregates -- --dry-run`

Source rules:

- Fixed-win cash metrics use reconciled current-market snapshot rows only.
- Try-scorer percentages use official NRL appearance rows as the denominator
  and official try events as the numerator.
- Try-scorer overall/player/team rows remain percentage-only. Try-scorer
  price-bucket rows use source-backed player try-scorer prices and can populate
  $1 return metrics once settled.
- Fixed-win price-bucket rows use both home and away fixed-win selections, not
  team-specific rows.
- Fixed-win team and same-game team scopes are no longer generated for the
  app-facing NRL Insights view.
- Same-game multi percentage uses the stored model
  `nrl_favourite_top2_try_scorers_same_game_percentage_v1`: pre-game favourite
  team fixed win plus the two shortest-priced favourite-team try scorers.
  Returns are estimated by multiplying the three fixed-leg prices and must not
  be labelled as true bookmaker same-game cash.
- Pending, unmatched, and missing-result rows are counted for auditability but
  excluded from settled win-rate and return denominators.

Expected writes:

- `nrl_insight_aggregates`

### `rebuild-nrl-same-game-multis`

Purpose:

- Build historical NRL same-game multi tracking rows for the favourite team
  plus the two shortest-priced favourite-team try scorers.
- Preserve one row per fixed-win favourite snapshot result, including
  `missing_price` rows while player try-scorer price snapshots are unavailable.
- Provide the source rows consumed by NRL Insights -> Multis -> Same Game %.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run rebuild:nrl-same-game-multis -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run rebuild:nrl-same-game-multis -- --dry-run`

Source rules:

- Fixed-win favourite prices come from reconciled
  `nrl_fixed_win_snapshot_results`.
- When both unmatched and later matched fixed-win rows exist for the same source
  event, prefer the matched row so stale unmatched rows do not duplicate the
  Same Game denominator.
- Try-scorer prices must come from source-backed
  `nrl_try_scorer_market_snapshots`.
- Official NRL try-scorer rows settle whether the two selected players scored.
- Until player try-scorer prices are captured, rows are written as
  `missing_price` and excluded from settled return denominators.

Expected writes:

- `nrl_same_game_multi_results`

### `generate-nrl-single-predictions`

Purpose:

- Generate persisted current NRL single prediction rows for the NRL Predictions
  branch.
- Rank current fixed-win favourites from `Match Betting` markets by
  official 2026 team win percentage.
- Rank likely try-scorer candidates by official 2026 player/team
  appearance-to-try percentage.

Initial mode:

- Manual local worker:
  `npm --workspace @feeling-gamba/ingestion run generate:nrl-single-predictions -- --require-supabase`
- Dry-run validation:
  `npm --workspace @feeling-gamba/ingestion run generate:nrl-single-predictions -- --dry-run`

Source rules:

- Fixed-win percentage predictions use current favourite prices and
  official NRL season-to-date team results.
- Try-scorer percentage predictions use official player/team aggregate rows and
  upcoming official match shells. They must be labelled as
  `historical_team_roster` until current official lineups are validated.
- Do not generate NRL cash-win predictions from historical fixed-win results
  until enough settled current-market snapshots exist.
- Do not generate NRL try-scorer cash predictions until source-backed player
  try-scorer prices are captured.

Expected writes:

- `nrl_single_predictions`

Current result:

- The first live write generated 64 NRL single prediction rows for the current
  source date: 16 fixed-win percentage singles and 48 try-scorer percentage
  singles.

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

- Scan Betcha current race cards for all NZ/AUS/HK domestic-region meetings
  returned by the source independently of active promotions.
- Derive current favourite, fixed-win price, starter count, MarketMover, and
  missing-price state.
- Attach historical starter-count, price-bucket, distance-band,
  track-condition, other-starters average fixed-win price, cash, and
  cash-plus-bonus statistical signals from stored `insight_aggregates`.
- Rank bet-back candidates by country, discipline, and model, including
  `global_bucket_cash_blend_v1`, `global_bucket_cash_even_blend_v1`,
  `global_bucket_cash_price_only_v1`, and
  `global_bucket_cash_starter_only_v1`, and
  `global_other_starters_average_price_cash_v1`.
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
- Predictions reads `current_prediction_snapshots` for the current Auckland
  source date. The app can call an optional backend refresh endpoint configured
  as `EXPO_PUBLIC_PREDICTION_REFRESH_URL`; that endpoint must run server-side
  with source access and Supabase service-role secrets, never from Expo.
- If the app's automatic stale-cache refresh fails while a same-day prediction
  snapshot is available, Predictions keeps rendering the cached snapshot and
  shows the refresh error as context instead of hiding the candidates.
- Prediction outcome reconciliation prefers stored runner/result rows, but can
  settle Betcha prediction rows from the race row's compact `resultsSummary`
  when post-event race-card responses omit entrants. This keeps final races with
  top-three summary data from being stranded as `missing_runner`; genuinely
  abandoned races with no result summary remain missing.
- The backend refresh endpoint is scaffolded as the
  `refresh-current-predictions` Supabase Edge Function under
  `supabase/functions/refresh-current-predictions`.
- `refresh-current-predictions` reads historical signal rows from stored
  `insight_aggregates`, fetches fresh public Betcha current race-card data,
  determines the first eligible advertised start in the all-domestic NZ/AUS/HK
  prediction coverage, and upserts `current_prediction_snapshots` only when the
  request was generated before that first race started.
- The same endpoint accepts a sport-scoped JSON body for app-triggered refreshes.
  `{ "sport": "racing" }` refreshes only racing current predictions and keeps
  any existing UFC snapshot payload, while `{ "sport": "ufc" }` refreshes only
  UFC insight aggregates/current Betcha fight-card markets, updates UFC multis
  in `current_prediction_snapshots`, and writes UFC multi recommendation rows
  plus UFC single prediction rows without rebuilding racing prediction
  aggregates. `{ "sport": "pfl" }` refreshes only PFL insight aggregates and
  current fixed-win MMA odds, then writes the PFL section of
  `current_prediction_snapshots` only after current fighter pairs match the
  reviewed PFL event allow-list.
- UFC current prediction payloads include per-model single candidates for the
  favourite price, other fighter price, and price-difference historical bucket
  models, plus 65%+, 75%+, and 85%+ threshold single models based on each fight's
  strongest qualifying UFC bucket signal. These singles are persisted to
  `ufc_single_predictions` so Prediction History can track $1 unit-stake
  results over time.
- PFL uses the same visible Singles/Multis -> Win % hierarchy and model tab
  shape as UFC. Current PFL prediction generation reads The Odds API current MMA
  H2H prices only when an odds event matches the reviewed PFL allow-list by
  event date and unordered fighter pair. PFL prediction history persistence
  remains reserved until PFL-specific tables/RPCs are added. Do not write PFL
  rows into UFC-specific history tables.
- PFL historical backfill must pass the source proof documented in
  `docs/integrations/pfl-data-sources.md` before migrations or importer code are
  added. As of 2026-08-26, Betcha can only be treated as a forward current-market
  snapshot candidate when PFL cards are open; it is not a historical PFL
  backfill source. A PFL backfill needs source-backed fixed-win prices joined to
  settled fight winners before `pfl_fight_entries` / `pfl_insight_aggregates`
  are created.
- The first PFL seed path creates `pfl_fight_entries` and
  `pfl_insight_aggregates` with
  `supabase/migrations/202608260001_pfl_historical_data_and_insights.sql`, then
  imports the source-backed PFL New York July 31, 2026 seed with:
  `npm --workspace @feeling-gamba/ingestion run backfill:pfl-seed -- --require-supabase`.
  The seed intentionally includes only the eight Bookmakers Review priced fights
  in PFL favourite-return insights; the ninth fight is stored as result-only
  because no fixed-win price was captured from the indexed odds page.
- PFL current predictions must stay empty until current MMA odds match the
  reviewed PFL allow-list. The 2026-08-26 The Odds API current MMA proof
  returned prices for generic MMA fights but no organisation label and no
  matches against the reviewed PFL card/fighter allow-list, so those rows were
  not treated as PFL predictions.
- The scheduled GitHub Actions current-prediction workflow calls the endpoint
  by sport, currently racing and UFC. Add `{ "sport": "pfl" }` to that workflow
  after `ODDS_API_KEY` is configured in the deployed Edge Function environment,
  so slow source scans for one sport do not make the combined request hit the
  Supabase Edge request idle timeout.
- Racing current-card detail fetches use bounded concurrency when scanning
  domestic NZ/AUS/HK race cards so large mornings do not spend the whole Edge
  request on sequential Betcha race-card calls.
- After the selected sport's standard finalisation cutoff has passed,
  `refresh-current-predictions` returns the same-day cached pre-finalisation
  snapshot when one exists. It must not write a new snapshot, upsert
  `promotion_predictions`, or rebuild `prediction_aggregates` for that sport.
- If Betcha returns a racing meeting list but every race-card detail request
  fails, treat the run as a source failure and skip racing snapshot,
  prediction-row, and multi-row writes. This prevents an empty candidate payload
  from replacing the current usable prediction snapshot.
- The prediction refresh stores Betcha bet-back candidate predictions in
  `promotion_predictions`. The unique key is
  `(prediction_model, source, source_race_card_id)` so model variations can run
  in parallel on the same race card. Existing rows are replaced only when the
  prediction signature changes, such as favourite, fixed-win price, starter
  count, rank, model score, or signal changing.
- The racing refresh also writes `single_win_percentage_60_plus_v1` and
  `single_win_percentage_65_plus_v1` rows for every current favourite with a
  blended historical win score at or above the selected threshold. These are
  stored as single-runner prediction rows, not multi recommendations, so
  Prediction History can answer whether a flat `$1` stake on every threshold
  win-rate single is profitable over time.
- After storing pre-finalisation predictions, the prediction refresh rebuilds
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
- The worker should run once each morning before the first expected eligible NZ
  or AU race. Manual/app-triggered refreshes are allowed, but the server-side
  first-race guard prevents late-day writes from polluting prediction
  performance.

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
- For Betcha bet-back candidates, scan all NZ/AUS/HK domestic-region meetings
  returned by the source. The old pilot-track list remains useful for
  diagnostics and known alias handling, but it is not the prediction coverage
  boundary.
- Derive each candidate favourite from the current shortest fixed-win price.
- The current default prediction model ranks candidates by a blended historical
  cash-plus-bonus average: 65% favourite price bucket and 35% final
  starter-count bucket using global history.
- The global cash bucket blend ranks candidates with 65% favourite price-bucket
  cash average and 35% starter-count cash average, excluding bonus-credit value.
- The global cash 50/50 blend ranks candidates with 50% favourite price-bucket
  cash average and 50% starter-count cash average, excluding bonus-credit value.
- The global cash price-only variation ranks candidates with 100% favourite
  price-bucket cash average, excluding bonus-credit value.
- The global cash starter-count-only variation ranks candidates with 100% final
  starter-count cash average, excluding bonus-credit value.
- The other-starters average price variation ranks candidates with 100% of the
  matching bucket's cash average for the average fixed-win price of all other
  priced starters. Prices at `$70.00` or above are excluded from that average
  and counted separately so outlier handling is visible.
- Keep the metric implementation ready for `median_other_fixed_win_price` as a
  follow-up signal; do not treat the average as the final field-shape measure if
  one or two long-priced outsiders are distorting results.
- The country+discipline model ranks the same source-backed favourites using
  country+discipline buckets where available, with each bucket value shrunk
  toward the matching global bucket value before the same 65%/35% blend.
- The distance+condition model ranks the same favourites with a conservative
  country+discipline blend of 45% price bucket, 25% starter-count bucket, 20%
  distance-band bucket, and 10% track-condition bucket, each shrunk toward the
  matching broader bucket where available.
- The 65%+ win single model uses the win-percentage signal, not cash return:
  65% favourite price-bucket win rate and 35% starter-count win rate. It writes
  all priced favourites whose blended score is `>= 65` as separate single
  outcomes.
- Group candidate rankings by country and discipline, keeping at most five
  candidates per country/discipline group.
- Order each prediction variation by that variation's model-specific
  `cashAverageScore`. Cash-plus-bonus values can be retained for supporting
  context, but must not drive recommendations.
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
| `refresh-race-days-and-insights` | active: daily GitHub Actions schedule `10 18 * * *` UTC | `refresh-race-days-and-insights` | Refreshes the latest 4 completed Auckland source dates as one request per date/country/category slice, then runs separate aggregate and reconciliation requests. |
| `refresh-current-promotions` | daily, for example `0 7 * * *` NZ time, plus optional manual/app-triggered stale refreshes | `refresh-current-promotions` | Refreshes current public racing promotion cache. Function skips unnecessary source calls when cache is fresher than 15 minutes. |
| `refresh-current-predictions` | active: daily GitHub Actions schedules `35 17 * * *` and `35 18 * * *` UTC; optional Supabase Cron backup `35 17,18 * * *` UTC | `refresh-current-predictions` | Captures the daily pre-finalisation prediction snapshot without waiting for an app open, writes racing model variants including the global cash blends, and refuses to write late refreshes after the selected sport's standard finalisation cutoff has passed. The scheduled workflow invokes racing and UFC as separate sport-scoped requests so one sport cannot consume the whole Edge timeout budget. App-triggered scoped UFC/PFL refreshes can refresh fight-card predictions independently before cutoff. Normalized prediction rows and tracked multi rows must be written before `current_prediction_snapshots` so Predictions and Prediction History share the same generated payload. |
| `send-prediction-finalised-notifications` | optional Supabase Cron every 5 minutes | `send-prediction-finalised-notifications` | Checks user-favourited prediction models for the current Auckland source date, confirms the selected model has active current predictions after its sport finalisation timestamp, creates idempotent notification events, and sends neutral Expo push notifications to stored user push tokens. Use `supabase/sql/schedule-prediction-finalised-notifications.sql` after creating the `prediction_notification_admin_token` Vault secret and matching `PREDICTION_NOTIFICATION_ADMIN_TOKEN` Edge Function secret. |
| `refresh-ufc-results` | active: daily GitHub Actions schedule `30 21 * * *` UTC | `refresh:ufc-results` and `reconcile:ufc-predictions` | Loads completed UFC fight-result rows from ESPN's public UFC scoreboard as result-only rows, then reconciles UFC multi recommendation outcomes against `ufc_fight_entries`. |
| `refresh-nrl-results` | manual only until NRL model generation exists | `refresh:nrl-results` | Loads completed NRL official fixture, match result, roster, and try-scorer rows for an explicit season/round or round range. |
| `refresh-nrl-current-markets` | active: GitHub Actions `*/15 4-11 * * 4,5,6,0` UTC during usual NRL match windows | `refresh:nrl-current-markets` | Captures open NRL fixed-win and anytime try-scorer prices before advertised kickoff, reconciles fixed-win snapshots, rebuilds same-game rows and NRL Insights, and regenerates NRL single predictions. |
| `refresh-nrl-market-snapshots` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `refresh:nrl-market-snapshots` | Captures open NRL `Match Betting` fixed-win prices into `nrl_market_snapshots`. |
| `validate-nrl-try-scorer-markets` | manual validation only | `validate:nrl-try-scorer-markets` | Read-only probe for TAB NRL `Anytime Try Scorer` markets and priced player entrants before adding write ingestion. |
| `refresh-nrl-try-scorer-market-snapshots` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `refresh:nrl-try-scorer-market-snapshots` | Captures current NRL `Anytime Try Scorer` player prices and matches them to official player appearances. |
| `reconcile-nrl-fixed-win` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `reconcile:nrl-fixed-win` | Converts NRL fixed-win snapshots into explicit result/status rows once official NRL fixture rows are available. |
| `rebuild-nrl-same-game-multis` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `rebuild:nrl-same-game-multis` | Builds NRL favourite-team same-game multi result rows from fixed-win favourites plus source-backed top-two try-scorer prices. |
| `rebuild-nrl-insight-aggregates` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `rebuild:nrl-insight-aggregates` | Rebuilds NRL fixed-win single, try-scorer percentage, and same-game percentage aggregate rows for the NRL Insights sport toggle. |
| `generate-nrl-single-predictions` | called by `refresh-nrl-current-markets`; manual diagnostics remain available | `generate:nrl-single-predictions` | Generates current NRL fixed-win percentage and try-scorer percentage single prediction rows for Predictions. |

Notification work parked on 2026-08-28:

- Implemented local notification schema, Expo token registration, model favourite UI, sender Edge Function, and Supabase Cron SQL.
- Created/updated `prediction_notification_admin_token` in Supabase Vault and set matching `PREDICTION_NOTIFICATION_ADMIN_TOKEN` as an Edge Function secret.
- Manual dry-run call to `send-prediction-finalised-notifications` returned `{"dryRun":true,"eventCount":0,"events":[],"sourceDate":"2026-08-28","targetDeliveryCount":0}`.
- Remaining deployment/testing: apply/deploy any unpushed code if needed, build a new native app because `expo-notifications` is a native dependency, sign in on device, enable `Notify when finalised`, confirm `user_push_tokens` and `user_favourite_prediction_models` rows, then observe the scheduled cron after a favourited model finalises.

Historical backfill should start as a manual run in bounded chunks. Add a
recurring schedule only after source terms, runtime, and parser reliability are
confirmed.

The daily race-day refresh is deployed as `refresh-race-days-and-insights` and
scheduled through `.github/workflows/overnight-race-refresh.yml`. The workflow
calls the hosted Edge Function at `18:10` UTC, which is early morning in New
Zealand. The scheduled run uses a 4-day completed Auckland-date lookback, but it
does not send that as one large Edge Function request. Instead, it loops over
each completed source date and calls the hosted function with `from` and `to`
set to that date. Each date is further sliced by country (`NZ`, `AUS`, `HK`)
and source category (`HORSE`, `HARNESS`, `GREYHOUND`). These source-fetch chunks
use `refreshRaceData: true`, `rebuildInsights: false`, and
`reconcileOutcomes: false`. After all source slices finish, the workflow
rebuilds insights locally in the GitHub runner with
`npm --workspace @feeling-gamba/ingestion run rebuild:insight-aggregates`,
then runs separate hosted requests for promotion-prediction outcome
reconciliation, multi-bet recommendation reconciliation, user race-bet
reconciliation, and prediction aggregate rebuild. UFC result loading and UFC
multi recommendation reconciliation are handled by the separate
`.github/workflows/ufc-result-refresh.yml` workflow so UFC source checks do not
depend on the racing overnight schedule. The split is required because the combined final
aggregate/reconcile request started hitting Supabase's 150 second request idle
timeout as the stored data set grew, and the all-history insight rebuild later
hit Supabase Edge's CPU limit even after paging memory use. The local insight
rebuild still pages through stored `race_day_entries` and accumulates aggregate
buckets incrementally, but runs outside the Edge worker CPU budget. Manual
workflow dispatch can use a larger lookback, up to 14 completed Auckland dates,
for catch-up runs such as recovering data after the app only shows race days
through `2026-06-21`.

2026-08-28 operational note: GitHub Actions did not create the expected
scheduled overnight race refresh for the 2026-08-27 source date. A manual
workflow dispatch with `lookback_days=1` wrote the race data and rebuilt
insights, but the hosted prediction reconciliation request hit Supabase Edge's
150 second idle timeout before multi reconciliation. The local
`npm --workspace @feeling-gamba/ingestion run reconcile:predictions -- --require-supabase`
pass completed the pending settlement. Keep reconciliation split or date-scoped
before relying on the hosted all-pending reconciliation path for large backlogs.

The UFC result refresh is deployed as `.github/workflows/ufc-result-refresh.yml`.
It runs daily at `21:30` UTC, scans the latest 14 UTC scoreboard dates using
ESPN's public UFC scoreboard, upserts completed fights into
`ufc_fight_entries`, and then runs
`npm --workspace @feeling-gamba/ingestion run reconcile:ufc-predictions`.
Imported ESPN rows are settlement-only: they set `price_match_status` to
`result_only`, mark prices missing, and are excluded from UFC Insights. Manual
dispatch can increase the lookback to 30 days for catch-up runs or run dry mode
to verify source coverage without writing.

The NRL result refresh is implemented as a manual local worker in
`packages/ingestion/scripts/refresh-nrl-results-from-official.mjs`. It requires
an explicit `--season` and either `--round` or `--from-round` / `--to-round`.
The first live dry run against 2026 round 25 parsed 8 completed matches, 16
teams, 304 players, and 80 try-scorer rows. As of the NRL Insights update, the
worker also writes `nrl_player_match_appearances` from official roster rows.
A 2026 round 26 `--include-fixtures` write loaded 8 pending fixture shells and
16 teams. Keep it manual until NRL model generation and operational scheduling
rules are implemented.
The first completed-season backfill for 2026 rounds 1-25 wrote 188 settled
matches, 7,143 player-match appearances, 520 players, 17 teams, and 1,570
try-scorer rows.

The NRL market snapshot refresh is implemented as a manual local worker in
`packages/ingestion/scripts/refresh-nrl-market-snapshots-from-tab.mjs`.
The initial two-source validation found TAB and Betcha returned the same
current NRL events and prices. Betcha was removed from the NRL path on
2026-08-25 to avoid duplicate current-market rows, and the app-facing Insights
and Predictions branches no longer expose source/provider labels. Keep the
snapshot worker manual until NRL fixed-win prediction selection and scheduling
rules are implemented.

The NRL fixed-win reconciler is implemented as a manual local worker in
`packages/ingestion/scripts/reconcile-nrl-fixed-win-snapshots.mjs`. The first
live Supabase write produced 32 status rows: 16 pending rows for the round 26
snapshots matched to official fixture shells, and 16 unmatched rows for the
earlier audit snapshot captured before fixture preload. No settled returns were
available yet because the loaded fixed-win markets were for upcoming fixtures.

The NRL insight aggregate rebuild is implemented as a manual local worker in
`packages/ingestion/scripts/rebuild-nrl-insight-aggregates.mjs`. It writes
`nrl_insight_aggregates` for fixed-win singles and try-scorer percentages.
Try-scorer percentage rows require `nrl_player_match_appearances`, so completed
rounds loaded before that table existed should be refreshed once after the
migration is applied. Try-scorer cash and same-game cash insights remain blocked
until source-backed player try-scorer prices or quoted SGM prices are
validated.
After the completed 2026 rounds 1-25 backfill, the rebuild wrote 1,135
aggregate rows: 46 fixed-win rows and 1,089 try-scorer percentage rows from
7,143 player appearances and 1,570 try events. The rebuild source read included
196 NRL matches because the database also contained 8 pending round 26 fixture
shells. The later NRL source simplification removed provider-specific aggregate
scopes from app-facing Insights.

If a current prediction snapshot exists but its tracked prediction rows were not
written, replay the saved payload with
`npm --workspace @feeling-gamba/ingestion run repair:prediction-snapshot -- --source-date=YYYY-MM-DD --require-supabase`.
The replay rewrites `promotion_predictions`, `multi_bet_recommendations`,
`ufc_multi_recommendations`, and `ufc_single_predictions`, reconciles outcomes
unless `--skip-reconcile` is passed, and rebuilds `prediction_aggregates`.
If only one model's aggregate rows are missing, rebuild that model without
scanning every prediction model:
`npm --workspace @feeling-gamba/ingestion run rebuild:prediction-aggregates -- --prediction-model=single_win_percentage_65_plus_v1 --require-supabase`.
If historical single win-percentage rows need to be recovered from already
stored threshold multi legs, run
`npm --workspace @feeling-gamba/ingestion run backfill:single-win-percentage -- --threshold=60 --require-supabase`
or
`npm --workspace @feeling-gamba/ingestion run backfill:single-win-percentage -- --threshold=65 --require-supabase`
and then rebuild the same model-scoped aggregates. This backfill only recovers
the runners that were persisted as matching threshold multi legs, so it does not
reconstruct any uncaptured candidates beyond the multi-leg storage cap.
If historical UFC Singles -> Win % rows need to be recovered from already
stored UFC same-card multi legs, run
`npm --workspace @feeling-gamba/ingestion run backfill:ufc-singles-from-multis -- --require-supabase`.
The UFC backfill writes `ufc_single_predictions` rows keyed by the same UFC
percentage model, source date, card, and event as the stored multi leg; it skips
existing single rows unless `--replace-existing` is passed.
For UFC threshold single models, run
`npm --workspace @feeling-gamba/ingestion run backfill:ufc-singles-from-multis -- --threshold=65 --require-supabase`
or
`npm --workspace @feeling-gamba/ingestion run backfill:ufc-singles-from-multis -- --threshold=75 --require-supabase`.
For the stricter 85% threshold model, run
`npm --workspace @feeling-gamba/ingestion run backfill:ufc-singles-from-multis -- --threshold=85 --require-supabase`.
These threshold backfills write `ufc_single_win_percentage_65_plus_v1`,
`ufc_single_win_percentage_75_plus_v1`, or
`ufc_single_win_percentage_85_plus_v1` rows and keep the strongest qualifying
stored UFC multi-leg signal per model/source date/card/event.

Deploy `refresh-race-days-and-insights` after merging changes to the slice
request body. If the workflow is updated before the Edge Function is redeployed,
the hosted function will ignore new `countries`, `categories`,
`refreshRaceData`, granular reconcile flags, and `reconcileOutcomes` fields and
can still time out on all-domestic requests or combined final phases.

The daily prediction refresh is deployed as `refresh-current-predictions` and
scheduled through `.github/workflows/current-prediction-refresh.yml`. The
workflow calls the hosted Edge Function at `17:35` and `18:35` UTC, which is
early morning in New Zealand, so current prediction snapshots are captured even
when nobody opens the app. Each scheduled run invokes the function once for
`sport: "racing"` and once for `sport: "ufc"` rather than sending one combined
refresh request. The second run is a backup and can replace the same Auckland
source-date racing snapshot before the first eligible race if prices or fields
changed. If both scheduled racing runs miss the pre-race window and no same-day
cached racing snapshot exists, the workflow fails instead of silently creating
late-day prediction data.

Supabase Edge Function limits are a practical constraint: request idle timeout
is 150 seconds, with a 150 second Free plan / 400 second Paid plan worker
wall-clock limit. Keep the scheduled window bounded and review logs before
expanding the lookback.

Required GitHub repository secrets for the overnight workflow:

- `SUPABASE_PROJECT_REF`
- `RACE_DAY_REFRESH_ADMIN_TOKEN`
- `FEELING_GAMBA_SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` for the
  local GitHub Actions insight aggregate rebuild

The same `RACE_DAY_REFRESH_ADMIN_TOKEN` value must also be configured as a
Supabase Edge Function secret for `refresh-race-days-and-insights`.

Troubleshooting:

- If the workflow returns `401` with `Unauthorized refresh request.`, the
  `RACE_DAY_REFRESH_ADMIN_TOKEN` GitHub repository secret is missing or does not
  match the Supabase Edge Function secret of the same name.
- Set or rotate the Supabase-side value with
  `npx supabase secrets set RACE_DAY_REFRESH_ADMIN_TOKEN=<same-token> --project-ref <project-ref>`.
- If the workflow returns `504` with `IDLE_TIMEOUT` or `546` with
  `WORKER_RESOURCE_LIMIT`, reduce the manual `lookback_days` and confirm the
  latest `refresh-race-days-and-insights` Edge Function and
  `.github/workflows/overnight-race-refresh.yml` have both been deployed from
  the latest commit. The workflow chunks by date, country, source category, and
  final reconciliation task, and the insight rebuild should run in GitHub
  Actions rather than the hosted Edge Function.
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

Optionally apply `supabase/sql/schedule-refresh-current-predictions.sql` after
replacing the project ref and bearer token to add a Supabase Cron backup for the
same morning prediction refresh window.

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
