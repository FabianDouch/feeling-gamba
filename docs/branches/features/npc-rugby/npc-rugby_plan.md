# NPC Rugby Plan

## Context

Add the National Provincial Championship / NPC rugby union competition to the
app with the same user-facing coverage shape as NRL: Insights, Predictions,
Prediction History, current prediction locks, and finalised-model notification
support.

Point-in-time source notes from 2026-09-02, updated 2026-09-04:

- Official Provincial Rugby pages expose current NPC fixtures/results and
  historical fixtures/results for the competition.
- TAB NZ publicly describes Rugby Union coverage that includes Bunnings NPC,
  first/anytime try scorer markets, and Same Game Multis.
- TAB NPC market access is validated for current fixed-win capture:
  `RUGBY_UNION`, `new-zealand-npc`, `New Zealand NPC`, and two-runner `Match
  Betting` entries.
- Official Provincial Rugby fixture/result data is source-backed through the
  page's Opta Rugby Union `ru1` season feed. The validated 2026 feed uses
  competition id `208` and Opta season id `2027`.
- Official per-match player/event ingestion is source-backed through Opta RU7
  match-detail payloads. TAB `Anytime Try Scorer` entrant mapping is validated
  for current NPC markets, with `Penalty Try` excluded and ambiguous player
  variants left unmatched.

## Scope

- Add NPC as a first-class sport beside Racing, NRL, PFL, and UFC.
- Match NRL user-facing sections where source data supports them.
- Keep all rates and prices source-backed; do not infer historical odds.
- Store pending, unmatched, missing-price, non-standard, and missing-result
  states for auditability.
- Backfill official historical match/result/player data where available.
- Start price-backed history only from the first reliable TAB market snapshot
  unless a historical odds source is validated.

## Requirements Snapshot

- Insights:
  - Fixed win singles summary.
  - Fixed win by selection: home team, away team, favourite, favourite at home,
    favourite away.
  - Fixed win price, other-team price, price-difference, and round breakdowns.
  - Try-scorer percentage summary plus player, team, and price-bucket rows.
  - Same Game % summary and round rows for favourite team plus top-two
    favourite-team try scorers when player prices exist.
- Predictions:
  - Current fixed-win percentage singles.
  - Current try-scorer percentage singles.
  - Model finalisation cutoff based on the first NPC match start for the source
    date, aligned with the existing sport finalisation pattern.
- Prediction History:
  - Settled/pending/missing-result history for NPC singles and same-game multis.
  - Visible match heading date should use the match/card date, while
    `predicted_at` remains a separate label.
- Account features:
  - Current prediction locks should work for NPC models.
  - Favourited prediction-model notifications should include NPC models after
    finalisation.

## Decision / Reasoning Notes

- Prefer a narrow NPC implementation that mirrors the existing NRL pipeline
  rather than migrating NRL to a generic team-sport schema in the same change.
  This keeps the blast radius low while NPC source reliability is still being
  validated.
- Use shared helper modules for repeatable sport logic where practical: price
  buckets, opponent-minus-selected price difference, favourite venue labels,
  outcome settlement math, and generic app display mapping.
- Keep NRL and NPC fixed-win price, other-team price, and price-difference
  Insights aligned: each section should expose Favourite/Home/Away toggles
  backed by role-specific aggregate rows, not app-calculated filters.
- Keep NRL and NPC price-bucket granularity aligned: app-facing aggregate rows
  should exist for the default 50c buckets and optional 25c buckets, with the
  app selecting the stored bucket size.
- Fixed-win match-market capture must stay one row per source event. Repeated
  pre-kickoff cron runs update that row; they must not create repeated
  calibration selections for the same game.
- The validated TAB NPC `Match Betting` market is a two-runner team market.
  Draw/three-way result choices appear in other markets, so fixed-win team
  selections treat a drawn final score as a settled non-paying loss for both
  teams. Draws stay in the denominator because the team selection would not pay
  out.
- Player try-scorer predictions use official RU7 match rosters and try events
  plus current TAB `Anytime Try Scorer` prices. Entrant name variants are
  matched only when the same-team official roster has a single safe candidate.

## Plan

1. Source Validation

- Create `docs/integrations/npc-data-sources.md`.
- Validate official Provincial Rugby fixture/result access:
  - season, week/round, kickoff, venue, home team, away team
  - final scores and result status
  - stable match IDs or stable source keys
  - player rosters/appearances
  - try-scorer events with player/team IDs or names
- Validate TAB Rugby Union market access:
  - category enum, NPC competition slug, and event payload shape
  - fixed-win/head-to-head market name and whether draw is offered
  - `Anytime Try Scorer` market availability and entrant format
  - Same Game Multi price visibility, if any
- Decide whether official player data is strong enough for try-scorer
  denominators. If not, ship fixed-win first and gate try-scorer/Same Game %.

2. Data Model

- Add NPC-specific Supabase migrations:
  - `npc_teams`
  - `npc_players`
  - `npc_matches`
  - `npc_player_match_appearances`
  - `npc_try_scorers`
  - `npc_market_snapshots`
  - `npc_fixed_win_snapshot_results`
  - `npc_try_scorer_market_snapshots`
  - `npc_same_game_multi_results`
  - `npc_insight_aggregates`
  - `npc_single_predictions`
- Use `source = 'official_provincial_rugby'` or another validated source name
  consistently.
- Include indexes and RLS policies equivalent to the NRL app-facing tables.
- Include non-standard handling from day one; drawn final scores are settled
  losses for fixed-win team selections.

3. Ingestion

- Add `refresh-npc-results-from-official.mjs` for official Provincial
  Rugby/Opta RU1 fixtures/results and RU7 player appearances/try events.
- Add `refresh-npc-market-snapshots-from-tab.mjs`.
- Add `refresh-npc-try-scorer-market-snapshots-from-tab.mjs` after player
  entrant matching is validated.
- Add `reconcile-npc-fixed-win-snapshots.mjs`.
- Add `rebuild-npc-same-game-multis.mjs` after NPC try-scorer market capture is
  source-validated.
- Add `rebuild-npc-insight-aggregates.mjs`.
- Add `generate-npc-single-predictions.mjs`.
- Add an orchestration script equivalent to `refresh:nrl-current-markets`.
- Add GitHub workflows:
  - pre-match market refresh during the NPC match window
  - post-match result refresh and aggregate/prediction rebuild after the
    official result importer is implemented

4. Predictions

- Add model keys:
  - `npc_fixed_win_percentage_single_v1`
  - `npc_try_scorer_percentage_single_v1`
  - `npc_favourite_top2_try_scorers_same_game_percentage_v1`
- Fixed-win model:
  - rank current market favourites by official season-to-date team win rate
  - include bucket sample size and price metadata
  - avoid cash labels until enough settled price-backed rows exist
- Try-scorer model:
  - rank player candidates by official player/team try rate
  - use RU7 match rosters as the official current-lineup/player denominator
- Same Game %:
  - use favourite fixed-win plus two shortest-priced favourite-team try scorers
  - label returns as estimated unless quoted SGM prices are captured
  - keep rows source-backed through captured TAB try-scorer prices and official
    RU7 try settlement

5. App UI

- Add NPC to sport toggles in Insights, Predictions, Prediction History, and
  any current-prediction lock/favourite-model UI.
- Reuse the NRL panel layout with NPC labels.
- Add NPC data mappers equivalent to `supabaseNrl.ts` and NRL prediction data
  mappers.
- Keep fixed-win and same-game copy neutral: no stake sizing, bankroll guidance,
  or automated wagering.

6. Backfill

- Backfill official NPC fixtures/results for current and historical seasons once
  the source adapter is validated.
- Backfill player appearances and try scorers from official Opta RU7 match
  details for retained NPC fixture rows.
- Rebuild `npc_insight_aggregates` after each official backfill.
- Rebuild `npc_insight_aggregates` after the `bucket_size` migration so
  existing NPC rows are backfilled into both 50c and 25c app views.
- Do not backfill historical fixed-win prices unless a source-backed historical
  odds feed is validated.
- Begin current TAB market capture as soon as fixture matching is reliable so
  price-backed calibration starts immediately.

## Implementation Checkpoints

- Source validation doc created with current TAB market payload evidence and
  official-result source evidence.
- Supabase migrations applied locally and remotely.
- TAB fixed-win market dry-run captures pre-kickoff NPC prices.
- Fixed-win reconciliation produces settled/pending/unmatched/missing-result
  rows, with drawn final scores counted as settled losses. As of 2026-09-04 it
  also rematches existing TAB snapshots after official fixture rows arrive.
- Insights rebuild writes app-facing NPC fixed-win rows.
- App shows NPC Insights without changing NRL behavior.
- Predictions generation writes current NPC rows.
- Prediction History remains incomplete until NPC history RPCs/read models are
  added.
- Scheduled market workflow runs successfully for one NPC weekend.
- Scheduled result workflow added at `.github/workflows/npc-result-refresh.yml`.
- As of 2026-09-04, live backfill wrote 1,932 NPC player appearances, 464
  players, and 329 official try rows for the 2026 season; current TAB capture
  wrote 180 real player try-scorer prices for six open events, with 177 matched
  to official player IDs and three left unmatched.

## Key Paths

- `docs/integrations/npc-data-sources.md`
- `docs/architecture/data-model.md`
- `docs/architecture/ingestion-plan.md`
- `docs/architecture/application-architecture.md`
- `docs/architecture/information-architecture.md`
- `supabase/migrations/*npc*.sql`
- `packages/ingestion/scripts/*npc*.mjs`
- `apps/mobile/src/data/supabaseNpc.ts`
- `apps/mobile/src/data/supabaseNpcPredictions.ts`
- `apps/mobile/src/screens/InsightsScreen.tsx`
- `apps/mobile/src/screens/PredictionsScreen.tsx`
- `apps/mobile/src/screens/PredictionHistoryScreen.tsx`
- `.github/workflows/npc-market-refresh.yml`
- `.github/workflows/npc-result-refresh.yml`

## Risks / Unknowns

- Some TAB player names may differ from official Opta names. The matcher only
  applies conservative same-team single-candidate joins; unmatched rows stay
  auditable instead of guessed.
- Drawn fixed-win outcomes are deliberately counted as settled losses for NPC
  team selections.
- NPC team naming has macrons, sponsor names, and aliases that can make source
  matching fragile.
- Historical odds are unlikely to be available from the same current-market
  source, so cash calibration may start with a small sample.

## Validation Plan

Planned checks:

- `node --check packages/ingestion/scripts/refresh-npc-market-snapshots-from-tab.mjs`
- `node --check packages/ingestion/scripts/refresh-npc-results-from-official.mjs`
- `node --check packages/ingestion/scripts/refresh-npc-results-and-insights.mjs`
- `node --check packages/ingestion/scripts/reconcile-npc-fixed-win-snapshots.mjs`
- `node --check packages/ingestion/scripts/rebuild-npc-insight-aggregates.mjs`
- `node --check packages/ingestion/scripts/generate-npc-single-predictions.mjs`
- `npm --workspace @feeling-gamba/ingestion run typecheck`
- `npm --workspace @feeling-gamba/mobile run typecheck`
- dry-run official NPC fixture/result refresh
- dry-run TAB current-market capture before kickoff
- production readback for `npc_insight_aggregates` and `npc_single_predictions`

2026-09-04 validation:

- `refresh:npc-results -- --season=2026 --dry-run --include-fixtures` mapped 70
  non-placeholder official matches and 14 teams from Opta RU1.
- `refresh:npc-results-and-insights -- --season=2026 --require-supabase` wrote
  70 `npc_matches`, rematched 7 of 7 existing TAB market snapshots, rebuilt 54
  `npc_insight_aggregates`, and generated 6 current fixed-win
  `npc_single_predictions`.

Deferred checks / reason:

- Same Game % settlement should be deferred until player try-scorer prices and
  official scorer IDs are validated.
- Quoted same-game cash returns should be deferred until the TAB payload exposes
  a source-backed SGM price or a manual calibration workflow is approved.

## Release Notes

- Added official NPC fixture/result ingestion, scheduled result refresh, fixed
  win snapshot rematching, NPC Insight rebuild, and current fixed-win prediction
  regeneration. Player-event, try-scorer, same-game, and history read-model
  work remains source-gated.
