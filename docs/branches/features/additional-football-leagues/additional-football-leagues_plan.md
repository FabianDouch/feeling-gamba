# Additional Football Leagues Feature Plan

## Goal

Add German Bundesliga, Italian Serie A, French Ligue 1, and MLS as first-class
football sports that follow the UCL/EPL/La Liga structure: Insights, current
Predictions, scheduled market capture, scheduled result settlement, fixed-win
rows, fixed-draw rows, and reserved Prediction History states.

## Implemented Scope

- Add `bundesliga_*`, `seriea_*`, `ligue1_*`, and `mls_*` Supabase tables via
  the 2026-09-11 football league migrations.
- Capture one canonical TAB `Match Result` row per source event, including
  home, draw, and away prices.
- Read public fixture/result feeds for priced matches only by default.
- Reconcile fixed-win team selections, treating full-time draws as losses.
- Rebuild fixed-win and fixed-draw aggregate shapes.
- Generate current fixed-win single predictions from stored current rows.
- Add each league to mobile Insights and Predictions, with Prediction History
  as an explicit empty state until history RPCs exist.
- Add GitHub Actions market and result refresh workflows for each league.

## Source Confidence

Fixed-win and fixed-draw settlement can be source-backed once TAB prices are
captured and matched to public final scores. Goalscorer and Same Game %
settlement still needs validated per-match scorer feeds and TAB goalscorer
market mapping.

## Validation

- `node --check packages/ingestion/scripts/refresh-football-league-results-from-json.mjs`
- `node --check packages/ingestion/scripts/*{bundesliga,seriea,ligue1,mls}*.mjs`
- `npm --workspace @feeling-gamba/ingestion run typecheck`
- `npm --workspace @feeling-gamba/mobile run typecheck`
- Dry-run official result refreshes with fixtures enabled for each league.
