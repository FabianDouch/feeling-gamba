# English Premier League Plan

Last updated: 2026-09-09.

## Goal

Add EPL as a first-class football sport using the same narrow UCL-shaped
pipeline, app structure, and price-backed calibration rules.

## Scope

- Add sport-specific `epl_*` Supabase tables for teams, players, matches,
  goals, fixed-win market snapshots/results, goalscorer market snapshots,
  same-game multi results, insight aggregates, and current single predictions.
- Capture TAB NZ Premier League `Match Result` and `Anytime Goalscorer`
  markets.
- Read official Premier League fixture/result/goal/squad rows from the public
  Premier League API.
- Show EPL in Insights with the same fixed-win, goalscorer, same-game, 50c/25c,
  Exact/+, and Favourite/Home/Away controls as UCL.
- Show EPL in Predictions under Singles -> Win % with fixed-win and goalscorer
  model tabs.
- Show EPL Prediction History as an explicit reserved branch until
  EPL-specific prediction settlement/history RPCs exist.

## Decisions

- Draw/three-way match result: stored as a draw price for auditability, but a
  drawn final score is a settled non-paying loss for home, away, and favourite
  team selections.
- Backfill: do not backfill historical EPL calibration without matching TAB
  fixed-win prices.
- Goalscorer denominator: use official squad roster proxy rows for the initial
  slice because a public match lineup/appearance endpoint has not been
  validated.

## Validation

- New EPL ingestion scripts must pass `node --check`.
- Ingestion and mobile workspaces must pass TypeScript checks.
- Official source dry-runs should use `--allow-unpriced-backfill --dry-run`
  only for source validation; production writes should remain `--priced-only`.
