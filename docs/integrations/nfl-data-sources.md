# NFL Data Source Validation

As of 2026-09-15, NFL Insights are scoped to fixed-win/head-to-head team
selections only.

## TAB Current Markets

TAB exposes NFL under the public sports GraphQL category
`AMERICAN_FOOTBALL`, competition slug `nfl`, and URL
`/sports/american-football/nfl`. Open NFL match events include a two-runner
`Head To Head` market with `HOME` and `AWAY` entrant roles. The first capture
slice writes one canonical pre-kickoff TAB row per source event to
`nfl_market_snapshots`.

Touchdown-scorer, player-prop, line, total, and same-game markets are visible in
TAB event payloads, but they are not ingested for Insights yet. They need a
separate official player-event/settlement mapping before being shown.

## ESPN Settlement

ESPN's public NFL scoreboard endpoint is used for fixture/result settlement:

`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYY&seasontype=2&week=N&limit=100`

The importer stores ESPN team and match rows in `nfl_teams` and `nfl_matches`
with `source = 'official_nfl'`. Final-score rows reconcile captured TAB Head To
Head snapshots into `nfl_fixed_win_snapshot_results`, then
`rebuild:nfl-insight-aggregates` writes fixed-win aggregate rows to
`nfl_insight_aggregates`.

NFL tied final scores are stored with `outcome_status = 'draw'` and are excluded
from settled fixed-win return counts until TAB's tied-game settlement treatment
is explicitly validated.
