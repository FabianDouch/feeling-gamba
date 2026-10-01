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
- Updated 2026-09-25 by user request: expose all six model/cohort variations in
  current football recommendations. Notifications remain outside this change.

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


## Current recommendations (2026-09-25)

- User requested recommending the same six tracked variations across All Football
  and all ten league scopes, replacing the former Fixed win % / Goal scorer % UI.
- One coherent slice implemented: shared variation controls, frozen-forward reader,
  selected-probability recommendations, missing-history states, tests and docs.
- Keep existing 24-hour entry window, one-hour source freshness, immutable forecast
  probabilities, model sample thresholds and separate historical backtests.
- Show league, selected probability, captured odds/gap and capture/forecast times.
  Expire cards at kickoff; page 20 after complete reads. Failed pages show retry.
- Null learned probabilities abstain and show an insufficient-history count.
  Models do not silently substitute market probabilities or pool overlapping cohorts.
- Multis, locks and notifications are not implemented for these variations.
- Validation: all 22 mobile tests, mobile typecheck and lint passed. Browser checks
  passed for all ten live league scopes and six controls, then browser-only fixtures
  exercised model probabilities, abstention, pagination, drilldown retention,
  multis, failed reads/retry and 1280/390/320px layouts with no page errors.
- Existing generator dry run read 216 results and found zero eligible new forward
  forecasts. Public app reads likewise showed no saved upcoming forecasts. No
  database write is needed for an empty generation run; no past forecast was invented.
- Source diagnostics found 75 upcoming snapshots, none within 24 hours of the
  check. The earliest retained kickoff is 2026-10-09 18:30 UTC; this describes
  stored source coverage, not a verified external fixture schedule.
- No schema, ingestion rule, commit, push or release deployment change. Canonical
  architecture/IA YAML updated; rendered diagrams still require regeneration.

## Nations League visible-data recovery (2026-09-27)

- Repaired live Nations League results and insights using the committed source
  filter correction: 18 settled matches, 16 pending, no missing/unmatched results.
- Ran the forward refresh after its dry run: five existing forecasts settled,
  four upcoming forecasts saved without overwriting frozen probabilities.
- Ran the historical rebuild after its dry run: 70 distinct qualifying football
  matches overall, including 11 Nations League matches; exact cohorts overlap.
- Real browser/public RPC checks confirmed four upcoming Nations League cards in
  both Price gap $2.00+ and Market odds $2.00+, 11 cumulative historical matches,
  one exact historical match, and forward history with five settled/four pending.
- Exact upcoming models remain empty; context models explicitly lack sufficient
  training history. All six variations checked, with no browser page errors.
- Added historical rebuild to the existing football workflow after forward
  refresh, preserving dry-run behavior. YAML and shell syntax validated. This
  scheduling change is local until pushed; the live data recovery is complete.

## Next-day forecast recovery (2026-09-29)

- Empty upcoming predictions were caused by stale captured prices: TAB capture
  failed with HTTP 403, and independently delayed forecast runs missed the
  existing one-hour freshness window after successful captures.
- Added forward generation to Nations League market orchestration after
  capture/import/reconciliation, retaining all model and timing rules. Dry-run
  and skip-prediction controls remain supported; unrelated batch flags are omitted.
- Live capture recovered 18 market snapshots; forward generation saved nine
  cohort rows for eight distinct matches on 30 September NZ. All eight have
  cumulative bucket/market/context probabilities; one also has exact market/context
  probabilities. Exact historical-rate probability remains unavailable.
- All 29 ingestion tests and script syntax checks passed, including orchestration
  order, dry-run flags and skipping predictions. Ingestion typecheck and diff
  checks passed. Live browser verification confirmed counts across all six
  variations and the same eight matches in All Football, with no page errors.
  No commit or push performed;
  pipeline and previously prepared history-workflow changes remain local.

## History coverage clarity and refresh (2026-09-29)

- Public app reads confirmed historical and forward records exist; the default
  exact bucket model's zero scored probabilities obscured the recorded history.
- Refreshed the stale historical backtest after a dry run: 74 distinct qualifying
  matches overall, including 15 Nations League matches. Forward history remains
  separate: nine settled forecasts and eight pending matches.
- Moved recorded/settled/pending/excluded counts above model performance, exposed
  the historical rebuild timestamp, and explained all-unavailable model scores.
  No model thresholds, default filters or backtest/forward semantics changed.
- Existing automatic historical-refresh workflow change is still local. Live
  data is refreshed; the UI change is available in the local development app.
- Canonical IA YAML updated; rendered IA outputs still need regeneration.
- Validation passed: mobile typecheck/lint, IA YAML and diff checks. Live browser
  checks verified All Football/Nations League backtest counts, separate forward
  totals, recorded-versus-scored explanations, and desktop/mobile layout with no
  page errors. Mobile screenshot reviewed.

## Recurrence while pipeline fix remains unpublished (2026-10-01)

- Actions still runs `b699379`: market capture succeeded at 00:31 UTC and forward
  generation ran at 01:32 UTC, just beyond the one-hour freshness cutoff. No
  qualifying forecast was saved despite both jobs reporting success.
- Checked all ten leagues; only Nations League had stored fixtures inside the
  24-hour window. Eight fixtures included four qualifying cumulative selections.
- Ran the previously validated local pipeline against live data, saving four
  new forecasts after a fresh capture. Existing probabilities remain immutable.
- Browser verification confirmed four cards in each cumulative variation and
  the same four matches in All Football; all exact variations correctly empty.
- No new model/code changes were needed. The previously prepared scheduling,
  history refresh and UI fixes are still local; publication remains outstanding.


## Publication (2026-10-01)

- User approved committing and pushing the prepared football fixes to `main`.
- This publication includes capture-linked Nations League forecast generation,
  scheduled historical backtest rebuilds, recorded-versus-scored history UI,
  regression coverage and the documentation updates recorded above.
- Prior checks passed: 29 ingestion tests, mobile/ingestion typechecks, mobile
  lint, workflow/IA YAML and shell syntax, and live desktop/mobile browser checks.
- No schema migration is required. Scheduled runs use the new pipeline once this
  commit reaches `main`; four upcoming cumulative predictions were already restored
  in the live database before publication. Source access failures can still occur.
