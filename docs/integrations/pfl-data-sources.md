# PFL Data Source Validation

## Status

Validation date: 2026-08-26.

PFL is visible in Predictions and Prediction History with the same
Singles/Multis -> Win % hierarchy as UFC. Historical PFL rows and aggregate
Insights are implemented from the first seed backfill path added on 2026-08-26
for PFL New York, using
`packages/ingestion/data/pfl-bookmakers-review-2026-07-31.json`,
`packages/ingestion/scripts/backfill-pfl-seed-to-supabase.mjs`, and
`supabase/migrations/202608260001_pfl_historical_data_and_insights.sql`.
Forward PFL Predictions now read current MMA fixed-win odds only after matching
the event date and unordered fighter pair to a reviewed PFL event allow-list.
Prediction History persistence remains intentionally empty until PFL-specific
prediction tables/RPCs are added.

Broader historical PFL backfill is not ready to run from local project data. The
downloaded Kaggle archive inspected from `/Users/fabiandouch/Downloads/archive.zip`
on 2026-08-26 contains one `UFC_betting_odds.csv` with 199,392 rows. The file has
the expected UFC odds columns (`fight_url`, fighter URLs/names, `odds_1`,
`odds_2`, method odds, `event_date`, `adding_date`, `source`, and `region`), but
it has no event/league label column, zero direct PFL text markers, and historical
source URLs are `ufcstats.com`. The UFC backfill script is also tied to
UFC-specific source data, table names, and aggregate scope keys.

The `ODDS_API_KEY` added locally on 2026-08-26 can access The Odds API current
MMA catalogue and current AU-region `h2h` odds. A live current-odds proof
returned 57 MMA events and confirmed two-outcome decimal fixed-win prices on at
least one event. The same key cannot access historical MMA odds on its current
plan: The Odds API returned HTTP 401 with a paid-plan requirement for
`/v4/historical/sports/mma_mixed_martial_arts/odds`.

Live Betcha and TAB `MIXED_MARTIAL_ARTS` `OPEN` league checks on 2026-08-26
both returned four UFC competitions and no open PFL competition. Earlier MMA
source validation on 2026-07-24 observed a current PFL card from Betcha, so
forward PFL collection appears possible only when a PFL card has open fixed-win
markets. This is not a historical backfill source.

A 2026-08-26 current The Odds API `mma_mixed_martial_arts` odds check returned
57 current MMA events, but the feed does not include an organisation label. A
name check against known upcoming PFL cards/fighters found no PFL-identifiable
current events, while Sherdog listed the next PFL events as October 2, October
10, and October 16, 2026. Do not generate PFL predictions from generic MMA odds
rows unless the event can be matched to a PFL card through a source-backed event
identity or an explicit reviewed allow-list.

As of 2026-08-26, the reviewed forward PFL allow-list contains:

- PFL MENA 11 on 2026-10-02 in Riyadh, sourced from Sherdog's PFL MENA 11 card.
- PFL Africa Morocco on 2026-10-10 in Casablanca, sourced from the official PFL
  Africa announcement and Sherdog's PFL Africa 3 card.
- PFL Chicago 2 on 2026-10-16 in Chicago, sourced from the official PFL
  announcement naming Liz Carmouche vs Jena Bishop.

The allow-list is a safety filter for unlabeled current MMA odds, not a
prediction source by itself. Current PFL prediction generation must remain empty
when no current odds event matches one of those reviewed fighter pairs.

## Required Data

PFL needs the same fight-level fixed-win contract as UFC:

- event date and event/card name;
- source event and fight identifiers where available;
- both fighter names and stable source fighter identifiers where available;
- pre-fight or closing fixed-win prices for both fighters;
- derived favourite as the lower fixed-win price;
- derived other-fighter fixed-win price;
- derived price difference as `other_fighter_fixed_price - favourite_fixed_price`;
- final winner and result status;
- source, bookmaker, price timestamp, and raw payload reference.

Cancelled fights, draws, no contests, missing results, missing prices, and
equal-price markets should be stored as explicit non-standard states and
excluded from favourite-return insight denominators unless a future requirement
changes that rule.

## Candidate Sources

| Source | Findings | Verdict |
| --- | --- | --- |
| Existing local project files | No PFL CSV/source export is present in the repo. The inspected downloaded Kaggle odds CSV has 199,392 rows, but no PFL markers or league/event-label fields, and historical rows point at `ufcstats.com`. The existing UFC importer requires a UFC master results CSV plus this daily odds CSV, and writes only `ufc_*` tables. | Not usable for an immediate PFL backfill. |
| TAB/Betcha current MMA GraphQL | Current UFC collection already uses Betcha `MIXED_MARTIAL_ARTS` Head to Head markets. A 2026-07-24 check observed a priced PFL card from Betcha, but 2026-08-26 checks against both TAB and Betcha returned only UFC competitions. | Good candidate for forward-only PFL market snapshots when PFL cards are open. Not suitable for historical PFL backfill. |
| PFL official site/results pages | Public PFL pages expose event lists and result articles, including completed fight winners in article copy. | Good candidate result source if we build and validate a parser. Does not provide fixed-win prices. |
| Kaggle UFC/MMA daily odds dataset | Public metadata says the dataset contains daily UFC/MMA head-to-head moneyline snapshots with event dates, collection timestamps, bookmaker/source, and region. Local inspection of the downloaded archive found no direct PFL markers and no league/event-label fields that can identify PFL rows. | Not suitable for PFL backfill unless a separate reliable PFL fight identity source can deterministically match by event date plus fighter pair without ambiguous non-PFL rows. |
| Bookmakers Review PFL odds page | The indexed `bookmakersreview.com/odds/pfl/` page is PFL-labelled and shows recent completed PFL result rows with opener/current American moneyline prices, including recent July 31, 2026 fights. American odds must be converted before storage: positive moneyline `+X` becomes decimal `1 + X / 100`; negative moneyline `-X` becomes decimal `1 + 100 / X`. Direct server-side fetches from the project environment returned a Cloudflare challenge for both the PFL league page and matchup detail URLs. | Useful manual validation and possible source-discovery candidate. Not safe as the first automated backfill source unless a stable, allowed data endpoint is found or Cloudflare access is resolved. |
| Bookmakers Review indexed matchup pages | Search-indexed `odds.bookmakersreview.com/pfl/matchups/...` pages exist for at least June 12, 2025 and June 20, 2025 PFL cards. The observed snippets identify PFL card dates and fighter pairings, but showed dashes for opener/current odds in the rows inspected. Direct fetches still return Cloudflare challenges. | Possible discovery list for historical PFL cards, but not enough for fixed-win insight rows unless prices can be read from a stable endpoint or a complete indexed page. |
| MMA Fighting PFL result feed | Search-visible PFL result coverage includes completed July 31, 2026 and July 26, 2026 cards with fight winners and finish details. | Useful for result-only rows or winner verification. It does not provide fixed-win prices, so it cannot expand priced Insights by itself. |
| The Odds API current and historical MMA odds | Official docs expose MMA `h2h` odds and a historical odds endpoint on paid plans. A 2026-08-26 local key proof confirmed current `mma_mixed_martial_arts` events and AU-region decimal fixed-win prices, but historical MMA odds returned HTTP 401 on the current key. | Good current/forward fixed-win source. Not usable for historical PFL backfill until the key has paid historical access; still needs settled result data. |
| SportsDataIO MMA | Public docs describe MMA event/fight data plus fight odds and line movement, with older odds moving to a historical warehouse. | Potential all-in-one commercial source if licensing includes PFL coverage, five-year history, results, and odds storage rights. |
| Sportradar PFL integration | Public integration docs cover PFL fightcards and schedules with fight IDs and corner/team metadata. The checked docs do not expose fixed-win prices. | Useful identity/schedule source if licensed, but not sufficient for fixed-win insights alone. |

## Recommended Direction

Run another source proof before adding schema or ingestion code:

1. Apply `supabase/migrations/202608260001_pfl_historical_data_and_insights.sql`
   before running the seed write.
2. Run the first seed dry run with
   `npm --workspace @feeling-gamba/ingestion run backfill:pfl-seed -- --dry-run`.
3. If the dry run is acceptable, write the seed rows with
   `npm --workspace @feeling-gamba/ingestion run backfill:pfl-seed -- --require-supabase`.
4. Find a PFL-labelled historical odds source, or confirm The Odds API
   historical access is enabled for the local key. The inspected Kaggle CSV does
   not identify PFL rows.
5. Record the PFL odds date range, fight count, bookmaker/source coverage, and
   whether each row has exactly two fixed-win outcomes.
6. Validate a PFL result source for three completed events: one recent event,
   one mid-window event, and the oldest event we want in the first backfill.
7. Join those sample events by event date plus unordered fighter pair, then
   record exact matches, ambiguous matches, missing prices, and missing results.
8. Keep adding seed JSON files and running the existing PFL seed importer only
   when rows have source-backed fixed-win prices. The currently visible
   additional Bookmakers Review PFL snippets checked on 2026-08-26 were still
   result-only or showed dashed prices, so they cannot expand priced insight
   denominators.
9. Maintain forward PFL current-market capture through the reviewed event
   allow-list. Current The Odds API rows must be filtered by source-backed PFL
   event identity, not by generic MMA availability alone.

Do not surface source labels such as bookmaker names in app-facing PFL
predictions unless explicitly required; store source names in raw/audit fields
for traceability.
