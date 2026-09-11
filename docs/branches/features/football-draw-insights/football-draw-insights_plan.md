# Football Draw Insights Plan

## Context

As of 2026-09-11, UCL and EPL TAB `Match Result` snapshots already capture
home, draw, and away fixed-win prices. Fixed-win team-selection calibration
continues to treat drawn final scores as settled non-paying losses for home,
away, favourite, favourite at home, and favourite away selections.

The new draw insight adds a separate calibration stream for the draw entrant
itself. It must only use captured TAB draw prices matched to official results.
Official result-only history must not be used unless a future task explicitly
adds source-backed price history.

## Scope

- Add `fixed_draw_single` aggregate support for UCL and EPL.
- Rebuild draw aggregates from canonical fixed-win snapshot result rows so one
  TAB source event contributes one draw selection.
- Store overall draw performance plus draw price buckets.
- Support the same price bucket controls used by football fixed-win sections:
  50c/25c granularity and Exact/+ cumulative threshold modes.
- Show the draw section only for UCL and EPL Insights for now.

## Out Of Scope

- No NRL/NPC draw tracking in this change.
- No draw predictions.
- No official-only historical backfill without captured TAB draw prices.
- No inferred bookmaker prices.

## Implementation

1. Extend UCL/EPL `insight_type` constraints to allow `fixed_draw_single`.
2. Update UCL/EPL aggregate rebuild scripts to derive draw rows from
   `draw_fixed_win_price` and final scores.
3. Update UCL/EPL Supabase readers to fetch draw overall, exact bucket, and
   plus bucket rows.
4. Render a `Fixed draw singles` subsection inside UCL/EPL Insights using the
   existing 50c/25c and Exact/+ controls.
5. Rebuild stored UCL/EPL aggregates after the migration is applied.

## Validation

- Syntax-check both aggregate rebuild scripts.
- Typecheck ingestion and mobile workspaces.
- Apply the Supabase migration.
- Run both UCL and EPL aggregate rebuilds against Supabase.
- Query `ucl_insight_aggregates` and `epl_insight_aggregates` for
  `fixed_draw_single` rows before treating the feature as live.
