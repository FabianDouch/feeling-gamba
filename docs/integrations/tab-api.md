# TAB GraphQL API Notes

## Status

TAB exposes a GraphQL endpoint used by the public web app:

- `https://api.tab.co.nz/graphql`
- `https://api.tab.co.nz/gql/router`

This is observable from the TAB web frontend, but no official public developer documentation has been found yet. Treat it as an internal web API until terms and support are confirmed.

GraphQL introspection is disabled. A request using `__schema` or `__type` returns an error similar to:

```text
GraphQL introspection is disabled by Cosmo Router
```

## Race Card Lookup

Race card lookups use GraphQL's `node(id: ...)` pattern.

Important detail: the raw UUID from a TAB race URL is not enough. The ID needs a type prefix.

Example:

```text
RacingRaceCard:6819d370-dd38-4e0b-a0f0-a1429a32114d
```

Example query:

```graphql
query RaceCard($id: ID!) {
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

Example variables:

```json
{
  "id": "RacingRaceCard:6819d370-dd38-4e0b-a0f0-a1429a32114d"
}
```

For domestic NZ thoroughbred races discovered through `racingDay`, the `RacingRace`
UUID can be reused as a race-card UUID by changing the type prefix:

```text
RacingRace:e1b70996-565e-44fc-b6f2-2768d8fb3b86
RacingRaceCard:e1b70996-565e-44fc-b6f2-2768d8fb3b86
```

This was verified for Ellerslie on 2026-05-23. The `RacingRace` node exposed the
race schedule and final-field market ID; the `RacingRaceCard` node exposed live
runner rows, fixed-win prices, scratches, and `isMarketMover`.

## Market Mover And Favourite Fields

The TAB frontend race-card query includes these runner row fields:

```graphql
runnerRows(baseAvailability: true) {
  id
  number
  name
  isMarketMover
  prices(baseAvailability: true) {
    id
    odds {
      decimal
      numerator
      denominator
    }
  }
  fluctuations {
    decimal
  }
}
```

Potential MVP interpretation:

- `isMarketMover = true` means TAB explicitly marks the runner as market mover.
- Favourite can be inferred from shortest `prices.odds.decimal` at a snapshot time.
- Runner count can be inferred from `runnerRows.length`; final starter count should exclude rows with `scratchedTimestamp`.

Current limitation:

- On completed races tested after settlement, asking for `prices` or `isMarketMover` on the final field caused downstream GraphQL errors for at least one settled race.
- This suggests market data may need to be captured before the race or before the market is fully removed.

Historical retention check:

- A six-month-old greyhound race still returned final-field runner rows, prices,
  and `isMarketMover` on 2026-05-25.
- Tested race: Palmerston North Race 1, 2025-11-25 NZ date.
- Race card ID: `RacingRaceCard:c116bebe-c0de-4e22-b999-e7f23c85558e`.
- Fixed-win favourite: `4 Tinwald` at `1.85`.
- Favourite final placing: 4th.
- MarketMover: `2 Jilliby Finale` at fixed-win `3.40`.
- MarketMover final placing: 3rd.
- Winner: `3 Big Time Kimetto`.
- TAB returned richer tote dividend data than Betcha for this settled race.
- Do not rely on this as a retention guarantee; keep pre-race snapshot capture as
  the primary MVP path.

To derive favourite/MM final placing:

1. Select the favourite and MarketMover from `finalField.runnerRows`.
2. Keep each selected runner's `id`, e.g. `RacingEntrant:<uuid>`.
3. Match that entrant ID against `results[].runnerRows[].id`.
4. Read `results[].runnerRows[].position`.

## Meeting Discovery

The frontend bundle exposes operations with names such as:

- `RacingHomeScreenWeb`
- `RacingHomeMeetingsDesktopScreen`
- `RacingRaceCardScreenWeb`
- `RacingRace`
- `RacingEntrantInfo`

Observed `RacingHomeScreenWeb` variables:

- `horse: Boolean`
- `greyhound: Boolean`
- `harness: Boolean`
- `date: Date`
- `regions: [Region!]`

Observed region values:

- `DOMESTIC`
- `INTERNATIONAL`

Observed category values:

- `HORSE`
- `HARNESS`
- `GREYHOUND`

Example domestic thoroughbred discovery query:

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
      meetingCode
      venue {
        country
        state
      }
      races: racesConnection {
        nodes {
          id
          advertisedStart
          name
          number
          finalFieldMarket {
            id
            status
          }
        }
      }
    }
  }
}
```

Example variables:

```json
{
  "date": "2026-05-23",
  "categories": ["HORSE"],
  "regions": ["DOMESTIC"]
}
```

Open issue:

- Thoroughbred meeting discovery worked for the tested 2026-05-21 date using a stripped-down bet-builder-style query.
- Harness and greyhound meeting discovery through this GraphQL path returned downstream errors in stripped-down test queries.
- The TAB Form Guide exposed harness and greyhound meeting/race IDs for that date, so it may be the better discovery source for NZ domestic races.

## Implementation Guidance

- Keep GraphQL calls in a backend ingestion adapter, not in Expo.
- Store both the raw response and parsed fields.
- Rate-limit requests and avoid parallel scraping bursts.
- Treat schema/operation changes as expected; add parser tests with saved fixtures.
- Re-check TAB terms before running automated jobs at scale.

## Promotion Discovery

Checked on 2026-06-16 NZ time while investigating a missing expected Cambridge
Wednesday thoroughbred promo.

Public unauthenticated `promotions` findings:

- `positions: [PROMOTIONS]`, `positions: [INDICATORS]`, both positions,
  desktop/mobile/no `availableOn`, and no position filter were tested.
- The standard promotions-page query returned 10 TAB promos and only 2 racing
  promos.
- Omitting the `positions` filter returned 20 TAB promos and surfaced more
  racing-related public entries, including Trackside Live, Easybet, Easy Form,
  Before the Jump, protest payout, and racing multi-rescue offers.
- The expected Cambridge race-specific promo was not present in any checked
  unauthenticated public promotions result.

Authenticated/client-only promotion surfaces observed in the TAB web bundle:

- Race-level `promotion(positions: [INDICATORS])`.
- `ClientPromotions`.
- `PersonalisedPromotionsList`.

Unauthenticated probes against those fields returned forbidden or
unauthenticated errors. Treat them as future authenticated-source candidates
rather than current MVP public inputs. The app should not invent or manually add
missing race-specific promos unless a source-backed public or authenticated feed
is confirmed.

## Ellerslie Thoroughbred Check

Checked on 2026-05-22 NZ time for the next Ellerslie meeting on 2026-05-23.

| Race | TAB race-card ID | Current starters | Fixed-win favourite | Market mover |
| --- | --- | ---: | --- | --- |
| 1 MYRACEHORSE 1100 | `RacingRaceCard:e1b70996-565e-44fc-b6f2-2768d8fb3b86` | 7 | #5 Fatal Affair $1.65 | #5 Fatal Affair |
| 2 THE LAWN SHED HCP 2100 | `RacingRaceCard:ed052ef4-89c0-4f12-b512-c9ea6e00ace9` | 6 | #1 Pacifico $1.65 | #1 Pacifico |
| 3 TRACKSIDE.CO.NZ 1500 | `RacingRaceCard:a71d2db8-e44c-42b7-8321-25eae5112adf` | 6 | #1 Bulgari $3.20 | #1 Bulgari |
| 4 THE LAWN SHED MDN 1400 | `RacingRaceCard:71c41971-4c82-4341-bb91-3388089989f2` | 19 | #15 Pre Nup $4.60 | #15 Pre Nup |
| 5 CAMBRIDGE STUD 2100 | `RacingRaceCard:c22b5de1-d40b-4b4b-95f8-6cb12b0e72de` | 16 | #13 Hero Of War $6.00 | #3 Elton Rocks |
| 6 JRA TROPHY HCP 1600 | `RacingRaceCard:7d6d10cd-0cfa-4493-b00f-4262c9db6322` | 11 | #2 Lupo Solitario $3.40 | #6 El Viento |
| 7 GOLF WAREHOUSE 1400 | `RacingRaceCard:2afc35ea-f333-469f-a1f4-1b6cf0b8bc20` | 12 | #8 Magice $3.80 | #4 Bellarista |
| 8 SHOW BY SKYCITY 1600 | `RacingRaceCard:b3a84d15-99e8-4ebb-a316-3fd302a95d6e` | 14 | #4 Orson Stone $4.50 | #4 Orson Stone |

Notes:

- Favourite above uses the `Fixed Win` product type ID `940b8704-e497-4a76-b390-00918ff7d282`.
- Current starters are TAB runner rows excluding `scratchedTimestamp`.
- Market mover is the runner row where `isMarketMover = true`.

## Promotions

TAB's frontend bundle exposes a public `PromotionsList` GraphQL operation. This
worked without authentication on 2026-05-22 and returned the active public
promotions list when `includeExpired: false` was used.

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

Public active promotions returned at the time of testing included:

| Category | Description summary | Expiry NZ time | URI |
| --- | --- | --- | --- |
| RACING | Odds Surge for all races at New Plymouth, max bet $100 | 2026-05-23 16:25 | `/racing/new-plymouth-raceway/88db7c6c-e7f7-4694-b98f-26a5f1638d39` |
| RACING | Fixed-odds win bet on Whanganui Races 1-2, refund as Bonus Cash if runner finishes 2nd or 3rd | 2026-05-22 16:56 | `/racing/hatrick/2d5ad248-4bba-4dce-b9a1-c961d8a712d0` |
| RACING | 4+ leg racing multi refund as Bonus Cash if selected legs fail | 2026-05-26 23:00 | `/racing` |
| SPORT | Several public sports boosts and multi refund offers | Varies | `/sports...` |

The frontend also exposes `PersonalisedPromotionsList`, but unauthenticated calls
returned `UNAUTHENTICATED`. Treat public promotions and account-personalized
promotions as separate sources.

Current promotion check on 2026-06-15:

- Paginated public `PromotionsList` returned 10 active promotions over 1 page.
- Racing promotions detected:
  - Race-specific bonus-cash offer for Whanganui Straight Races 1-2:
    `/racing/hatrick-straight/72591ebe-5170-40cd-92e2-31abbede5313`.
  - Broad racing multi rescue offer at `/racing`.
- The race-specific URI resolved as Whanganui Straight R1 and was expanded to R1
  and R2 by matching the race-card UUID back to the `racingDay` meeting.
- R1 starter count: 6. R2 starter count: 8.
- Bonus-cash stats should treat the six-starter race as 2nd-place credit only,
  and the eight-starter race as 2nd/3rd credit, following AU/NZ place-style
  terms unless the source promotion text provides a more specific override.
- TAB returned runner rows and MarketMover state but no numeric fixed-win
  decimals for these races at fetch time, so no favourite could be derived.

## Source URLs

- TAB web app: `https://www.tab.co.nz`
- TAB GraphQL: `https://api.tab.co.nz/graphql`
- TAB GraphQL router: `https://api.tab.co.nz/gql/router`
