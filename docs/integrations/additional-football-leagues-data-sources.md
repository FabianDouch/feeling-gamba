# Additional Football League Data Source Validation

As of 2026-09-16, German Bundesliga, Italian Serie A, French Ligue 1, MLS,
UEFA Europa League, and EFL Cup are implemented as La Liga-shaped football
pipelines with source-backed fixed-win and fixed-draw settlement when TAB
prices have been captured before kickoff.

## Validated

- Bundesliga fixture/result source:
  `https://fixturedownload.com/feed/json/bundesliga-2026`.
- Serie A fixture/result source:
  `https://fixturedownload.com/feed/json/serie-a-2026`.
- Ligue 1 fixture/result source:
  `https://fixturedownload.com/feed/json/ligue-1-2026`.
- MLS fixture/result source:
  `https://fixturedownload.com/feed/json/mls-2026`.
- UEFA Europa League fixture/result source:
  `https://fixturedownload.com/feed/json/europa-league-2026`.
- EFL Cup fixture/result source:
  TheSportsDB league event endpoints for league id `4570`, including
  `eventsseason.php`, `eventspastleague.php`, and rolling past/next league
  event endpoints.
- These feeds provide fixture dates, home/away teams, round metadata, and final
  scores sufficient for fixed-win and fixed-draw settlement once a matching TAB
  `Match Result` price row exists.
- As of 2026-09-16, Bundesliga, Serie A, Ligue 1, and UEFA Europa League use
  FixtureDownload as the fetch provider while retaining canonical
  `official_bundesliga`, `official_seriea`, `official_ligue1`, and
  `official_europa_league` source values in Supabase. A matched snapshot can
  remain `missing_result` when the feed row has no usable final score.
- FixtureDownload did not expose a validated EFL Cup/Carabao Cup feed under the
  tested slugs, so EFL Cup uses TheSportsDB with lower source confidence and
  currently limited event coverage.
- FixtureDownload blank score cells are parsed as unknown pending scores, not
  numeric zeroes. A `0-0` settlement is only valid when the feed explicitly
  supplies both scores as `0`.
- Observed TAB-vs-feed team aliases are normalized during priced fixture
  matching and reconciliation. Current aliases include Bundesliga variants such
  as `Bayern Munich` -> `FC Bayern München`, `Bayer Leverkusen` -> `Bayer 04
  Leverkusen`, `SV 07 Elversberg` -> `SV Elversberg`, and `1. FC Cologne` ->
  `1. FC Köln`; Serie A variants such as `Inter Milan` -> `FC Internazionale
  Milano`, `Juventus FC` -> `Juventus`, `Venezia FC` -> `Venezia`, `Bologna
  FC` -> `Bologna FC 1909`, `Parma Calcio` -> `Parma Calcio 1913`, and
  `Cagliari` -> `Cagliari Calcio`; and Ligue 1 variants such as `Olympique
  Marseille` -> `Olympique de Marseille`, `Olympique Lyon` -> `Olympique
  Lyonnais`, `AS Monaco` -> `AS Monaco FC`, `RC Lens` -> `Racing Club de
  Lens`, `Stade Brest 29` -> `Stade Brestois 29`, `Stade Rennais` -> `Stade
  Rennais FC 1901`, `LOSC Lille` -> `Lille OSC`, and `Havre Athletic Club` ->
  `Le Havre AC`.

## Market Source

- TAB `SOCCER` current-market capture follows the UCL/EPL/La Liga `Match
  Result` structure.
- Default TAB competition slugs are `german-bundesliga`, `italian-serie-a`,
  `french-ligue-1`, `major-league-soccer`, `uefa-europa-league`, and
  `english-league-cup`.
- Local TAB GraphQL probes are blocked by HTTP 403 in this environment, so the
  slugs are exposed through workflow/manual inputs for quick correction if TAB
  uses different route slugs.
- As of 2026-09-15, scheduled additional-football TAB market captures retry
  transient GraphQL edge failures, including temporary 403/429/5xx responses,
  before failing the workflow. A persistent 403 is still treated as a source
  access failure rather than silently reusing stale market data.

## Current Gaps

- No stable per-match scorer event feed has been validated for these leagues in
  this app.
- Goalscorer and Same Game % rows should remain empty or pending unless scorer
  prices can be matched to source-backed scorer events.
- Historical calibration should not be backfilled from fixture-only results
  without captured TAB fixed-win and draw prices.
