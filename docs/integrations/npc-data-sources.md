# NPC Rugby Data Source Validation

Checked on 2026-09-02.

## Implementation Status

The first NPC slice uses sport-specific `npc_*` tables and mirrors the narrow
NRL fixed-win path. Current fixed-win market capture, fixed-win reconciliation,
stored Insight aggregate rebuilds, current single prediction generation, and
the app-facing NPC Insights/Predictions toggles are implemented. Official result
and player-event ingestion remains blocked until the Provincial Rugby/Opta
payload is validated.

## TAB NZ Market Source

Validated current NPC market access:

- Source URL: `https://www.tab.co.nz/sports/rugby-union/new-zealand-npc`
- TAB category enum: `RUGBY_UNION`
- Competition slug: `new-zealand-npc`
- Competition label: `New Zealand NPC`
- Fixed-win market label: `Match Betting`

The observed `Match Betting` market has two team entrants with `HOME` and
`AWAY` roles. A draw entrant was not present in that market. Draw/three-way style
choices appear in other rugby-union markets, such as result or margin markets,
so the fixed-win pipeline stores only team selections from `Match Betting`.

NPC market capture is implemented in:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-market-snapshots -- --dry-run --event-count=5
```

The scheduled wrapper is:

```sh
npm --workspace @feeling-gamba/ingestion run refresh:npc-current-markets -- --require-supabase
```

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

The page currently renders fixture/result data through Opta widgets and linked
widget scripts rather than a simple static JSON payload. Do not ingest official
results, player appearances, or try-scorer events from inferred HTML text.
Validate the underlying Opta/API payload first, then add an
`official_provincial_rugby` adapter.

## Current Gaps

- Historical NPC fixed-win prices are not available from the current TAB market
  source, so price-backed calibration starts from prospective snapshots.
- Current NPC try-scorer market entrant shape still needs validation before
  writing `npc_try_scorer_market_snapshots`.
- Same Game % remains scaffolded only until favourite-team try-scorer prices and
  official scorer settlement are source-backed.
- Prediction History remains an explicit app empty state until NPC prediction
  rows can be reconciled against official results and history RPCs are added.
