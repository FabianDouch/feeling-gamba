# NRL Data Source Validation

## Status

Validation date: 2026-08-25.

Implementation status on 2026-08-25: the first official NRL settlement import
path is implemented in
`packages/ingestion/scripts/refresh-nrl-results-from-official.mjs`, with schema
in `supabase/migrations/202608250001_nrl_settlement_data.sql`. It writes
official NRL teams, players, matches, and try-scorer rows. The first live dry run
for 2026 round 25 parsed 8 completed matches, 16 teams, 304 players, and 80
try-scorer rows. The worker now also supports `--include-fixtures` to preload
upcoming official NRL match shells as `pending` rows.
The first season backfill for completed 2026 rounds 1-25 wrote 188 settled
matches, 7,143 player-match appearances, 520 players, 17 teams, and 1,570
try-scorer rows.

TAB fixed-win snapshot capture is implemented in
`packages/ingestion/scripts/refresh-nrl-market-snapshots-from-tab.mjs`.
The retained NRL market source returns the same current event IDs and prices
that were observed through Betcha, so Betcha was removed from NRL on
2026-08-25 to avoid duplicate current-market rows. Existing Betcha NRL rows are
removed by `supabase/migrations/202608250006_nrl_tab_only_cleanup.sql`.

NRL fixed-win snapshot reconciliation is implemented in
`packages/ingestion/scripts/reconcile-nrl-fixed-win-snapshots.mjs`, with schema
in `supabase/migrations/202608250002_nrl_fixed_win_snapshot_results.sql`. The
first live Supabase write produced 32 result/status rows: 16 pending rows for
round 26 snapshots matched to official fixture shells, and 16 unmatched rows
from the earlier audit snapshot captured before fixture preload. No settled
returns are available yet because the matched round 26 fixtures are upcoming.

NRL Insights support is implemented with
`supabase/migrations/202608250003_nrl_insight_aggregates.sql` and
`packages/ingestion/scripts/rebuild-nrl-insight-aggregates.mjs`. Fixed-win
single aggregates use reconciled current-market snapshots. Try-scorer percentage
aggregates use official NRL roster appearances as the denominator and official
try events as the numerator, so they are source-backed once completed rounds
have been refreshed with the updated importer. Try-scorer cash remains blocked
until enough source-backed player try-scorer price history exists, and true
same-game cash remains blocked until quoted same-game multi prices or a
documented same-game payout basis are captured.
The same-game multi percentage storage path was added on 2026-08-28 with
`supabase/migrations/202608280001_nrl_same_game_multi_results.sql` and
`packages/ingestion/scripts/rebuild-nrl-same-game-multis.mjs`. It tracks the
pre-game favourite team plus the two shortest-priced favourite-team try scorers
as a `$1` estimated multi. Current player try-scorer price capture is now
implemented in
`packages/ingestion/scripts/refresh-nrl-try-scorer-market-snapshots-from-tab.mjs`;
older same-game rows remain `missing_price` if no pre-game player prices were
captured before the match closed.
Calibration notes from 2026-08-31: user-observed TAB same-game multi prices for
round 26 confirm the stored multiplied-leg estimate is materially higher than
quoted SGM prices. These manually observed prices are calibration evidence only
until quoted same-game prices are ingested from a source-backed feed.

| Match | Stored estimated price | User-observed SGM price | Difference |
| --- | ---: | ---: | ---: |
| Manly Sea Eagles vs St George Illawarra Dragons | `$4.445` | `$3.39` | `$1.055` |
| Penrith Panthers vs Canterbury Bulldogs | `$4.554` | `$3.44` | `$1.114` |
| Gold Coast Titans vs South Sydney Rabbitohs | `$3.352` | `$2.65` | `$0.702` |
| Sydney Roosters vs Dolphins | `$5.106` | `$3.53` | `$1.576` |

Across those four matched bets, observed prices totalled `$13.01` against
`$17.457` of stored estimated prices, so the quoted prices were about `74.5%`
of the multiplied-leg estimate. Keep collecting these differences before using
estimated same-game returns as cash performance.
The regular pre-match current-market flow is
`packages/ingestion/scripts/refresh-nrl-current-markets.mjs`, exposed through
`refresh:nrl-current-markets` and scheduled by
`.github/workflows/nrl-market-refresh.yml` every 15 minutes during the usual
NRL match window. As of 2026-08-31, the scheduled UTC window starts at `02:00`
so early Sunday NZST kickoffs have pre-start capture attempts before the
writers' advertised-start guard applies. Manual dispatch can pass `season` and
`round` to preload official fixture/player rows before market capture.
As of 2026-09-03, fixed-win capture also requests 500 open markets per event by
default, matching the try-scorer adapter, because wide TAB event pages can place
`Match Betting` after the first 240 markets.
The first combined live run on 2026-08-28 wrote 6 fixed-win market snapshots,
238 try-scorer market snapshots, 38 fixed-win result/status rows, 8 same-game
multi result rows, 1,155 NRL insight aggregate rows, and 49 current NRL single
prediction rows.
The follow-up 2026-08-28 NRL bucket update moved the scheduled market workflow
to every 15 minutes during the usual NRL match window and made both fixed-win
and try-scorer market snapshot writers refuse post-advertised-start captures.
As of 2026-09-03, fixed-win match-market capture stores one canonical row per
TAB source event instead of one row per cron timestamp. Repeated pre-kickoff
captures update that event row, and
`supabase/migrations/202609030001_team_sport_single_fixed_win_market_capture.sql`
prunes older duplicate source-event rows before adding database uniqueness
guards.
NRL Insights now prefer 50c decimal price-bucket breakdowns for fixed-win and
try-scorer market selections, while fixed-win team and same-game team sections
are omitted from the app-facing aggregate rebuild. As of 2026-08-31, fixed-win
Insights also include UFC-style other-team fixed-win price buckets and
favourite-vs-other price-difference buckets. As of 2026-09-02, the fixed-win
selection breakdown also includes favourite-at-home and favourite-away rows
derived from stored home/away market roles through a separate `favourite_venue`
aggregate scope. As of 2026-09-03, fixed-win price, other-team price, and
price-difference buckets are rebuilt as role-specific rows for `favourite`,
`home`, and `away`; the app toggles between those roles under each section.
After the 2026-09-02 favourite-venue backfill, the NRL insight rebuild wrote
1,163 `nrl_insight_aggregates` rows: 27 fixed-win rows, 3 same-game multi rows,
and 1,133 try-scorer percentage rows from 7,482 official player appearances and
1,651 official try events. The rebuilt fixed-win selection rows included 26
favourite-at-home selections with 20 wins and 16 favourite-away selections with
8 wins.
The follow-up NRL source simplification removed provider-specific app-facing
aggregate scopes so Insights show fixed-win favourite, home/away, team, season,
and round breakdowns without exposing the market provider.
Settlement finding from 2026-08-31: the scheduled NRL market workflow captured
the 2026-08-30 same-game source rows, but the app-facing same-game Insights
remained pending because no scheduled post-match official result refresh ran
after the Sunday fixtures. `.github/workflows/nrl-result-refresh.yml` now runs
`refresh:nrl-results-and-insights` daily after the usual weekend match window;
it discovers recently completed official rounds, refreshes official results,
reconciles fixed-win snapshots, rebuilds same-game multi rows, and rebuilds NRL
Insights. A manual round 26 recovery on 2026-08-31 refreshed 8 settled matches,
305 player appearances, and 76 try-scorer rows, then rebuilt 16 same-game rows
and 1,149 NRL insight aggregate rows.
Settlement finding from 2026-09-04: before the 10:30 NZST result refresh ran,
the 2026-09-03 Bulldogs/Broncos fixed-win snapshot was present but still
`pending`. The official NRL discovery dry-run also showed that requesting
future rounds beyond the current round can return the current round payload, so
the result scanner now ignores payloads whose selected round/season do not match
the requested round before deciding which rounds to refresh.

NRL current single prediction generation is implemented in
`packages/ingestion/scripts/generate-nrl-single-predictions.mjs`, with schema
in `supabase/migrations/202608250005_nrl_single_predictions.sql`. The first
live write generated 64 current NRL single prediction rows: 16 fixed-win
percentage singles from current market favourites and 48 try-scorer
percentage singles from official historical player/team try rates. Try-scorer
rows are labelled `historical_team_roster` because current official lineups and
player try-scorer prices are not validated yet.

TAB and Betcha expose the same public web GraphQL sports query shape for current
NRL market discovery:

- `https://api.tab.co.nz/graphql`
- `https://api.betcha.co.nz/graphql`

Treat these as internal web APIs until usage rights and support are confirmed.

## Current Market Access

Validated current NRL access:

- Rugby League category enum: `RUGBY_LEAGUE`.
- NRL competition slug: `nrl`.
- NRL competition:
  - ID: `SportingCompetition:3e85a456-59b5-4363-95e6-836854492fdf`.
  - URL: `/sports/rugby-league/nrl`.
- `sportingEvents` with `statuses: [OPEN]` and `eventTypes: [MATCH]` returned
  eight upcoming NRL events.
- `marketsConnection` returned 157 to 168 open public markets for the sampled
  event, depending on page size and query path.

Sample event validated:

- Event: `Brisbane Broncos vs Melbourne Storm`.
- Event ID: `SportingEvent:bfa0fb63-4468-48d7-8e48-987dd764d38c`.
- Event URL:
  `/sports/rugby-league/nrl/brisbane-broncos-vs-melbourne-storm/bfa0fb63-4468-48d7-8e48-987dd764d38c`.
- Advertised start: `2026-08-27T09:50:00.000Z`.

## Fixed-Win Market

Fixed-win access is validated.

The NRL fixed-win market is exposed as `Match Betting`, not `Head to Head`.
Entrants include home/away roles and fractional odds that can be converted to
decimal prices.

Sample `Match Betting` market from `Brisbane Broncos vs Melbourne Storm`:

| Entrant | Role | Fractional odds | Decimal odds |
| --- | --- | --- | --- |
| Brisbane Broncos | `HOME` | `19/20` | `1.95` |
| Melbourne Storm | `AWAY` | `87/100` | `1.87` |

This is enough to support forward fixed-win snapshot capture once a completed
result source is validated.

Historical fixed-win backfill remains blocked. A 2026-08-25 live probe using
the working public GraphQL query shape returned open NRL events, but
`statuses: [CLOSED]` and `statuses: [FINAL]` returned no completed NRL events
or markets.

The current fixed-win snapshot command is:

```text
npm --workspace @feeling-gamba/ingestion run refresh:nrl-market-snapshots -- --dry-run --event-count=8
```

The current fixed-win reconciliation command is:

```text
npm --workspace @feeling-gamba/ingestion run reconcile:nrl-fixed-win -- --dry-run --limit=200
```

## Other Observed NRL Markets

The sampled event also exposed useful non-player markets:

- `Line`.
- `Total Points`.
- `Winner / Total Points Double`.
- `InPlay SGMs`.
- Team total tries markets, such as `Brisbane Broncos Total Tries`.
- Team `Score X+ Tries` markets.
- Team try time-window markets.
- Non-player try timing markets, such as `Time Of First Try` and
  `Half With Most Tries`.

These markets are source-backed observations only. Do not treat them as
player try-scorer access.

## Try-Scorer Market Access

Player try-scorer market access was validated through the public TAB GraphQL
competition market payload on 2026-08-28.

Findings:

- The read-only validation command is:

```text
npm --workspace @feeling-gamba/ingestion run validate:nrl-try-scorer-markets -- --event-count=10 --markets-first=500 --entrants-first=60 --sample-entrants=5
```

- A 2026-08-28 scan of 10 open NRL payload events with `marketsConnection(first:
  500)` found seven exact `Anytime Try Scorer` markets, covering 238 priced
  player entrants. Special/promo NRL events did not expose match-level
  try-scorer markets.
- The `Anytime Try Scorer` market uses `marketTypeId:
  a463c3f2-874a-473f-8588-4abf5b91b41f`. Entrants include a name formatted as
  `Player Name (Team Name)`, a home/away role, and fractional odds that can be
  converted to decimal prices.
- `marketsConnection(first: 240)` can miss the exact `Anytime Try Scorer`
  market on full match payloads; use at least `first: 500` or implement
  pagination before relying on the scan for production capture.
- A 2026-08-25 scan of 168 open public markets for the sampled event found no
  `Anytime Tryscorer`, `Try Scorer`, `Tryscorer`, first player scorer, or last
  player scorer market names. That finding is superseded by the broader
  `marketsConnection(first: 500)` validation above.
- The static Betcha event page included generic `SGM` and `Player` strings, but
  did not expose extractable player market rows.
- `SportingEventPopularSameGameMultis` exists in the web GraphQL schema shape,
  but returned `null` for the sampled event.
- `SportingPromotedMarkets` returned an empty array for the sampled event.
- `SportingEventEntrantFormData` and `SportingEntrantFormData` returned team,
  total-points, and match-betting form snippets, not player try-scorer markets
  or player scoring outcomes.

Conclusion: use the retained current-market adapter for NRL match and fixed-win
market snapshots, and use the dedicated `Anytime Try Scorer` snapshot adapter to
write `nrl_try_scorer_market_snapshots` before kickoff:

```text
npm --workspace @feeling-gamba/ingestion run refresh:nrl-try-scorer-market-snapshots -- --require-supabase
```

The adapter matches entrant names and home/away roles back to official NRL
player-match appearance rows before Same Game settlement relies on those player
IDs. If an event has no official fixture shell yet, the row can still be
captured for auditability but cannot settle into the same-game model until a
future rematch path or another pre-close run attaches the official fixture and
player IDs.

## Completed Results

Completed NRL results were not validated through the current-market adapter in this pass.

- `sportingEvents` with `statuses: [FINAL]` returned no NRL event rows.
- `sportingEvents` with `statuses: [CLOSED]` returned no NRL event rows.
- `ABANDONED` was not accepted as a valid status enum in the tested query.
- `scoresV2` was not directly queryable on `SportingEvent` through the tested
  query shape.

Use the current-market adapter for current market snapshots only unless a later proof finds a
settled sports result path.

## Official NRL Settlement Source

Validated on 2026-08-25.

The official NRL draw data endpoint works with browser-like request headers and
returns completed fixture rows:

```text
https://www.nrl.com/draw/data?competition=111&round=25&season=2026
```

Useful fixture fields:

- `matchCentreUrl`, which points to the public match-centre route.
- `matchState`, such as `FullTime`.
- `matchMode`, such as `Post`.
- `clock.kickOffTimeLong`.
- `homeTeam.nickName`, `homeTeam.score`.
- `awayTeam.nickName`, `awayTeam.score`.

The direct JSON request returned HTTP `406` without browser-like headers. With a
normal `User-Agent`, `Accept`, and `Referer`, it returned HTTP `200` and a JSON
body.

The official match-centre data route also works with browser-like headers:

```text
https://www.nrl.com/draw/nrl-premiership/2026/round-25/storm-v-panthers/data
```

It returns match-level fields plus a `timeline` array. Try events are identifiable
with `type: "Try"` and include:

- `matchId`.
- `gameSeconds`.
- `playerId`.
- `teamId`.
- running `homeScore` / `awayScore` where available.

The payload includes `homeTeam.players` and `awayTeam.players`, so `playerId`
can be resolved to first name, last name, number, and position without a second
request.

Sample official NRL settlement rows:

| Match ID | Match | Status | Score |
| --- | --- | --- | --- |
| `20261112510` | Storm vs Panthers | `FullTime` / `Post` | Storm 14, Panthers 22 |
| `20261112520` | Raiders vs Broncos | `FullTime` / `Post` | Raiders 30, Broncos 34 |
| `20261112530` | Dolphins vs Eels | `FullTime` / `Post` | Dolphins 34, Eels 16 |

Sample official NRL try-scorer rows:

| Match ID | Player | Team | Game seconds |
| --- | --- | --- | --- |
| `20261112510` | Brian To'o | Panthers | `158`, `1386`, `1787` |
| `20261112510` | Liam Henry | Panthers | `1198` |
| `20261112510` | Tyran Wishart | Storm | `2613` |
| `20261112520` | Grant Anderson | Broncos | `1927`, `3979` |
| `20261112530` | Jamayne Isaako | Dolphins | `2103`, `2854` |
| `20261112530` | Herbie Farnworth | Dolphins | `1486`, `4726` |

Verdict: official NRL is the preferred settlement source for final scores and
player try-scorer outcomes, subject to confirming acceptable usage rights and
keeping request headers explicit in the adapter.

The current refresh command is:

```text
npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=25 --dry-run
```

Upcoming fixture shells can be preloaded with:

```text
npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=26 --include-fixtures --require-supabase
```

After applying the NRL Insights migration, refresh completed rounds once to
backfill player appearances, then rebuild aggregates:

```text
npm --workspace @feeling-gamba/ingestion run refresh:nrl-results -- --season=2026 --round=25 --require-supabase
npm --workspace @feeling-gamba/ingestion run rebuild:nrl-insight-aggregates -- --require-supabase
```

## ESPN Settlement Fallback

Validated on 2026-08-25.

ESPN's public NRL scoreboard works at:

```text
https://site.api.espn.com/apis/site/v2/sports/rugby-league/3/scoreboard?dates=20260820-20260824&limit=100
```

The league path uses `rugby-league/3`, not `rugby-league/nrl`. The response
returned eight completed week-25 NRL matches with event IDs, final scores,
winner flags, team IDs, player scoring events, athlete IDs, and athlete names.

For the same three sampled matches, ESPN returned matching try-scorer names:

- Storm vs Panthers: Brian To'o, Liam Henry, Tyran Wishart, Jack Howarth,
  Siulagi Tuimalatu-Brown.
- Raiders vs Broncos: Billy Walters, Kaeo Weekes, Ata Mariota, Ezra Mam, Grant
  Anderson, Owen Pattie, Zac Hosking, Payne Haas, Hayze Perham.
- Dolphins vs Eels: Ronald Volkman, Brian Kelly, Herbie Farnworth, Selwyn Cobbo,
  Jamayne Isaako, Max Plath, Kelma Tuilagi.

ESPN player and team IDs differ from official NRL IDs, so joins should use a
source-specific identity table rather than treating IDs as interchangeable.

## Implementation Implications

- `Singles -> Fixed Win %` can start from official NRL settled results.
- `Singles -> Cash Win` can start from captured `Match Betting` snapshots after
  official NRL result settlement is available.
- Current-market snapshot rows can match existing official NRL rows only when the
  official fixture/result has already been loaded. Matching is conservative:
  home/away order, kickoff time, and team-name/nickname suffixes must align.
- `Singles -> Try Scorer %` can use official appearance-to-try percentages.
- `Multis -> Same Game %` now has permanent storage for the favourite-team plus
  top-two try-scorer model. Rows remain `missing_price` only when no pre-game
  player prices were captured for that match.
- `Singles -> Cash Try Scorer` and `Multis -> Same Game Cash` remain blocked on
  enough settled market-price history or quoted same-game multi pricing, not on
  scorer settlement.
- Do not infer same-game multi returns by multiplying single-leg prices unless
  the output is explicitly labelled as hypothetical. Real `Same Game Cash`
  requires quoted SGM prices or a documented return basis.
