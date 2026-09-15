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

## nflverse Settlement

As of 2026-09-16, NFL fixture/result settlement uses the public nflverse
`nfldata` `games.csv` file instead of ESPN because GitHub-hosted Actions
runners received repeated ESPN scoreboard HTTP 403 responses on 2026-09-15:

`https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`

The importer stores nflverse team abbreviation and match rows in `nfl_teams`
and `nfl_matches` with `source = 'official_nfl'`. The `game_id`, season,
game type, week, home/away teams, kickoff date/time, and final scores are mapped
into the existing NFL match table. Final-score rows reconcile captured TAB Head
To Head snapshots into `nfl_fixed_win_snapshot_results`, then
`rebuild:nfl-insight-aggregates` writes fixed-win aggregate rows to
`nfl_insight_aggregates`.

NFL tied final scores are stored with `outcome_status = 'draw'` and are excluded
from settled fixed-win return counts until TAB's tied-game settlement treatment
is explicitly validated.
