# UEFA Champions League Plan

## Context

Add UEFA Champions League as a first-class team sport beside NRL and NPC. The
user-facing structure should match the NRL/NPC shape: Insights, Predictions,
Prediction History, current prediction locks, and finalised-model notification
support. The same-game multi branch should use football goalscorers instead of
rugby try scorers.

Point-in-time source notes from 2026-09-07:

- TAB current-market access is validated for Champions League through
  `category = SOCCER` and `competitionSlug = uefa-champions-league`.
- TAB current events are exposed under the soccer UEFA competitions route, with
  open `Match Result` and `Anytime Goalscorer` markets.
- TAB `Match Result` is a three-runner market: home, draw, away. NRL/NPC-style
  team-selection rows should store home and away selections only; a draw is a
  settled non-paying loss for both team selections.
- TAB public GraphQL did not return closed/final Champions League events for
  backfilling historical prices in the same probe.
- UEFA public endpoints are reachable without credentials for competition,
  match, player, lineup, and full match-event data:
  `comp.uefa.com/v2/competitions`,
  `match.uefa.com/v5/matches`,
  `comp.uefa.com/v2/players`,
  `match.uefa.com/v5/matches/{id}/lineups`, and
  `match.uefa.com/v5/matches/{id}/events?filter=ALL`.
- UEFA match events include `type = GOAL` rows with scorer, team, phase, time,
  and total-score data. The first implementation slice should still validate
  own-goal and penalty event variants before writing settlement logic.
- football-data.org documents Champions League coverage and scorer endpoints,
  but direct API probes returned `403` without an authorized subscription, so it
  is not a no-credential backfill path for this project.

## Scope

- Add `ucl_*` sport-specific tables and scripts first, mirroring the narrow
  NRL/NPC pattern instead of introducing a generic team-sport schema.
- Keep all market prices source-backed from TAB pre-kickoff snapshots.
- Keep official fixture, result, lineup, appearance, and goal-event history
  source-backed from UEFA endpoints after validation.
- Treat football draws as settled fixed-win losses for home/away team
  selections, because a home/away team result pick would not pay out.
- Do not infer historical TAB odds or same-game multi quote prices.

## Requirements Snapshot

- Insights:
  - Fixed win singles summary.
  - Fixed win by selection: home team, away team, favourite, favourite at home,
    favourite away.
  - Fixed win price, other-team price, and price-difference buckets with
    Favourite/Home/Away role toggles.
  - Default 50c and optional 25c bucket-size toggles.
  - Goalscorer percentage summary plus player, team, and price-bucket rows.
  - Same Game % summary and round/stage rows for favourite team plus top-two
    favourite-team anytime goalscorers when player prices exist.
  - Half-time/full-time double section only if TAB exposes a reliable same-team
    HT/FT or equivalent football market that maps cleanly to home/home and
    away/away.
- Predictions:
  - Current fixed-win percentage singles.
  - Current goalscorer percentage singles.
  - Same-game percentage multi using favourite fixed-win plus the two shortest
    priced favourite-team anytime goalscorers.
  - Finalisation cutoff based on the first UCL match start for the source date.
- Prediction History:
  - Settled/pending/missing-result history for UCL singles and same-game multis.
  - Match heading dates should use the match date; `predicted_at` remains a
    separate label.

## Decision / Reasoning Notes

- Prefer `ucl_*` names because the user explicitly asked for the same structure
  as NRL/NPC and the current repo already uses sport-specific schemas for each
  non-racing source shape.
- Use TAB `Match Result`, not rugby `Match Betting`, for fixed-win snapshots.
  Store the draw entrant for audit/reference if useful, but do not treat draw as
  a selectable team row in NRL/NPC-style breakdowns.
- Do not backfill official-only UCL history in the first implementation. UEFA
  fixture, lineup, appearance, and goal rows are written only when they match a
  captured TAB fixed-win snapshot, so the stored UCL dataset remains
  price-backed from the start.
- Use UEFA direct endpoints in the first slice rather than adding the
  `uefa-api` package immediately. The open-source wrapper is useful validation
  evidence, but the repo's ingestion scripts already prefer small local source
  adapters.
- Same-game cash should remain estimated unless we validate a source-backed TAB
  same-game quote. Multiplying fixed-win and anytime-goalscorer leg prices is
  useful for ranking, but previous NRL calibration showed multiplied estimates
  can materially overstate quoted same-game prices.

## Plan

1. Source Validation

- Create `docs/integrations/ucl-data-sources.md`.
- Add read-only validation scripts for:
  - TAB `SOCCER` / `uefa-champions-league` current events.
  - TAB `Match Result` entrant roles and draw handling.
  - TAB `Anytime Goalscorer` market labels, entrant roles, and player-name
    variants.
  - UEFA matches for `competitionId = 1` and `seasonYear`.
  - UEFA lineups and event stream goal extraction, including penalties, own
    goals, substitutions, and players without minutes.
- Decide whether HT/FT double tracking is in scope after checking TAB football
  market labels. Do not ship it if the available market does not map to the
  existing home/home and away/away model.

2. Data Model

- Add UCL-specific Supabase migrations:
  - `ucl_teams`
  - `ucl_players`
  - `ucl_matches`
  - `ucl_player_match_appearances`
  - `ucl_goal_scorers`
  - `ucl_market_snapshots`
  - `ucl_fixed_win_snapshot_results`
  - `ucl_goal_scorer_market_snapshots`
  - `ucl_same_game_multi_results`
  - `ucl_insight_aggregates`
  - `ucl_single_predictions`
- Include optional draw fields in fixed-win snapshots/results for auditability:
  draw price, draw result, and final draw status.
- Keep RLS/read policies aligned with NRL/NPC public app-facing tables.
- Use uniqueness guards so repeated pre-kickoff captures update one canonical
  row per TAB source event.

3. Ingestion

- Add `refresh-ucl-results-from-official.mjs` for UEFA fixtures, results,
  players, lineups, appearances, and goal events.
- Add `refresh-ucl-market-snapshots-from-tab.mjs` for current `Match Result`
  prices.
- Add `refresh-ucl-goal-scorer-market-snapshots-from-tab.mjs` for current
  `Anytime Goalscorer` prices.
- Add `reconcile-ucl-fixed-win-snapshots.mjs`.
- Add `rebuild-ucl-same-game-multis.mjs`.
- Add `rebuild-ucl-insight-aggregates.mjs`.
- Add `generate-ucl-single-predictions.mjs`.
- Add orchestration wrappers equivalent to:
  - `refresh:nrl-current-markets`
  - `refresh:nrl-results-and-insights`
- Add GitHub workflows:
  - pre-match market refresh around Tuesday/Wednesday/Thursday morning NZ UCL
    kickoffs.
  - post-match result refresh catch-ups after the morning match window.

4. Predictions

- Add model keys:
  - `ucl_fixed_win_percentage_single_v1`
  - `ucl_goal_scorer_percentage_single_v1`
  - `ucl_favourite_top2_goal_scorers_same_game_percentage_v1`
- Fixed-win model:
  - rank current team selections by official season-to-date UCL team win rate.
  - treat draws as settled losses for team-selection calibration.
  - keep price bucket and other-team/difference metadata aligned with NRL/NPC.
- Goalscorer model:
  - rank candidates by official player/team goal rate.
  - use UEFA lineups/appearances as denominators where available.
  - leave current-lineup confidence explicit until UEFA lineup timing is
    validated for pre-kickoff availability.
- Same Game %:
  - use favourite fixed-win plus two shortest-priced favourite-team anytime
    goalscorers.
  - settle with official UEFA goal events.
  - label returns as estimated unless a quoted same-game price is captured.

5. App UI

- Add Champions League to sport toggles in Insights, Predictions, Prediction
  History, locks, and favourite-model notification UI.
- Add UCL data mappers equivalent to the NRL/NPC Supabase mappers.
- Reuse the NRL/NPC panel layout with football wording:
  - `Goalscorer` instead of `Try scorer`.
  - `Goals` instead of `Tries`.
  - `Match Result` source wording where diagnostic text is needed.

6. Backfill

- Do not backfill official-only UEFA fixtures/results unless matching TAB
  fixed-win prices exist in `ucl_market_snapshots`.
- Backfill official player list, lineups/appearances, and goal events only for
  matches that already have a captured fixed-win price snapshot.
- Optionally backfill earlier seasons only after a licensed/source-backed price
  archive is validated.
- Do not backfill historical TAB fixed-win, goalscorer, HT/FT, or same-game
  prices from the current TAB source; closed/final UCL events were not returned
  by the public GraphQL probe.
- Rebuild `ucl_insight_aggregates` after each priced official catch-up so fixed
  win, goalscorer, and same-game rows stay aligned with captured price data.

## Implementation Checkpoints

- Source validation doc created with exact TAB market labels and UEFA endpoint
  samples.
- Supabase migration drafted and applied locally/remotely.
- Official UEFA dry-run parses fixtures, teams, players, lineups, appearances,
  and goal events.
- TAB fixed-win dry-run captures current UCL `Match Result` prices and stores
  one canonical row per source event.
- TAB goalscorer dry-run captures current `Anytime Goalscorer` prices and
  produces safe player/team matches.
- Fixed-win reconciliation handles home win, away win, draw, pending,
  unmatched, and missing-result states.
- Same-game rebuild creates pending rows only when favourite team and two
  source-backed favourite-team goalscorer prices exist.
- Insights rebuild writes UCL fixed-win, goalscorer, and same-game rows.
- App shows UCL Insights without changing NRL/NPC behavior.
- Current prediction generation writes UCL rows.
- Prediction History shows UCL entries with correct match dates.
- Scheduled market and result workflows run successfully across one UCL match
  window.

## Key Paths

- `docs/branches/features/uefa-champions-league/uefa-champions-league_plan.md`
- `docs/integrations/ucl-data-sources.md`
- `docs/architecture/data-model.md`
- `docs/architecture/ingestion-plan.md`
- `supabase/migrations/*ucl*.sql`
- `packages/ingestion/scripts/*ucl*.mjs`
- `.github/workflows/ucl-*.yml`
- `apps/mobile/src/data/supabaseUcl.ts`
- `apps/mobile/src/data/supabaseUclPredictions.ts`
- `apps/mobile/src/screens/InsightsScreen.tsx`

## Risks / Unknowns

- TAB football uses three-way `Match Result`, so every fixed-win aggregate must
  explicitly count draws as settled team-selection losses.
- UEFA goal-event extraction needs validation for own goals, penalty goals,
  penalty shootouts, extra time, and abandoned/postponed matches.
- UCL kickoff windows are usually early morning in New Zealand, so schedules
  need sport-specific capture windows instead of reusing NRL/NPC evening
  windows.
- Player-name matching between TAB and UEFA may need aliases for initials,
  accents, shortened names, transferred players, and duplicate surnames.
- Historical price backfill is blocked unless a licensed odds archive or a TAB
  closed-market endpoint is validated.

## Validation Plan

Planned checks:

- `node --check packages/ingestion/scripts/refresh-ucl-results-from-official.mjs`
- `node --check packages/ingestion/scripts/refresh-ucl-market-snapshots-from-tab.mjs`
- `node --check packages/ingestion/scripts/refresh-ucl-goal-scorer-market-snapshots-from-tab.mjs`
- `npm --workspace @feeling-gamba/ingestion run refresh:ucl-results -- --dry-run --season=2026`
- `npm --workspace @feeling-gamba/ingestion run refresh:ucl-market-snapshots -- --dry-run --event-count=5 --markets-first=500`
- `npm --workspace @feeling-gamba/ingestion run refresh:ucl-goal-scorer-market-snapshots -- --dry-run --event-count=5 --markets-first=500 --entrants-first=80`
- `npm --workspace @feeling-gamba/mobile test`

Deferred checks / reason:

- Remote Supabase writes until migrations are reviewed.
- Scheduled workflow verification until the market/result wrappers exist and
  the workflow files are on the GitHub default branch.
