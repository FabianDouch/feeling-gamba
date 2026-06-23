# HRNZ Integration Notes

## Status

Harness Racing New Zealand exposes public static-style result pages:

- Results index: `https://infohorse.hrnz.co.nz/datahrs/results/results.htm`
- Example Cambridge result page: `https://infohorse.hrnz.co.nz/datahrs/results/052109rs.htm`

The Cambridge page above was used for 2026-05-21 Cambridge Raceway harness results.

## Result Page Shape

The page includes one section per race with:

- Race number
- Race name
- Race class and distance
- Weather
- Track condition
- Full finishing order
- Final starter count
- Book number
- Horse name
- Barrier/draw
- Stake
- Favourite rank
- Time
- Margin
- Driver
- Trainer
- Dividends
- Race margins
- Race times
- Steward comments

## Favourite Field

HRNZ result rows include a `Fav` column. On the Cambridge 2026-05-21 result page, the favourite was represented by values such as:

- `1/2`
- `1/4`
- `1/1`

Interpretation for MVP:

- The row where `Fav` starts with `1/` is the favourite.
- The row where `Fav` starts with `2/` is second favourite.

This is useful after results are final, but it is not the same as a pre-race odds snapshot.

## Cambridge 2026-05-21 Findings

Race favourites from HRNZ result data:

| Race | Favourite | Result |
| ---: | --- | --- |
| 1 | #7 Spirit Of God | 4th |
| 2 | #5 Tizours | 2nd |
| 3 | #2 Captain Moonlight | 1st |
| 4 | #8 Two Francs | 8th |
| 5 | #7 He's Tough | 8th |
| 6 | #7 Tactical Approach | 1st |

## Parser Notes

Recommended parser flow:

1. Fetch the result HTML.
2. Split by race container IDs matching `results-*-race-*`.
3. Extract race header fields:
   - race number
   - race name
   - class/distance text
   - weather
   - track
4. Parse the participants table by `data-label` attributes.
5. Derive `starter_count` from non-scratched participant rows and `scratched_count` from rows where placing is `SCR`.
6. Extract post-race metadata from the `hrnz-datalist--after-race-video` block:
   - `Dividends`
   - `Margins`
   - `Times`
7. Upsert runners/results/dividends by meeting date, track, race number, and book number.

## Limitations

- HRNZ covers harness racing only.
- HRNZ does not expose TAB market mover.
- HRNZ result-page URL discovery still needs to be automated from the results index or calendar pages.
- The `Fav` rank is final result-page metadata and should be recorded separately from live TAB odds snapshots.

## Source URLs

- HRNZ homepage: `https://www.hrnz.co.nz`
- HRNZ result index: `https://infohorse.hrnz.co.nz/datahrs/results/results.htm`
- Cambridge 2026-05-21 result page: `https://infohorse.hrnz.co.nz/datahrs/results/052109rs.htm`
