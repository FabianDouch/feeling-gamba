# Spanish La Liga Data Source Validation

As of 2026-09-11, La Liga is implemented as an EPL/UCL-shaped football
pipeline with source-backed fixed-win and fixed-draw settlement when TAB prices
have been captured before kickoff.

## Validated

- Public La Liga fixture/result endpoint:
  `https://apim.laliga.com/public-service/api/v1/matches?subscription=laliga-easports-2026&competition=primera-division`.
- The match list returns season fixtures, kickoff time, home/away teams,
  full-time status, final scores, gameweek, venue, and stable team/player
  identifiers.
- Team squad endpoint:
  `https://apim.laliga.com/public-service/api/v1/teams/{teamSlug}/squad?subscription=laliga-easports-2026`.
- Squad rows provide player identity, shirt number, team, and position proxy
  data for matching TAB goalscorer entrants to official player IDs.

## Market Source

- TAB `SOCCER` current-market capture follows the EPL/UCL `Match Result` and
  `Anytime Goalscorer` structure.
- The default TAB competition slug is `spanish-la-liga`.
- Local TAB GraphQL probes returned HTTP 403 in the same environment that blocks
  EPL probes, so the slug could not be confirmed locally. The La Liga market
  scripts and GitHub workflow expose `--competition-slug` to correct this
  without a code change if TAB uses a different slug.

## Current Gaps

- No stable no-key per-match La Liga scorer event feed has been validated.
- Goalscorer and Same Game % rows should remain empty or pending unless scorer
  prices can be matched to official scorer events. Squad rows are useful for
  identity matching but must not be treated as goal settlement.
- Historical calibration should not be backfilled from official-only results
  without captured TAB fixed-win and draw prices.
