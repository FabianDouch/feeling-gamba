# NPC Rugby Data Source Validation

Checked on 2026-09-02. Updated on 2026-09-04 after validating the official
Provincial Rugby Opta feed.

## Implementation Status

The first NPC slice uses sport-specific `npc_*` tables and mirrors the narrow
NRL fixed-win path. Current fixed-win market capture, fixed-win reconciliation,
stored Insight aggregate rebuilds, current single prediction generation, and
the app-facing NPC Insights/Predictions toggles are implemented.

As of 2026-09-04, official NPC fixture/result/player ingestion is implemented
through the Provincial Rugby page's Opta feeds. The importer writes RU1
fixture/result rows plus RU7 per-match player appearances and try events into
`npc_players`, `npc_player_match_appearances`, and `npc_try_scorers`.

The same date validated TAB `Anytime Try Scorer` markets for current NPC
matches and enabled source-backed `npc_try_scorer_market_snapshots` plus
`npc_same_game_multi_results`. TAB `Penalty Try` selections are excluded from
player try-scorer snapshots because they cannot map to an official player.
TAB/Opta player-name variants are matched only when the same-team official
match roster has a single clear candidate; otherwise the row remains unmatched.

As of 2026-09-03, NPC fixed-win price, other-team price, and price-difference
Insight buckets mirror NRL by storing separate `favourite`, `home`, and `away`
rows under the same aggregate scopes. The app toggles between those roles under
each fixed-win price section. Backfill can only use stored `npc_*` market
snapshot/result rows; historical prices are not inferred.
As of 2026-09-04, NPC half-time/full-time double tracking is implemented with
`supabase/migrations/202609040002_team_sport_half_time_full_time_double.sql`,
`packages/ingestion/scripts/refresh-npc-half-time-full-time-snapshots-from-tab.mjs`,
and `packages/ingestion/scripts/reconcile-npc-half-time-full-time-snapshots.mjs`.
It stores one canonical TAB row per source event for the same-team home/home
and away/away double, derives the favourite from the shorter same-team double
price, and exposes app-facing home, away, favourite, favourite-at-home, and
favourite-away aggregate rows once source-backed halftime scores are available.
Historical HT/FT prices are not inferred.
The same date corrected fixed-win match-market capture to one canonical row per
TAB source event, updated by repeated pre-kickoff cron runs. The duplicate
cleanup/guard migration is
`supabase/migrations/202609030001_team_sport_single_fixed_win_market_capture.sql`.

## TAB NZ Market Source

Validated current NPC market access:

- Source URL: `https://www.tab.co.nz/sports/rugby-union/new-zealand-npc`
- TAB category enum: `RUGBY_UNION`
- Competition slug: `new-zealand-npc`
- Competition label: `New Zealand NPC`
- Fixed-win market label: `Match Betting`
- Try-scorer market label: `Anytime Try Scorer`
- Half-time/full-time market label: matched by TAB market names containing
  `Half Time` and `Full Time`

The observed `Match Betting` market has two team entrants with `HOME` and
`AWAY` roles. A draw entrant was not present in that market. Draw/three-way style
choices appear in other rugby-union markets, such as result or margin markets,
so the fixed-win pipeline stores only team selections from `Match Betting`.

NPC market capture is implemented in:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-market-snapshots -- --dry-run --event-count=5
```

NPC try-scorer market capture is implemented in:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-try-scorer-market-snapshots -- --dry-run --event-count=6 --markets-first=500 --entrants-first=60
```

NPC half-time/full-time market capture is implemented in:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-half-time-full-time-snapshots -- --dry-run --event-count=6 --markets-first=500
```

The scheduled wrapper is:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-current-markets -- --require-supabase
```

As of 2026-09-03, NPC fixed-win capture requests 500 open markets per event by
default to keep it aligned with NRL and avoid missing `Match Betting` when TAB
adds a large prop-market set.

## Settlement Rule

For NPC fixed-win calibration, a drawn final score is treated as a settled
non-paying loss for both team selections. The selection would not return a
fixed-win payout, so draws must remain in settled denominators with
`home_team_won = false`, `away_team_won = false`, and `favourite_won = false`.

This differs from NRL's existing draw-specific status handling. NPC
`npc_fixed_win_snapshot_results.outcome_status` intentionally does not include a
separate `draw` state.

## Official Result Source

The public Provincial Rugby NPC fixtures/results page is:

`https://www.provincial.rugby/npc/fixtures-and-results`

The page renders fixture/result data through Opta widgets. On 2026-09-04, the
page was validated with:

- Opta subscription id: `2f855a3f8d6d28e2e93c26a562f334a9`
- Opta competition id: `208`
- Opta season id for the 2026 NPC season: `2027`
- Public widget timezone: `Pacific/Auckland`
- Season fixture/result feed: OMO Rugby Union `ru1`
- Per-match player/event feed: OMO Rugby Union `ru7` via match endpoint
  `https://omo.akamai.opta.net/auth/?feed_type=ru7&game_id={source_match_id}`

`refresh-npc-results-from-official.mjs` now calls RU1 for fixtures/results and
RU7 for each retained fixture's player stats/events. It writes
`source = 'official_provincial_rugby'` rows to `npc_teams`, `npc_matches`,
`npc_players`, `npc_player_match_appearances`, and `npc_try_scorers`.
For the 2026 season validation run, the feed returned 70 non-placeholder
matches, split into 36 settled and 34 pending matches, with 1,932 match
appearance rows, 464 players, and 329 try rows. Placeholder TBC finals fixtures
are skipped until real teams are assigned by the source.

The scheduled post-match wrapper is:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-results-and-insights -- --require-supabase --season=2026
```

It refreshes official fixture/result/player rows, rematches existing TAB market
snapshots to official fixtures, reconciles fixed-win and half-time/full-time
outcomes, rebuilds same-game multi results, rebuilds NPC Insight aggregates,
and regenerates current NPC fixed-win and try-scorer predictions.
As of 2026-09-05, the NPC result workflow runs four idempotent morning catch-up
schedules at `45 18`, `45 20`, `45 22`, and `45 23` UTC. The repeated passes
rescan the same season feed so a delayed Opta update or missed GitHub cron
should not leave the previous evening's NPC rows pending until manual refresh.

## Current Gaps

- Historical NPC fixed-win prices are not available from the current TAB market
  source, so price-backed calibration starts from prospective snapshots.
- Historical NPC try-scorer prices are not available from the current TAB market
  source, so price-backed try-scorer and same-game calibration starts from
  prospective snapshots.
- NPC HT/FT settlement remains `missing_result` for settled matches unless the
  Opta fixture feed exposes source-backed halftime score fields.
- Prediction History remains incomplete until NPC history RPCs/read models are
  added, even though fixed-win prediction rows can now be reconciled against
  official match results.
