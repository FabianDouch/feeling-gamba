# Football price-gap trial

## Context

Clarified 2026-09-25: the user intended Prediction History reconstructed from
already collected football data. The original forward-only implementation
misinterpreted that request. Historical backtesting is now the default history
view; prospective tracking remains available separately. Market snapshots are
mutable per event, and historical result publication times are unavailable.

## Requirements and decisions

- One coherent implementation slice: frozen prospective forecasts, settlement,
  server-side evaluation, history UI, scheduling, and validation.
- Compare normalised home/draw/away market probability, pooled historical gap
  win rate, and regularised logistic calibration using favourite price, gap,
  draw probability, favourite venue, and league.
- Track exact $2.00–$2.49 and cumulative $2.00+ independently; never sum them.
- Reconstruct historical predictions at each retained pre-kickoff price timestamp
  using earlier matches with a fixed 24-hour result-availability embargo.
- Label reconstructed records as Historical backtest and retain the explicit
  limitation that actual historical publication times are unverified.
- Keep forward forecasts separate, frozen within 24 hours of kickoff.
- Train only on distinct previously settled events with captured pre-match
  prices. Draws are losses; unknown/non-standard outcomes remain unscored.
- Show samples, unavailable model counts, Brier/log loss, paired market baseline,
  calibration bins, and notional $1 returns. All models assess the same favourite;
  returns describe the cohort, not separate model trading strategies.
- New records stay outside current recommendations and notifications.

## Implementation checkpoints

- Current: historical replay implemented, populated in the linked database and verified in the local app.
- Validation: deterministic model/temporal/settlement tests, SQL execution where
  local tooling permits, ingestion tests, mobile typecheck and targeted lint.
- Deployment: apply only the additive backtest migration, then populate history
  from the existing linked-project football results and verify public app reads.

## Risks

Sparse earlier history can keep learned models unavailable. Reconstructed
results are model research; forward trial results are separately identified. Existing sources
and their documented regulation-time settlement confidence remain authoritative.

## Implementation summary

- Added pure training/generation/settlement logic and a paginated ingestion runner.
- Added immutable forecast storage, public read-only access and a full-cohort RPC.
- Added football history controls, model comparisons, calibration and paged rows.
- Added a twice-hourly workflow with dry-run manual dispatch.
- Updated existing architecture/statistics/ingestion docs and canonical YAML;
  rendered architecture outputs are explicitly marked for regeneration.

## Validation

- Passed 16 ingestion tests (11 new trial tests plus 5 existing source tests).
- Passed all 7 existing mobile fixture tests.
- Passed mobile and ingestion TypeScript checks; final mobile check used the
  normal heap after aligning trial reads with the existing public REST pattern.
- Passed targeted ESLint, Node syntax checks, YAML parsing and git diff checks.
- Passed the migration and SQL assertions in isolated PostgreSQL 15: frozen
  inputs, late-insert rejection, paired scores, missing-model denominators,
  returns, separate cohorts, corrections and anonymous reads. Fixtures rolled back.
- Browser visual validation and live source/deployment checks were not run.

## Historical backtest correction and activation

- Added `football_price_gap_backtests` and its separate summary/replacement RPCs.
- Replacement is atomic and service-role-only; invalid input preserves the prior
  reconstruction and an older build cannot overwrite a newer one.
- Existing forward forecast storage and summary remain separate.
- Dry run on 2026-09-25 NZ: 216 source rows, 118 usable settled priced matches,
  59 distinct qualifying matches, 8 exact-cohort and 59 cumulative-cohort rows.
- Exact cohort: 6/8 favourite wins; cumulative cohort: 43/59 favourite wins.
- Historical-rate predictions available for 26 cumulative-cohort matches; the
  exact cohort and richer model currently lack sufficient earlier training data.
- Passed 22 ingestion tests, mobile typecheck, targeted lint, and a linked-database
  transactional migration rehearsal covering atomic replacement, reruns, rollback
  on invalid input, stale-build rejection, public reads and write restrictions.
- Applied migrations `202609250002` and `202609250003` to the linked project and
  recorded their versions on 2026-09-25 NZ. The scoped replacement migration
  satisfies hosted PostgREST safe-update rules.
- Saved 67 cohort rows representing 59 distinct historical matches; forward
  forecast count remains zero. Historical exact/cumulative cohorts overlap.
- Verified public reads in headless Chrome against the local Expo app: historical
  default, 8 exact rows, 59 cumulative rows, pagination and separate forward mode.
- Captured desktop/mobile views; browser reported no page errors.
- On the 26 comparable cumulative rows, historical-rate Brier is 0.1987 versus
  market Brier 0.1770; log loss is 0.5876 versus 0.5322. These results do not show
  a prediction improvement. Rich-model evaluation remains unavailable.
- Updated local app code is active in the development server. No release build,
  commit or push was performed.

Manual rebuild:
`npm --workspace @feeling-gamba/ingestion run backfill:football-price-gap-history -- --require-supabase`.
Add `--dry-run` to inspect counts without writing. Run again after additional
settlements or source corrections; historical reconstructions may change as
retained source data is corrected. No past records are labelled live forecasts.

## History hierarchy correction (2026-09-25)

- User clarified that football must follow Racing/UFC/NRL/NPC's shared hierarchy:
  league → Singles/Multis → prediction model type → model variation.
- Use Win % as the type. Singles has Price gap, Market odds, and Price gap +
  context variations, each with $2.00–$2.49 and $2.00+ versions. Multis remains
  explicitly unavailable until a multi model exists.
- Move All football to league selection and Historical backtest/Forward trial
  below model selection as a History source filter.
- Show one selected model's probability/performance at a time; collapse diagnostic
  detail and keep cohort return semantics explicit. Reset pages when scope changes.
- Retain existing backtest records and public API contracts; no database changes.
- Validation: mobile lint, YAML parsing and diff checks passed. Chrome checks
  passed for hierarchy order, selected model scores, cohort pagination reset,
  forward separation, the multi empty state and sibling sport controls, with no
  page errors. Desktop/mobile screenshots were reviewed. Final mobile typecheck passed.
- Shared tabs expose their selected state on web as well as native accessibility.
