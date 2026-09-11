# Spanish La Liga Feature Plan

## Goal

Add Spanish La Liga as a first-class football sport that follows the UCL/EPL
structure: Insights, current Predictions, scheduled market capture, scheduled
result settlement, fixed-win rows, fixed-draw rows, and reserved Prediction
History states.

## Implemented Scope

- Add `laliga_*` Supabase tables via
  `supabase/migrations/202609110002_laliga_pipeline.sql`.
- Capture one canonical TAB `Match Result` row per source event, including
  home, draw, and away prices.
- Read public La Liga fixtures/results/squads for priced matches only by
  default.
- Reconcile fixed-win team selections, treating full-time draws as losses.
- Rebuild fixed-win, fixed-draw, goalscorer, and same-game aggregate shapes.
- Generate current La Liga single predictions from stored current rows.
- Add La Liga to mobile Insights and Predictions, with Prediction History as an
  explicit empty state until history RPCs exist.
- Add GitHub Actions market and result refresh workflows.

## Source Confidence

Fixed-win and fixed-draw settlement can be source-backed once TAB prices are
captured and matched to public La Liga final scores. Goalscorer and Same Game %
settlement still needs a validated per-match scorer event feed; squad rows are
only a player identity proxy.

## Validation

- `node --check packages/ingestion/scripts/*laliga*.mjs`
- `npm --workspace @feeling-gamba/ingestion run typecheck`
- `npm --workspace @feeling-gamba/mobile run typecheck`
- Dry-run official La Liga result refresh with fixtures enabled.
