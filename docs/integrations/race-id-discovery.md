# Race ID Discovery Notes

## Problem

The app needs reliable race identifiers for domestic NZ races across thoroughbred, harness, and greyhound codes.

There are at least three ID families:

- TAB race-card IDs, e.g. `RacingRaceCard:<uuid>`
- TAB Form Guide IDs, e.g. `cambridge-raceway-260521-1`
- Code-specific official IDs, e.g. HRNZ result page/race header IDs

The MVP should store all known IDs and map them over time instead of assuming one universal ID.

## Known ID Patterns

### TAB Race Card

TAB race URLs can include a UUID:

```text
https://www.tab.co.nz/racing/churchill-downs/6819d370-dd38-4e0b-a0f0-a1429a32114d
```

GraphQL lookup requires:

```text
RacingRaceCard:6819d370-dd38-4e0b-a0f0-a1429a32114d
```

This worked for a Churchill Downs race card and returned results/dividends.

### TAB Form Guide Harness

Cambridge harness on 2026-05-21:

```text
MeetingID: cambridge-raceway-260521
Race URL: /form/cambridge-raceway-260521-1
EventID: racingform-hrnz-cambridge-raceway-260521-1
FlucID: hrnz-cambridge-raceway-260521-1
```

This appears to encode:

- track slug
- date as `ddmmyy`
- race number

### TAB Form Guide Greyhound

Cambridge greyhound on 2026-05-21:

```text
Track: Cambridge (G)
TrackSlug: cambridge-g-nz
Race URL examples:
  /form/160256-260521
  /form/159488-260521
EventID examples:
  racingform-grnz-160256-260521
```

This appears to encode:

- source race number/id
- date as `ddmmyy`

### TAB Form Guide Thoroughbred

Examples from the 2026-05-21 date page:

```text
/form/55792-20260521-1
/form/cmFjZToyMDEwMjY4
```

NZ thoroughbred pages may use a numeric meeting/date/race pattern, while Australian and international pages may use base64-like race IDs.

Ellerslie on 2026-05-23 confirmed the following thoroughbred mapping:

```text
TAB Form Guide race: /form/55013-20260523-1
Form Guide EventID: racingform-nztr-55013-20260523-1
Form Guide FlucID: nztr-55013-20260523-1
TAB GraphQL race: RacingRace:e1b70996-565e-44fc-b6f2-2768d8fb3b86
TAB GraphQL race card: RacingRaceCard:e1b70996-565e-44fc-b6f2-2768d8fb3b86
TAB final-field market: RacingMarket:f7a1c602-0e3f-4c57-a128-0361bce5416f
```

The GraphQL `RacingRace` UUID can be converted to a `RacingRaceCard` ID by
swapping the type prefix. The Form Guide `FlucID` did not directly expose the
GraphQL UUID, so the reliable route is currently:

1. Use TAB Form Guide for track/date/race discovery when needed.
2. Use TAB GraphQL `racingDay` with `categories: ["HORSE"]` and
   `regions: ["DOMESTIC"]` to find the matching `RacingRace` UUID.
3. Store both ID families on the race record.

## Discovery Strategy

Use a multi-source approach:

1. Fetch TAB Form Guide date page.
2. Parse all meetings where `Country = "NZ"`.
3. Store `RaceType`, `TrackSlug`, `MeetingID`, and each race `EventID`.
4. Fetch each Form Guide race page for runner metadata.
5. For harness, fetch HRNZ result pages after the race day for official final results.
6. For TAB GraphQL race-card IDs:
   - Use direct TAB race URLs when available.
   - Investigate whether Form Guide `FlucID` or `EventID` can be mapped to `RacingRaceCard` IDs.
   - If no mapping is available, record TAB GraphQL fields as unavailable for that race.

## Market Mover Strategy

The `isMarketMover` field has been observed in TAB's race-card frontend query shape, but not reliably accessible after races are settled.

For MVP:

- Add `is_market_mover` to odds snapshots.
- Capture it only when a pre-race TAB race-card query succeeds.
- Do not backfill market mover from HRNZ or Form Guide unless a source explicitly marks it.
- For TAB GraphQL, use `RacingRaceCard:<uuid>.finalField.runnerRows[].isMarketMover`.

## Favourite Strategy

Use two favourite concepts:

1. `pre_race_favourite`
   - Source: TAB odds snapshot.
   - Definition: shortest win price at snapshot time.
2. `result_page_favourite`
   - Source: HRNZ `Fav` rank or equivalent result-page field.
   - Definition: official source's favourite rank after result publication.

Do not merge these silently. They may differ if prices move or if the source measures favourite differently.

## Open Research Tasks

- Find a supported domestic NZ thoroughbred result/feed source.
- Find a supported GRNZ greyhound result/feed source.
- Confirm whether TAB Form Guide race pages expose live market prices pre-race.
- Confirm whether TAB GraphQL has a race lookup by Form Guide ID, `FlucID`, or `EventID`.
- Capture a live domestic NZ race before jump and inspect whether `isMarketMover` is present.
- Decide retention rules for odds snapshots, for example every 15 minutes, 5 minutes, and 1 minute before jump.
