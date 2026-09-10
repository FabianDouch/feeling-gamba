# Tennis Insights Feature Plan

## Goal

Add Tennis to Insights as one grouped sport with fixed-win favourite
calibration only. Do not add multis, home/away, predictions, or prediction
history for the first slice.

## Source Decision

- TAB GraphQL supplies current two-runner `Match Betting` prices.
- The Odds API supplies ATP/WTA tournament event and score settlement.
- Only supported ATP/WTA singles competitions are captured.
- ITF, Challenger, WTA125, and doubles events stay out of calibration until a
  source-backed result path is validated.

## Implementation

- Create `tennis_*` tables for Odds API matches, TAB market snapshots,
  reconciled fixed-win result rows, and app-facing insight aggregates.
- Add ingestion scripts for TAB capture, Odds API result refresh, fixed-win
  reconciliation, aggregate rebuild, and operator wrappers.
- Add GitHub Actions schedules for frequent TAB current-market capture and
  lower-frequency Odds API post-match result catch-up.
- Add Tennis to the Insights sport selector with fixed-win summary cards,
  favourite price, other-player price, price-difference, tour, and competition
  breakdowns.
- Support default 50c buckets, optional 25c buckets, exact rows, and `+`
  threshold rows.

## Validation

- Run Node syntax checks for new ingestion scripts.
- Run ingestion and mobile TypeScript checks.
- Dry-run TAB current-market capture and Odds API result refresh. A zero TAB
  capture is acceptable when current TAB Tennis events are lower-tier or
  doubles competitions that are intentionally excluded.
