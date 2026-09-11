# Additional Football League Data Source Validation

As of 2026-09-11, German Bundesliga, Italian Serie A, French Ligue 1, and MLS
are implemented as La Liga-shaped football pipelines with source-backed
fixed-win and fixed-draw settlement when TAB prices have been captured before
kickoff.

## Validated

- Bundesliga fixture/result source:
  `https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/de.1.json`.
- Serie A fixture/result source:
  `https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/it.1.json`.
- Ligue 1 fixture/result source:
  `https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/fr.1.json`.
- MLS fixture/result source:
  `https://fixturedownload.com/feed/json/mls-2026`.
- These feeds provide fixture dates, home/away teams, round metadata, and final
  scores sufficient for fixed-win and fixed-draw settlement once a matching TAB
  `Match Result` price row exists.

## Market Source

- TAB `SOCCER` current-market capture follows the UCL/EPL/La Liga `Match
  Result` structure.
- Default TAB competition slugs are `german-bundesliga`, `italian-serie-a`,
  `french-ligue-1`, and `major-league-soccer`.
- Local TAB GraphQL probes are blocked by HTTP 403 in this environment, so the
  slugs are exposed through workflow/manual inputs for quick correction if TAB
  uses different route slugs.

## Current Gaps

- No stable per-match scorer event feed has been validated for these leagues in
  this app.
- Goalscorer and Same Game % rows should remain empty or pending unless scorer
  prices can be matched to source-backed scorer events.
- Historical calibration should not be backfilled from fixture-only results
  without captured TAB fixed-win and draw prices.
