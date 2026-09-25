# Shared Sport → League navigation

## Context

Approved 2026-09-25; shared navigation and combined readers implemented locally.
No database changes in these slices. The user prefers Insights' Sport → League navigation and wants the same
structure across views, including predictions and prediction history spanning
all football leagues. This supersedes the flat sport/league tabs and standalone
All football tab recently added to Prediction History.

Recommended initial scope: Insights, Predictions and Prediction History.
Historical Data and Promos are a follow-up unless the user elects to include
those views. Historical Data currently exposes Racing/UFC/PFL; Promos is racing
oriented. Matching navigation must not imply that other data exists there.

## Requirements and IA

Use one shared catalogue, control component, label order and selection model.

- Sport: Racing, Tennis, Rugby League, Rugby Union, Football, American Football,
  Combat Sports, in the same order as Insights.
- League: options belonging only to the selected sport; retain the second row
  even where there is only one option, including Racing → Racing.
- Insights: Sport → League → existing insight-specific controls.
- Predictions and Prediction History: Sport → League → Singles/Multis → Model
  type (Cash, Win %, Placing where supported) → Model variation → local filters.
- Football defaults to All Football. A league selection narrows the same view.
- Preserve selected sport/league when moving between the three views during the
  session. Remember the last league selection for each sport; first visits use
  the defaults below. Keep date and model settings local to each view.
- Preserve a compatible format/type/variation when changing leagues; otherwise
  choose a documented valid default. Never silently fetch another league.
- Show unsupported branches with a specific unavailable state, distinct from
  supported branches with zero records or failed requests.

| Sport | League options | Initial scope |
| --- | --- | --- |
| Racing | Racing | Racing |
| Tennis | All Tennis | All Tennis |
| Rugby League | All Rugby League, NRL | All Rugby League |
| Rugby Union | All Rugby Union, NPC | All Rugby Union |
| Football | All Football, UCL, EPL, La Liga, UEFA Nations League, Bundesliga, Serie A, Ligue 1, MLS, Europa League, EFL Cup | All Football |
| American Football | NFL | NFL |
| Combat Sports | All Combat Sports, UFC, PFL | All Combat Sports |

All Combat Sports is an addition to Insights' existing UFC/PFL choices.
Where models or aggregate schemas differ, this scope shows labelled league
sections instead of claiming a common model or pooled score. Existing same-card
multis remain separate; an all-sport scope does not create cross-league multis.

## Combined football behavior

### Predictions

- Present a single upcoming list for the chosen compatible model family across
  all ten leagues, with a league badge and original model identity on every row.
- Map shared variation labels such as Fixed win % and Goal scorer % to each
  league's real model keys; availability is declared per league and view.
- Add the missing mobile adapters for Europa League and EFL Cup. Their generation
  scripts and prediction tables already exist in the repository; confirm live
  read availability during implementation before claiming populated coverage.
- Retain original probabilities and league ranks. Default the combined list to
  kickoff time with a stable league/id tie-break; do not imply that differing
  league model scores form one calibrated global ranking.
- Fetch each league's relevant run with bounded concurrency and complete paging.
  Apply an explicit upcoming eligibility rule consistently to individual and
  combined views. Surface run date/freshness per league; do not fill empty current
  results with settled matches from that league's latest old run.
- Distinguish no upcoming rows, unsupported model, stale source and read failure.
  A partial result must identify missing leagues rather than appear complete.
- Keep lock/favourite/notification identities and cutoff rules league/model
  scoped. The combined view links to the individual scope for these actions;
  it must not submit a synthetic All Football model key to existing write APIs.

### Prediction History

- Reuse `football_price_gap_backtests` / `football_price_gap_predictions` and
  their existing summary RPCs: null league means all football; a league key
  narrows the same model/cohort/source view.
- Retain the six price-gap variations, selected-model metrics, history source
  filter, explicit reconstruction caveat, and independent cohort denominators.
- Aggregate across the full selected scope before pagination; never average
  league percentages or derive totals from only the displayed page.
- Give every row its league label; use stable pagination and reset pages when
  league, cohort, source or relevant filters change.
- Keep backtests separate from forecasts actually recorded before kickoff.
  Exact and cumulative gap cohorts overlap and must not be added together.
- Current Fixed win % / Goal scorer % generators and the price-gap backtest are
  different model families. Do not label price-gap history as history for the
  current models. Show explicit unavailable states where a model has no history
  read path; creating new settlement/history pipelines is separate work.

## Evidence and constraints before implementation

- `InsightsScreen.tsx` contains the seven sport groups and all ten football
  leagues; group state and league lists are currently local to that screen.
- `PredictionControls.tsx` uses a flat union mixing Racing, NRL, NPC and football
  leagues. Its special All football option is presently history-only.
- `PredictionsScreen.tsx` and `BetCandidatesSection.tsx` have individual football
  model state and separate readers for eight leagues; Europa League and EFL Cup
  have generators but no matching mobile prediction adapters.
- Existing group insight readers support football/rugby groups, not combat.
  Reuse their stored weighted totals. An All Combat Sports view initially uses
  separate UFC/PFL sections, avoiding an unsupported aggregate contract.
- NRL/NPC/PFL prediction history has explicit gaps. Tennis/NFL are present in
  Insights but lack equivalent prediction branches. Navigation will expose these
  honestly, without generating unsupported predictions.
- Existing uncommitted football/Nations League work must be preserved.

## Implementation plan and checkpoints

1. **Shared navigation and capability catalogue.** Extract sport/league metadata
   and a reusable labelled selector. Wire all three views to shared session
   scope, with explicit supported/empty/unavailable/error states and scope-safe
   resets. Connect aggregate choices to existing compatible reads; stage new
   combined readers with their complete views in step 2. Validate league choices,
   view switching, accessibility and unchanged individual-sport paths.
2. **Combined prediction views.** Implement the all-league current football
   adapter and missing cup adapters, connect football history to real all/single
   league scopes, and provide compatible rugby aliases and labelled combat league
   sections. Preserve scoped account actions, freshness and partial-failure
   behavior. Validate combined membership, dates, identities and full-scope totals.
3. **Consistency review and docs.** Verify desktop/mobile layouts and all supported
   branches; remove superseded flat controls. Update canonical architecture/IA
   YAML and markdown, regenerating diagrams or marking their stale status.

Current checkpoint: all three approved slices complete and validated locally.
Shared navigation, combined readers and final consistency fixes are implemented.
No further implementation checkpoint remains for this plan.

## Key paths

- `apps/mobile/src/App.tsx` — session sport/league state shared by views.
- New shared sport/league catalogue and selector under `apps/mobile/src/`.
- `apps/mobile/src/screens/InsightsScreen.tsx`.
- `apps/mobile/src/screens/PredictionControls.tsx`.
- `apps/mobile/src/screens/PredictionsScreen.tsx`.
- `apps/mobile/src/screens/BetCandidatesSection.tsx`.
- `apps/mobile/src/screens/PredictionHistoryScreen.tsx`.
- `apps/mobile/src/screens/FootballPriceGapHistory.tsx`.
- `apps/mobile/src/data/supabase*Predictions.ts` and `supabaseFootballTrial.ts`.
- `docs/architecture/information-architecture.{md,yaml}` and
  `docs/architecture/application-architecture.{md,yaml}`.

## Risk and complexity

Medium complexity and medium regression risk. Shared navigation is straightforward;
most risk sits in combined reads, league/model identity, mixed run dates, partial
failures and existing account actions. Prefer an application read adapter using
existing tables/RPCs initially; a new database union is warranted only if measured
request volume or pagination needs require it. No new odds sources, model training
or scheduled ingestion changes are expected for this navigation work.

## Validation plan

- `npm --workspace @feeling-gamba/mobile run typecheck`.
- `npm --workspace @feeling-gamba/mobile run lint`.
- Focused tests for catalogue membership, scope transitions, league/model ID
  collisions, upcoming eligibility, partial failures and aggregate denominators.
- Browser checks on desktop/mobile: all seven sports, every football league,
  All Football, cross-view selection, individual league narrowing, missing-data
  states, model changes, pagination and preserved account action scope.
- Check combined totals against constituent eligible rows and full history RPC
  results; verify that backtest/forward and overlapping cohorts remain separate.
- Regression checks for Racing Cash/Win %/Placing and singles/multis, UFC/PFL,
  NRL/NPC, and existing Insights aggregates.
- Executed checks and point-in-time live coverage are recorded below.

## First-slice implementation

- Shared seven-sport catalogue and labelled selector now replace the flat controls
  in Insights, Predictions and Prediction History. App shell owns session scope.
- Last league is remembered per sport and carried across participating views.
- Individual football model family stays selected when changing connected leagues;
  candidate/account state is isolated by real league key.
- Football history connects all ten league choices and All Football directly to
  existing RPCs, including Europa League and EFL Cup. No proxy league is used.
- Rugby all scopes route to their sole supported league. Tennis/NFL prediction
  branches, combined current football, current cup predictions and combined combat
  content show explicit unavailable states pending the relevant readers.
- The old flat prediction selector was removed. No database writes or ingestion
  changes were needed. Canonical docs/YAML updated; diagrams need regeneration.
- Passed final mobile typecheck/lint and 11 tests (4 navigation tests plus 7
  existing fixture tests), YAML parsing and diff checks.
- Chrome verified all football league options, cross-view/per-sport memory,
  compatible football model selection, historical combined/cup reads, rugby
  aliases, unavailable scopes and Racing/UFC/PFL defaults, with no page errors.
- Reviewed desktop/mobile screenshots. No release build, commit or push performed.
- At the first checkpoint, combined readers and final consistency review remained
  for steps 2–3; their results are recorded below.

## Second-slice implementation (2026-09-25)

- Connected All Football current predictions and both cup drilldowns to one
  shared reader. Existing eight league adapters now use the same latest-run,
  eligibility, freshness and pagination contract.
- Preserve real league/model/row identity and original league rank; combine by
  kickoff. Three workers, complete source paging, 20-second timeouts, and explicit
  partial failures prevent silent truncation. UI pages 20 matches at a time.
- Upcoming means pending, kickoff after the displayed read time, and finite
  0–100 model score. Missing prices remain unpriced. Runs older than 24 hours
  are flagged; explicit refresh rechecks eligibility and freshness.
- Preserve selected Fixed win % / Goal scorer % family between combined and
  individual football views. Coverage and row links open the real league for
  available account actions; cup account actions remain unavailable.
- All Combat Sports now shows independent labelled UFC/PFL sections across all
  three views. Combined account controls are hidden, with links to real league
  scopes. PFL history remains an explicit unavailable state.
- Existing combined football history and rugby aliases remain connected.
- Live public reads returned HTTP 200 for all ten prediction tables. At this
  check, Fixed win % had 55 upcoming rows: UCL 17, EPL 9, La Liga 10, Serie A 10,
  Ligue 1 9. Bundesliga and Europa League runs had no eligible upcoming rows;
  Nations League, MLS and EFL Cup had no generated rows. Counts are time-sensitive.
- All 18 mobile tests pass, including full paging beyond 1000 rows, duplicate
  identities, cutoff/settlement eligibility, missing scores/prices, stale runs,
  bounded concurrency, model identity, matching individual/combined membership,
  and failed later-page isolation.
- Chrome verified live coverage totals, cup states, model mapping, pagination,
  simulated EFL Cup failure/retry, retained 59-match backtest, combat sections and
  scoped links, with no page errors. Desktop/mobile screenshots were reviewed.
- Final mobile typecheck, lint, YAML parsing and diff checks passed. Architecture,
  IA and data-model docs are updated; diagrams remain marked for regeneration.
- No database writes, release build, commit or push were performed.

## Final consistency review (2026-09-25)

- Non-racing prediction branches now consistently expose only Win %; Racing
  retains Cash/Win %/Placing in both formats.
- Football format/model-family selection survives all-league, individual and cup
  drilldowns. UFC/PFL selections are remembered independently in each view, so
  opening an individual league preserves the model selected in its combined
  section. First visits still use valid league defaults.
- Removed the obsolete history effect that corrected models after flat-sport
  switching; league-owned state now prevents that cross-league mismatch.
- The app header wraps at narrow widths, fixing a clipped connection badge.
- All 18 tests and final lint pass. Canonical IA/architecture YAML and markdown
  reflect the completed behaviour; rendered diagrams remain explicitly stale.
- Final TypeScript, lint, YAML parsing and diff checks passed. Browser review
  covered seven sports across three views, all six Racing format/type branches
  in both prediction views, every football league, preserved football/combat
  selections, and historical/forward separation. No page errors were reported.
- Reviewed final desktop/mobile screenshots; header and scope controls fit at
  320, 390 and 768px widths. The final browser checks were completed after fixing
  the test's UFC accessible-name selector; no product defect was involved.
- Historical Data and Promos remain outside this approved rollout. Tennis/NFL
  predictions, football multis and PFL prediction history remain explicit
  capability gaps, not simulated data.
- Implementation is active in the local development app. No release build,
  commit or push was performed. Rendered diagrams remain marked for regeneration
  as permitted by the repository's documentation convention.
