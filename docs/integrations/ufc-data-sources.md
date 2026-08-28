# UFC Data Source Validation

## Status

Validation date: 2026-07-24.

UFC support should start with a five-year historical window, currently
`2021-07-24` through `2026-07-24`, rather than all available source history.
This keeps the first import broad enough for useful statistics without pulling
older UFC eras into the first app-facing baseline.

Implementation status on 2026-07-24: the first import path is implemented in
`packages/ingestion/scripts/backfill-ufc-kaggle-to-supabase.mjs`, with schema in
`supabase/migrations/202607240002_ufc_historical_data_and_insights.sql`. The app
has a Racing/UFC sport toggle in Historical Data and Insights. A dry run against
the downloaded Kaggle files produced 2,534 UFC fight rows, 1,497
`master_priced` rows, 443 `daily_exact` fills, 594 `result_only` rows, 1,940
source-backed priced rows, and 1,918 rows eligible for favourite-return
Insights after excluding equal-price and non-standard-result cases.

UFC price-based Insights must use source-backed price rows only. Result-only
fights can appear in Historical Data with explicit missing-price state, but they
must not feed favourite price, other fighter price, price-difference, or `$1`
favourite-return denominators.

## Required Data

The five-year UFC backfill needs one row per settled two-fighter contest with:

- event date and event name;
- source event and fight identifiers where available;
- both fighter names and stable source fighter identifiers where available;
- pre-fight or closing fixed win prices for both fighters;
- derived favourite as the lower fixed win price;
- derived other fighter fixed price;
- derived price difference as `other_fighter_fixed_price - favourite_fixed_price`;
- final winner and result status;
- source, bookmaker, price timestamp, and raw payload reference.

Draws, no contests, cancelled fights, missing results, and equal-price markets
must be stored as explicit non-standard states and excluded from favourite
return denominators unless a future requirement says otherwise.

## Candidate Sources

| Source | Findings | Verdict |
| --- | --- | --- |
| Kaggle `UFC Betting Odds (Daily Updated Dataset)` | Public Kaggle metadata says the dataset is CC0 licensed, updated daily, and contains head-to-head UFC/MMA moneyline snapshots with event dates, collection timestamps, bookmaker source, and region. Local file inspection of version 216, updated 2026-07-18, found one `UFC_betting_odds.csv` with `fight_url`, fighter URLs/names, decimal `odds_1`/`odds_2`, method odds, `event_date`, `adding_date`, `source`, and `region`. In the five-year window it has 185,055 nonblank odds rows across 2,962 unique date+fighter-pair keys. It exactly matches 443 of the Vali Hameed master dataset's 1,037 result-only rows, and a further 95 rows are conservative review candidates using same-date fighter-name word-order matching or +/- one-day event-date matching. | Preferred source for filling missing recent prices in the five-year UFC import. Use exact date+fighter-pair joins automatically; keep +/- one-day and reordered-name matches behind a review flag. |
| Kaggle `UFC Master Dataset: Fights, Stats, and Odds` by Vali Hameed | Public Kaggle metadata says the dataset is MIT licensed, updated on 2026-07-17, has one `ufc-master.csv`, and combines UFCStats-derived fight data with historical American moneyline odds in `RedOdds` and `BlueOdds`. Local file inspection found 7,327 dated rows from 2010-03-21 through 2026-07-11, with `RedFighter`, `BlueFighter`, `Date`, `Winner`, `Finish`, `RedOdds`, and `BlueOdds`. For the five-year window `2021-07-24` through `2026-07-24`, the file has 2,534 fights; 1,497 have both red/blue odds and 1,037 are result-only. Odds are populated through 2024-12-07, while 2025 and 2026 rows have blank red/blue odds in the downloaded version. | Useful first import source for five-year UFC Historical Data and priced Insights through 2024-12-07. Result-only 2025/2026 rows should be stored with missing-price state or filled from the daily odds dataset/Betcha forward snapshots before they contribute to price-based Insights. |
| The Odds API | Official MMA/UFC page lists `mma_mixed_martial_arts`, `h2h` fight-winner odds, decimal odds support, and historical MMA/UFC odds on paid plans. Current API docs list `/historical/odds` as Business-only, with standard markets including MMA and a documented archive start of 2026-05-13. This conflicts with the MMA page's broader "from June 2020" claim, so five-year availability must be checked with a Business key. | Best odds-only fallback if a Business key confirms coverage for the required five-year window and selected bookmakers. Likely still needs a result source or a separate settlement check. |
| SportsDataIO MMA | Official data dictionary includes schedules/events, fight details, winner/result fields, fighter moneyline fields, event fight odds, and event fight odds line movement. It also provides stable event, fight, and fighter IDs. Documentation notes older betting odds move into a historical data warehouse, so access level must be confirmed. | Best all-in-one fallback if licensing includes five-year MMA pre-game lines plus final fight data. Higher confidence for identity matching than name-based odds/result joins. |
| ESPN public UFC scoreboard | Checked on 2026-08-10. The public scoreboard endpoint `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=YYYYMMDD&limit=100` returned completed UFC events, fight competitions, athlete IDs/names, event status, fight status, and winner flags. The 2026-08-01 and 2026-08-08 checks returned 26 completed fights. It does not return source-backed pre-fight prices. | Use only as a forward completed-result feed for settling Betcha-captured UFC multis. Store these rows as `result_only`, `price_source = missing`, `included_in_insights = false`. Do not use ESPN rows for UFC price-based Insights unless a separate source supplies prices. |
| UFCStats / UFC.com | Official UFC result/stat pages expose completed events and fight outcomes, but not betting prices. There is no documented betting odds API. | Usable only as a result-audit or fallback result source. Not sufficient for the requested UFC Insights metrics. |
| Existing TAB / Betcha web APIs | Current project notes show these are internal web APIs with no official public developer docs. Stored promotion fixtures confirm Betcha/TAB can surface current sports promotions, including UFC/MMA promotion URLs, but the proven app integration only resolves racing cards into participants, fixed prices, MarketMover state, results, and dividends. There is no evidence they expose five years of historical UFC fixed prices or settled UFC market/result rows through a stable public API. | Not suitable for the five-year UFC backfill. Could be revisited later for forward-only current NZ/AU bookmaker snapshots if usage rights are confirmed and a sports event GraphQL proof finds current fighter prices before events start. |

## Recommended Source Direction

Use a five-year historical UFC window for the first app-facing import:
`2021-07-24` through `2026-07-24`, based on the current planning date.

Use the Vali Hameed Kaggle master dataset as the first import source because it
already combines fight rows, settled winners, finish details, and many historical
moneyline odds. Import rows with two explicit classes:

- `priced`: both `RedOdds` and `BlueOdds` are populated, so favourite,
  other-fighter price, price difference, and `$1` favourite return can be
  derived.
- `result_only`: winner/result fields are populated, but one or both price
  fields are missing, so the row can appear in Historical Data but must not feed
  price-based Insights.

Use the Kaggle `UFC Betting Odds (Daily Updated Dataset)` as the next source to
fill missing recent prices. File inspection confirmed usable head-to-head rows
for 2025 and 2026, with these five-year join results against the Vali Hameed
master dataset:

- 1,497 rows already priced from Vali Hameed `RedOdds` / `BlueOdds`.
- 443 result-only rows can be filled by exact `event_date` plus unordered
  fighter-pair match against daily odds.
- 95 additional rows are review candidates from same-date fighter-name
  word-order matching or +/- one-day event-date matching.
- 499 rows remain result-only after these conservative joins.

Import precedence should be:

1. Use Vali Hameed `RedOdds` / `BlueOdds` when both are present.
2. Fill missing prices from daily odds only when there is one clear exact
   date+fighter-pair match or a deterministic aggregate can be built from
   duplicate bookmaker/source rows.
3. Store review-candidate matches with a manual-review flag instead of silently
   using them in Insights.
4. Leave unmatched rows as `result_only`.

Use a result source alongside any odds-only data. The Vali Hameed Kaggle master
dataset is a good first result/stat candidate because it includes settled
`Winner` and `Finish` fields through 2026-07-11:

- first choice: a source-backed UFCStats/UFC.com result parser or another
  structured fight-result dataset with event date and fighter names;
- join by normalized event date plus fighter pair, then retain source fields and
  manual-review flags for ambiguous matches;
- never infer winners from odds-only rows.

Keep SportsDataIO as the fallback all-in-one commercial option if Kaggle file
inspection or odds/result joining is too weak. SportsDataIO remains attractive
if the subscription can access:

- MMA schedules/events for at least the last five years;
- final fight results with `WinnerId` and non-standard result types;
- event fight odds or line movement for the same fights;
- pre-fight/closing moneyline prices for both fighters;
- terms that allow storing normalized historical facts and source references.

Use The Odds API only if a Business key confirms complete five-year historical
MMA `h2h` coverage and the implementation accepts a second source for fight
results. This path is simpler for prices but riskier for matching odds events to
official fight outcomes when fighter names differ.

## Proof Checklist

Before implementation, run a source proof for at least three completed UFC
events inside the target five-year window:

- one recent event, one mid-window event, and the oldest event needed by the
  five-year backfill;
- inspect the Kaggle file schema, row counts, licence metadata, and latest
  update timestamp from the downloaded dataset;
- confirm which fights have exactly two fixed-price `h2h` outcomes and which
  remain `result_only`;
- document whether each price row is a closing/pre-fight price, a bookmaker
  archive row, or only a dataset import timestamp;
- confirm winner/result data can be joined without name-only matching where
  possible;
- confirm no-contest, draw, cancelled, or missing-result handling from the raw
  source shape;
- record sample counts: events, fights, priced fights, settled fights, excluded
  fights, and missing prices;
- store raw payload examples under the normal raw-data/audit path once a key is
  available.

## Integration Notes

UFC ingestion should not run on the nightly racing schedule. After backfill, use
an event-complete or weekly refresh that looks back over recently completed UFC
events and reconciles final outcomes and closing prices when a price source is
available.

Forward UFC result refresh now uses ESPN's public UFC scoreboard as a
result-only settlement source:

- command: `npm --workspace @feeling-gamba/ingestion run refresh:ufc-results -- --lookback-days=14 --require-supabase`;
- scheduled workflow: `.github/workflows/ufc-result-refresh.yml`;
- default lookback: 14 UTC scoreboard dates, ending today;
- rows written: `ufc_fight_entries` with `price_match_status = result_only`,
  `price_source = missing`, `missing_price = true`, and
  `included_in_insights = false`;
- follow-up reconciliation:
  `npm --workspace @feeling-gamba/ingestion run reconcile:ufc-predictions -- --require-supabase`.

The refresh can settle UFC Prediction History where the Betcha leg fighter pair
matches a stored ESPN result row. It must not rebuild UFC price aggregates,
because no ESPN price is source-backed.

The app-facing model should be sport-neutral before UFC is added to the UI:
`Race Days` should become `Historical Data`, and sport-specific historical rows
and insight aggregate rows should sit behind a sport selector. UFC does not need
country, track, discipline, or starter-count filters.

## TAB / Betcha Follow-Up

TAB and Betcha may still be useful for forward collection once UFC support is in
place:

- collect current UFC fight cards and fixed prices before event start;
- store those snapshots prospectively for future Insights;
- use public sports promotions only as source-backed promotion context.

They should not be used for the requested five-year backfill unless a separate
proof confirms historical UFC event IDs, both fighter fixed prices, price
timestamps, and settled winners can be fetched without relying on account-only
state, screenshots, or name-only inference.

## Betcha Sports GraphQL Proof

Checked on 2026-07-24.

The Betcha web bundle exposes public sports GraphQL operations including
`SportingCategoryScreen`, `SportingCompetitionScreen`, `SportingEventScreen`,
`SportingEvents`, `SportingEntrantFormData`, and
`SportingEventEntrantFormData`. These operations confirm Betcha can return
current UFC/MMA market cards.

Current source-discovery proof:

- Query: persisted `SportingCategoryScreen` with category
  `MIXED_MARTIAL_ARTS`, `statuses: ["OPEN"]`, and upcoming events included.
- Response returned the `UFC / MMA` category and three current MMA competitions:
  `PFL`, `UFC Fight Night: Ankalaev vs Guskov`, and
  `UFC 330: Makhachev vs Machado Garry`.
- The response grouped event shells by `SportingCompetition:<uuid>`, which is
  sufficient to enforce same-card UFC multis and to filter non-UFC MMA cards
  out of UFC predictions.
- The category response included current `Head to Head` market shells, but not
  entrant prices in the grouped event list.

Current priced-card proof:

- Query: extracted the full `SportingCompetitionScreen` operation from the
  Betcha web bundle and called the standard GraphQL endpoint with category
  `MIXED_MARTIAL_ARTS`, competition slug
  `ufc-fight-night-ankalaev-vs-guskov`, `statuses: ["OPEN"]`,
  `includeUpcomingEvents: true`, and `upcomingEventsGroupBy: "UNSPECIFIED"`.
- Response returned 14 current rows for
  `UFC Fight Night: Ankalaev vs Guskov`; 13 were real `Head to Head` fights
  with two priced entrants, and one row was an unpriced specials market.
- Example current UFC event returned under that card:
  - `Cody Gibson vs Abdul Hussein`
  - event ID `SportingEvent:b4519c51-c7ab-4218-bb69-fe87bf3271db`
  - advertised start `2026-07-25T13:00:00.000Z`
  - `Head to Head` market ID
    `SportingMarket:998a4cc3-61f0-4701-9f90-3bbbb5d85224`
  - two `SportingEntrant` rows with fixed-win price IDs using product
    `940b8704-e497-4a76-b390-00918ff7d282`
  - fractional odds `4/1` and `9/50`, equivalent to decimal `5.00` and `1.18`.
- Current competition scan also returned a priced `PFL` card and a one-fight
  future UFC card. UFC prediction collection should include only competitions
  whose Betcha competition name/slug clearly identifies a UFC card, and should
  require at least two fully priced `Head to Head` fights on the same card
  before creating a UFC multi recommendation.

Historical proof attempt:

- Target historical URL from stored Betcha promotion fixture:
  `/sports/mma/ufc-fight-night-kape-vs-horiguchi`.
- The promotion fixture had expiry `2026-06-21T02:15:00.000Z`, so this was a
  useful recent historical event-card candidate.
- Query: extracted full `SportingCompetitionScreen` operation from the Betcha
  web bundle and called it with category `MIXED_MARTIAL_ARTS` and competition
  slug `ufc-fight-night-kape-vs-horiguchi`.
- With `statuses: ["OPEN"]`, Betcha returned current league navigation only;
  `league` was `null`, with zero events, markets, or prices for the historical
  slug.
- With `statuses: ["CLOSED"]`, Betcha returned no matching leagues and zero
  events, markets, or prices.
- `RESULTED`, `SETTLED`, and `SUSPENDED` are not valid values for
  `SportingMarketStatus` on this public query.

Conclusion:

Betcha is now proven as a possible **forward UFC snapshot source** for current
fight cards and prices. It is not proven as a five-year historical UFC source.
The public sports GraphQL operations tested did not return retained market data
for the June 2026 UFC promo URL once that event was historical.

## Forward Betcha Collection

Clarified on 2026-07-24: fighter names, event IDs, `Head to Head` markets,
entrant IDs, and prices are enough for prospective UFC collection, provided the
app can later join those captured prices to source-backed fight results.

Use Betcha as the first forward UFC price source:

- collect open UFC/MMA fight cards from `SportingCategoryScreen`;
- store each fight as a two-entrant contest keyed by `SportingEvent:<uuid>`;
- store each `Head to Head` market and both `SportingEntrant:<uuid>` prices;
- convert fractional odds to decimal fixed prices for Insights;
- capture at least one pre-fight snapshot before event start;
- keep raw payloads so parser changes can be repaired later.

Do not treat Betcha as a completed five-year backfill unless historical Betcha
price snapshots already exist. For past UFC events where Betcha no longer
returns sports market data, official result pages can tell us who won, but they
cannot reconstruct the missing pre-fight prices needed for favourite price,
other fighter price, price-difference, or `$1` favourite-return statistics.

The practical MVP path is:

1. Backfill the five-year historical baseline from the Vali Hameed master
   dataset plus the daily odds dataset where exact joins are available.
2. Keep unmatched and unreviewed matches as `result_only` until a stronger price
   source is added or manual review approves them.
3. Start forward UFC price capture from Betcha.
4. Reconcile completed fights against a source-backed result feed after each
   event.
   Current app reconciliation uses stored `ufc_fight_entries` rows when they
   are available; unmatched forward-captured Betcha legs become `missing_result`
   open issues four hours after advertised start rather than staying pending.
5. Build UFC Historical Data and Insights from contests that have both a
   captured pre-fight price snapshot and a settled result.
6. Keep the paid/licensed historical odds-source option open if the remaining
   five-year `result_only` rows must be priced later.
