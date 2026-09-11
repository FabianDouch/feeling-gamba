# English Premier League Data Source Validation

Last updated: 2026-09-11.

The first EPL slice mirrors the UCL team-sport pipeline with sport-specific
`epl_*` tables. It keeps the same Insights, Predictions, and reserved
Prediction History structure as UCL.

## Market Source

TAB NZ exposes Premier League betting under `SOCCER` / `premier-league`. The
EPL market refresh scripts use the same TAB GraphQL route as UCL:

- `refresh:epl-market-snapshots` captures the three-way `Match Result` market
  and stores home, draw, and away prices in `epl_market_snapshots`.
- `refresh:epl-goal-scorer-market-snapshots` captures `Anytime Goalscorer`
  prices and excludes `No Goalscorer`.

App-facing fixed-win calibration tracks home, away, favourite, favourite at
home, and favourite away team selections; drawn final scores are settled
non-paying losses for those team selections. Fixed-draw Insights separately
track the draw entrant from `draw_fixed_win_price` where a captured TAB price is
matched to an official result.

## Official Results

The official result source is the Premier League public football API at
`footballapi.pulselive.com`. The EPL result script resolves the public comp
season id from the season start year, then reads fixture rows, team scores,
fixture status, goals, and team squad rows.

Premier League fixture rows expose goal scorer person ids and match clock
metadata, but the validated public endpoints did not expose a stable match
lineup/appearance endpoint. For the initial EPL goal-scorer slice,
`epl_player_match_appearances` stores squad-roster proxy rows for each retained
match team. That makes player/team goal-rate signals source-backed by official
goals and rosters, but not true minutes-played rates.

## Backfill Rule

Historical EPL prices must not be inferred. By default `refresh:epl-results`
writes official rows only when the match can be matched to an existing TAB
fixed-win snapshot. `--allow-unpriced-backfill` is for dry-run/source validation
only unless a future task explicitly approves official-only historical rows.

## Implemented Scripts

- `refresh:epl-current-markets`: captures TAB markets, refreshes matching
  priced official fixtures, reconciles, rebuilds, and regenerates current
  predictions.
- `refresh:epl-market-snapshots`: captures current TAB `Match Result` prices.
- `refresh:epl-goal-scorer-market-snapshots`: captures current TAB `Anytime
  Goalscorer` prices.
- `refresh:epl-results`: reads Premier League public fixture, score, roster,
  and goal rows, price-backed by default.
- `reconcile:epl-fixed-win`: derives `epl_fixed_win_snapshot_results`.
- `rebuild:epl-same-game-multis`: derives favourite-team plus top-two
  goalscorer Same Game % rows from captured prices.
- `rebuild:epl-insight-aggregates`: rebuilds fixed-win, fixed-draw,
  goalscorer, and same-game rows in `epl_insight_aggregates`, including 50c/25c
  exact and cumulative fixed-win/draw price buckets.
- `generate:epl-single-predictions`: writes current fixed-win and goalscorer
  single rows to `epl_single_predictions`.
- `refresh:epl-results-and-insights`: refreshes priced official rows,
  reconciles, rebuilds, and regenerates current predictions.

## Scheduling

`.github/workflows/epl-market-refresh.yml` runs the current-market wrapper every
15 minutes across a broad Premier League weekend/midweek UTC window.
`.github/workflows/epl-result-refresh.yml` runs repeated idempotent post-match
catch-up passes across the same days. Both schedules are intentionally broad
because EPL kickoff times vary for New Zealand viewers.
