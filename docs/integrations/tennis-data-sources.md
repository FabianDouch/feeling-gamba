# Tennis Data Source Validation

As of 2026-09-10, Tennis is implemented as a fixed-win-only Insights sport.
Competitions are grouped under one app sport, with tour and competition
breakdowns inside the aggregate rows.

## TAB Current Markets

TAB GraphQL supports `sportingEvents(category: TENNIS, eventTypes: [MATCH])`
and exposes open two-runner `Match Betting` markets with decimal-convertible
fractional odds. These rows are suitable for pre-match fixed-win price capture.

TAB entrant roles can appear as `HOME` and `AWAY`, but Tennis Insights should
not expose home/away rows because neutral venues make that label unreliable as
a betting signal. The stored player 1/player 2 fields preserve source ordering
for audit only.

## Result Source

The Odds API key works with query parameter auth (`apiKey`). The aggregate
`tennis` scores endpoint was not usable in validation, while
tournament-specific sport keys such as `tennis_atp_us_open` and
`tennis_wta_us_open` returned events and completed scores.

The first supported result-backed slice therefore:

- discovers active ATP/WTA tennis sport keys from `/v4/sports/?all=true`;
- fetches tournament events and scores per sport key;
- settles winners from completed set scores;
- matches TAB snapshots to Odds API rows by tournament key, player names, and
  kickoff window.

## Scope Limits

Do not capture TAB ITF, Challenger, WTA125, or doubles events for calibration
until matching result source coverage is validated. Capturing those markets
without settlement would create permanent unmatched rows and distort the
snapshot audit.

Historical Tennis calibration should not be backfilled unless matching
pre-match TAB fixed-win prices are available.
