# TAB Form Guide Notes

## Status

TAB Form Guide is a public Next.js app:

- `https://formguide.tab.co.nz`

It exposes meeting and race metadata in rendered HTML/React payloads. This appears more useful for NZ domestic race discovery than the TAB GraphQL meeting queries tested so far, especially for harness and greyhound meetings.

## Date Page

Example:

```text
https://formguide.tab.co.nz/2026-05-21
```

The date page includes sections for:

- Horse Racing - Australia & New Zealand
- Harness Racing - Australia & New Zealand
- Greyhound Racing

For Cambridge harness on 2026-05-21, the page exposed:

```json
{
  "RaceType": "harness_racing",
  "Track": "Cambridge",
  "TrackSlug": "cambridge-nz",
  "Day": "2026-05-21",
  "Country": "NZ",
  "State": "NZ",
  "Weather": "Fine",
  "NumberOfRaces": "6",
  "MeetingID": "cambridge-raceway-260521",
  "TrackCondition": "Good",
  "Races": [
    {
      "EventID": "racingform-hrnz-cambridge-raceway-260521-1",
      "RaceNumber": "1",
      "Status": "Final",
      "Name": "NZMCA PARKING AT CAMBRIDGE RACEWAY MOBILE PACE"
    }
  ]
}
```

## Race Page

Example:

```text
https://formguide.tab.co.nz/form/cambridge-raceway-260521-1
```

The page includes detailed race form data:

- Meeting metadata
- Race name/status/start time
- Number of runners
- Runners
- Runner statistics
- Race comments
- Previous form
- Starting prices in historical form lines

For final Cambridge harness pages, `Meeting.Markets` was observed as an empty array. That means Form Guide may not retain current/final market favourite or market mover data after a race.

## Useful Fields

Date page:

- `RaceType`
- `Track`
- `TrackSlug`
- `Day`
- `Country`
- `State`
- `Weather`
- `NumberOfRaces`
- `MeetingID`
- `Races[].EventID`
- `Races[].RaceNumber`
- `Races[].Status`
- `Races[].StartTime`
- `Races[].Name`

Race page:

- `RaceID`
- `FlucID`
- `RaceNumber`
- `Name`
- `Status`
- `NumberOfRunners`
- `StartTime`
- `Distance`
- `Gait`
- `Classes`
- `RaceComment`
- `Runners[]`

## Race ID Pattern

For Cambridge harness:

- Meeting: `cambridge-raceway-260521`
- Race page: `/form/cambridge-raceway-260521-1`
- Event ID: `racingform-hrnz-cambridge-raceway-260521-1`
- Fluc ID: `hrnz-cambridge-raceway-260521-1`

For NZ greyhound Cambridge on the same date:

- Track: `Cambridge (G)`
- Track slug: `cambridge-g-nz`
- Race page examples: `/form/160256-260521`, `/form/159488-260521`
- Event IDs use `racingform-grnz-...`

For some thoroughbred races:

- NZ races may use numeric date IDs, for example `/form/55792-20260521-1`
- Australian/international races may use base64-like IDs, for example `/form/cmFjZToyMDEwMjY4`

Ellerslie thoroughbred example for 2026-05-23:

```text
MeetingID: 55013-20260523
TrackSlug: ellerslie-nz
Race URL: /form/55013-20260523-1
EventID: racingform-nztr-55013-20260523-1
FlucID: nztr-55013-20260523-1
```

The date page exposed 8 Ellerslie races on 2026-05-23. Race pages exposed
`NumberOfRunners`, `Runners[]`, `FlucID`, race comments, classes, distance, and
form data. They did not expose live market data in `Meeting.Markets`; each tested
race had `Markets: []` and no `MarketMover` text in the rendered payload.

| Race | Name | Declared runners from Form Guide | TAB current starters |
| --- | --- | ---: | ---: |
| 1 | MYRACEHORSE 1100 | 7 | 7 |
| 2 | THE LAWN SHED 2100 | 6 | 6 |
| 3 | TRACKSIDE.CO.NZ 1500 | 7 | 6 |
| 4 | THE LAWN SHED 1400 | 20 | 19 |
| 5 | CAMBRIDGE STUD 2100 | 17 | 16 |
| 6 | JRA TROPHY | 11 | 11 |
| 7 | GOLF WAREHOUSE 1400 | 13 | 12 |
| 8 | SHOW BY SKYCITY 1600 | 14 | 14 |

Use Form Guide as the declared-field source and TAB GraphQL as the live starter
and market source when both are available.

## Historical Availability

Checked on 2026-06-15:

- `https://formguide.tab.co.nz/2025-12-15` rendered `No meetings found`.
- The page advised trying a date closer to today.
- For the six-month historical fixture starting on `2025-12-15`, Betcha GraphQL
  was used instead of Form Guide.

Treat Form Guide as a recent/current discovery and declared-field source until
historical retention is better understood.

## Implementation Guidance

- Use the date page as a discovery source for domestic NZ meeting/race IDs.
- Filter meetings where `Country = "NZ"`.
- Map `RaceType` to internal race code:
  - `horse_racing` -> `horse`
  - `harness_racing` -> `harness`
  - `greyhound_racing` -> `greyhound`
- Fetch race pages for runner-level form details.
- Do not rely on Form Guide alone for live, settled favourite, or market mover data.
- Save raw page payload fixtures because the Next.js payload format may change.
- Use `NumberOfRunners` as the declared race field size when it is present.
- Derive final starter count from `Runners[]` after excluding scratched runners if scratch status is present.

## Open Questions

- Does Form Guide expose live market data before race jump?
- Can Form Guide `FlucID` be mapped to TAB GraphQL `RacingRaceCard` IDs?
- Do greyhound pages expose final result data or only form data?
