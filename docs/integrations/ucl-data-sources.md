# UEFA Champions League Data Source Validation

Checked on 2026-09-07. Updated on 2026-09-09 for UEFA season-year handling,
on 2026-09-10 for September fixture name-alias coverage, and on 2026-09-11 for
fixed-draw insight usage.

## Implementation Status

The first UCL slice uses sport-specific `ucl_*` tables and mirrors the narrow
NRL/NPC team-sport pipeline. Current fixed-win market capture, official priced
fixture/result refresh, fixed-win reconciliation, same-game goalscorer rebuilds,
stored Insight aggregates, current single prediction generation, and the
app-facing UCL Insights/Predictions toggles are implemented.

Prediction History is exposed as an explicit reserved branch, matching the
current NRL/NPC app state, until UCL prediction reconciliation/history RPCs are
added.

## TAB NZ Market Source

Validated current UCL market access:

- Source URL: `https://www.tab.co.nz/sports/soccer/uefa-champions-league`
- TAB category enum: `SOCCER`
- Competition slug: `uefa-champions-league`
- Fixed-win market label: `Match Result`
- Goalscorer market label: `Anytime Goalscorer`

The observed `Match Result` market is three-way. The UCL snapshot stores home,
draw, and away prices. Fixed-win Insights and predictions only track team
selections: home, away, favourite, favourite at home, and favourite away.
Fixed-draw Insights separately track the draw entrant from
`draw_fixed_win_price` where a captured TAB price is matched to an official
result.

Validation dry run on 2026-09-07 captured Club Brugge vs Aston Villa with home
`$2.60`, draw `$3.60`, and away/favourite `$2.45`.

```sh
npm --workspace @feeling-gamba/ingestion run refresh:ucl-market-snapshots -- --dry-run --event-count=1 --markets-first=200
```

## Official UEFA Source

Official UEFA rows use `source = 'official_uefa'`.

Validated public endpoints:

- `https://match.uefa.com/v5/matches?competitionId=1&seasonYear=2027`
- `https://match.uefa.com/v5/matches/{source_match_id}/lineups`
- `https://match.uefa.com/v5/matches/{source_match_id}/events?filter=ALL&order=ASC&limit=500&offset=0`

The result importer defaults to `--priced-only`. It reads captured
`ucl_market_snapshots`, matches UEFA rows by home/away team names and kickoff
window, then writes only those price-backed official matches. On 2026-09-07,
the dry run saw 281 UEFA 2026 season matches but retained zero because the UCL
schema had not been deployed and no UCL fixed-win snapshots existed in
Supabase.
On 2026-09-09, the September 2026 UCL fixtures were confirmed under UEFA
`seasonYear=2027`; the result wrappers now default July-December dates to the
next UEFA season year and January-June dates to the current year.
The same check found source-name differences between TAB and UEFA, including
`FC Porto` vs `Porto`, `Manchester City` vs `Man City`, and `Inter Milan` vs
`Inter`. The UCL matchers now use explicit club aliases for these source-backed
variants instead of fuzzy matching.
On 2026-09-10, the same alias contract was extended for September 2026 TAB
fixtures that UEFA exposes under shorter names, including `Arsenal FC` vs
`Arsenal`, `Atletico Madrid` vs `Atleti`, `Bodø/Glimt` normalization,
`Feyenoord Rotterdam` vs `Feyenoord`, `Lille OSC` vs `Lille`, `Manchester
United` vs `Man Utd`, `AS Roma` vs `Roma`, and `FC Sabah Masazir` vs `Sabah`.
After the alias update, the priced-only official refresh retained all 18
captured TAB UCL fixtures from 2026-09-08 to 2026-09-10, reconciled 12 settled
fixed-win rows and 6 pending rows, and left 0 unmatched rows.

```sh
npm --workspace @feeling-gamba/ingestion run refresh:ucl-results -- --dry-run --season=2027 --include-fixtures --priced-only --skip-details
```

## Settlement Rule

For UCL fixed-win calibration, a drawn final score is a settled non-paying loss
for home, away, and favourite team selections. `ucl_fixed_win_snapshot_results`
stores `match_drawn = true`, `home_team_won = false`, `away_team_won = false`,
`favourite_won = false`, and zero returns for those tracked selections.

## Current Gaps

- Historical TAB fixed-win and goalscorer prices are not available from the
  current public TAB source, so price-backed calibration starts prospectively.
- Official UEFA goal-event extraction still needs more live validation for own
  goals, penalty goals, extra time, penalty shootouts, abandoned matches, and
  duplicate/variant player names.
- UCL half-time/full-time double tracking is not implemented in this slice.
- UCL Prediction History remains incomplete until sport-specific history RPCs
  and prediction outcome reconciliation are added.
