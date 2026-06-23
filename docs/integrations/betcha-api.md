# Betcha API Notes

## Status

Betcha exposes a public GraphQL API used by the web app:

- Web app: `https://www.betcha.co.nz`
- Promotions page: `https://www.betcha.co.nz/promotions`
- GraphQL endpoint: `https://api.betcha.co.nz/graphql`
- GraphQL router: `https://api.betcha.co.nz/gql/router`

No official public developer documentation has been found. Treat these endpoints
as internal web APIs until usage rights and support are confirmed.

The Betcha API shape closely matches the TAB GraphQL API. This makes it useful
as a second source for:

- active public promotions;
- racing meeting and race discovery;
- pre-race favourite and MarketMover snapshots;
- settled race results and dividends.

## Promotions

The public `PromotionsList` operation worked without authentication on
2026-05-25.

Example query:

```graphql
query PromotionsList(
  $after: String
  $first: Int
  $subdivision: Subdivision
  $eligibility: [PromotionEligibility!]
  $walletType: WalletType
  ) {
    promotions(
    after: $after
    first: $first
    positions: [PROMOTIONS]
    includeExpired: false
    subdivision: $subdivision
    eligibilities: $eligibility
    availableOn: DESKTOP_ONLY
      walletType: $walletType
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
      id
      image(type: TILE)
      uri
      buttonText
      termsAndConditions
      description
      claimCode
      expiry
      rootCategoryGroup
    }
  }
}
```

Example variables:

```json
{
  "first": 100,
  "after": null,
  "subdivision": null,
  "eligibility": null,
  "walletType": null
}
```

Observed active public promotions on 2026-05-25:

| Category | Description summary | Expiry NZ time | URI |
| --- | --- | --- | --- |
| SPORT | State of Origin anytime tryscorer super boost | 2026-05-27 22:05 | `/sports/rugby-league/state-of-origin/new-south-wales-vs-queensland/0036282d-ae4e-47a5-94c7-84cba2d1d246` |
| SPORT | Boosted odds on selected US Basketball Finals games | 2026-05-26 12:30 | `/sports/basketball/usa/nba` |
| SPORT | SGM Cover tool for US Basketball Finals | 2026-05-26 12:40 | `/sports/basketball/usa/nba` |
| RACING | Bet Back Tool on Addington Races 1-2 | 2026-05-25 13:51 | `/racing/addington/49efab17-16ab-42d3-9ee4-701c681f19a0` |
| RACING | Bet Back Tool on Palmerston North Races 1-2 | 2026-05-26 12:01 | `/racing/manawatu/6d36d015-c4c0-4f58-ae5d-d3c4874c68ef` |
| SPORT | Referral bonus cash offer | 2026-05-26 16:00 | `/playbook/2025/09/20-bonus-cash-is-just-a-friend-away/` |

Personalized promotions and actual tool eligibility should be treated separately
from the public list. They may require an authenticated account session.

Current promotion check on 2026-06-15:

- Paginated public `PromotionsList` returned 10 active promotions over 1 page.
- Racing promotion detected:
  - Description: `Place a Fixed Odds Win bet on the #4 betcha Rug at Whanganui
    Straight and if it finishes 2nd or 3rd, get up to $50 back as Bonus Cash.`
  - URI: `/racing/hatrick-straight/72591ebe-5170-40cd-92e2-31abbede5313`
  - Expiry: `2026-06-16T04:21:00.000Z`
- The URI resolved as `RacingRaceCard:72591ebe-5170-40cd-92e2-31abbede5313`.
- Race card: Whanganui Straight R1, `WELCOME TO WANGANUI STRAIGHT TRACK C0
  313M PBD`.
- Starter count: 6, excluding vacant boxes.
- Target runner parsed from promo text: #4 `Just An Anomaly`.
- Betcha returned runner rows and MarketMover state but no numeric fixed-win
  decimals for this race at fetch time, so no favourite could be derived.
- Stats should not assume this six-starter race pays 3rd-place bonus credit.
  Apply AU/NZ place-style terms: 5-7 starters credits 2nd only, while 8+
  starters credits 2nd/3rd unless a source-backed promotion overrides it.

Bet-back candidate scan on 2026-06-16:

- User requirement: Betcha's daily racing bet-back offer should be evaluated
  across configured pilot-track races, including Doomben as an Australian
  comparison track, not only explicit race-specific promotion URLs.
- `racingDay` returned 22 domestic-region meetings for the date, including NZ
  and AU meetings.
- Filtering to configured pilot tracks matched Whanganui Straight only for this
  source date. Doomben is now included in the scan configuration and appears
  when Betcha returns a current Doomben meeting.
- The scan checked 12 Whanganui Straight greyhound races and derived favourites
  from current fixed-win prices on each `RacingRaceCard`.
- The Promos fixture stores the top 8 ranked candidates using historical
  favourite price bucket and starter-count cash-plus-bonus averages.
- Candidate rankings are statistical signals only and should not include stake
  sizing, bankroll guidance, automated wagering, or invented favourites.

## Race Discovery

Betcha supports the same `racingDay` pattern observed on TAB.

Example query:

```graphql
query RacingHomeMeetingsDesktopScreen(
  $date: Date!
  $categories: [RacingCategory!]
  $regions: [Region!]
) {
  racingDay(date: $date, categories: $categories, regions: $regions) {
    meetings: nodes {
      id
      name
      category
      meetingCode
      venue {
        name
        country
        state
      }
      races: racesConnection {
        nodes {
          id
          name
          number
          advertisedStart
          finalFieldMarket {
            id
            status
          }
          resultsSummary
        }
      }
    }
  }
}
```

Example variables:

```json
{
  "date": "2026-05-24",
  "categories": ["HORSE", "HARNESS", "GREYHOUND"],
  "regions": ["DOMESTIC"]
}
```

Important filter:

- `regions: ["DOMESTIC"]` can return both NZ and AU meetings.
- For the app's domestic NZ racing scope, filter `meeting.venue.country === "NZ"`.

Example settled NZ meetings returned for 2026-05-24:

| Meeting | Code | Country | Races |
| --- | --- | --- | --- |
| Te Rapa | HORSE | NZ | 8 |
| Manukau | GREYHOUND | NZ | 12 |
| Timaru | HARNESS | NZ | 11 |
| Winton | HARNESS | NZ | 10 |

Race IDs use the same typed global ID pattern:

```text
RacingRace:94af5940-6894-4078-9a51-94db5cdf7d11
RacingRaceCard:94af5940-6894-4078-9a51-94db5cdf7d11
```

Historical pilot-track fixture check on 2026-06-15:

- Date queried: `2025-12-15`.
- Query categories: `HORSE`, `HARNESS`, `GREYHOUND`.
- Query regions: `DOMESTIC`.
- Betcha returned 20 source meetings.
- Pilot-track alias filtering matched `Addington` only.
- Matched meeting category: `GREYHOUND`.
- Matched races: 12.
- Fixture path:
  `data/raw/betcha-graphql/pilot-tracks-2025-12-15.json`.
- The fixture includes race-card detail, runner rows, fixed-win prices,
  `isMarketMover`, final result rows, dividends, and derived favourite return
  fields for `$1` fixed-win unit stakes.
- Fixture aggregate: 12 favourite selections, 6 wins, 2 seconds, 1 third, `$12`
  total stake, `$9.24` total return, and `0.77` average return per `$1` staked.

## Race Card Results

Settled results worked using `node(id: "RacingRaceCard:<uuid>")`.

Tested race:

- Te Rapa Race 1, 2026-05-24
- Race card ID: `RacingRaceCard:94af5940-6894-4078-9a51-94db5cdf7d11`
- Status: `FINAL`
- Runner rows returned: 6
- Results returned:
  - finishing positions;
  - win/place dividends;
  - exotic results;
  - margins.

Example query:

```graphql
query RaceCardLite($id: ID!) {
  raceCard: node(id: $id) {
    __typename
    ... on RacingRaceCard {
      id
      name
      number
      status
      advertisedStart
      distance
      trackCondition
      finalField(baseAvailability: true) {
        runnerRows(baseAvailability: true) {
          id
          number
          name
          scratchedTimestamp
        }
      }
      results {
        __typename
        ... on RacingResults {
          title
          runnerRows {
            id
            position
            winPlaceDividends {
              label
              value
            }
            toteDividends(includePlaceDividendsForFirstPosition: true) {
              label
              value
            }
          }
        }
        ... on RacingExoticResults {
          title
          results {
            name
            entrantLabelSummary
            toteOdds
          }
        }
        ... on RacingMarginResults {
          title
          runnerRows {
            id
            margin
          }
        }
      }
    }
  }
}
```

## MarketMover And Favourite

Pre-race Betcha race cards expose `isMarketMover` on runner rows and prices on
the same runner row.

Tested race:

- Addington Race 1, 2026-05-25
- Race card ID: `RacingRaceCard:49efab17-16ab-42d3-9ee4-701c681f19a0`
- Race name: `SPRINGSTON HOTEL DASH PBD`
- Advertised start: `2026-05-25T01:35:00.000Z`

Observed pre-race values:

| Metric | Runner |
| --- | --- |
| Current runner rows | 10 |
| Current starters excluding scratched/vacant rows | 7 |
| Fixed-win favourite | `7 Dribbles Card` at `3.00` |
| MarketMover | `2 Jingles Do Well` at fixed-win `11.00` |

Use the same fixed-win product type ID already observed on TAB:

```text
940b8704-e497-4a76-b390-00918ff7d282
```

Betcha price IDs include the entrant ID and the product type ID:

```text
<entrant-id>:940b8704-e497-4a76-b390-00918ff7d282:
```

Parsing rules:

- Starter count = runner rows where `scratchedTimestamp is null`.
- Exclude `Vacant Box` rows from greyhound starter counts.
- Favourite = shortest non-null decimal price for the fixed-win product.
- MarketMover = runner row where `isMarketMover = true`.
- Capture favourite and MarketMover before jump; do not assume these remain
  queryable after settlement.

## Historical Retention Check

A six-month-old greyhound race still returned race-card details, prices, and
MarketMover data on both Betcha and TAB.

Tested on 2026-05-25:

- Race date: 2025-11-25 NZ date
- Meeting: Palmerston North
- Race: Race 1, `PAUL CLARIDGE ELECTRICAL PBD`
- Race card ID: `RacingRaceCard:c116bebe-c0de-4e22-b999-e7f23c85558e`
- Status: `FINAL`
- Active starters: 7
- Fixed-win favourite: `4 Tinwald` at `1.85`
- Favourite final placing: 4th
- MarketMover: `2 Jilliby Finale` at fixed-win `3.40`
- MarketMover final placing: 3rd
- Winner: `3 Big Time Kimetto`
- Placings summary: `3-6-2`

Betcha returned win/place dividends and exotics. TAB returned richer tote dividend
labels and values for the same race, so TAB is the better primary source for
historical settled results. Betcha remains useful as a secondary source and for
promotion discovery.

Final placing lookup:

1. Select the favourite and MarketMover from `finalField.runnerRows`.
2. Keep each selected runner's `id`, e.g. `RacingEntrant:<uuid>`.
3. Match that entrant ID against `results[].runnerRows[].id`.
4. Read `results[].runnerRows[].position`.

## Raw Fixture Field Audit

Checked on 2026-06-23 against `data/raw/betcha-graphql/all-domestic-*.json`
from 2025-12-15 through 2026-06-21:

- Saved race-card nodes contain race metadata, distance, track condition, final
  field runner rows, prices, MarketMover flags, results, dividends, and margins.
- Saved runner rows contain `id`, `number`, `name`, `scratchedTimestamp`,
  `isMarketMover`, and `prices` only.
- The saved Betcha fixtures do not include source-provided runner form/history
  fields such as trainer, driver/jockey, barrier, age, official rating, prior
  starts, last-start result, or past-performance rows.
- Race-name text can expose class/grade tokens such as maiden, BM ratings,
  greyhound C grades, pace/trot, sprint/dash, stakes, handicap, and group race
  markers, but these should be treated as parsed text signals rather than
  structured source fields.
- Limited runner history can be derived from collected race cards by matching
  runner names across previous fixtures, but this is an app-derived feature and
  should use conservative fallbacks for first-observed runners and possible name
  collisions.

## App Usage

Recommended MVP use:

1. Use Betcha as a second source adapter with the same internal interface as TAB.
2. Store Betcha raw responses in `source_fetches`.
3. Do not merge Betcha and TAB market states unless the race-card UUID and runner
   mapping are confirmed.
4. Store promotion rows in a separate `promotions` table or source-specific JSON
   until the app has a clear user-facing promotions feature.

Suggested source labels:

- `betcha_graphql_promotions`
- `betcha_graphql_racing_day`
- `betcha_graphql_race_card`

## Risks

- This appears to be an internal web API, not a documented public API.
- The schema may change without notice.
- Personalized promotions and betting-tool activation likely require auth.
- Automated access should be rate-limited and reviewed against Betcha/TAB terms.
- The app must stay analysis/logging focused and avoid encouraging betting.
