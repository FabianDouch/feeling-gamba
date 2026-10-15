# Statistics Plan

## Context

The app should support favourite-performance statistics once the historical race
data is reliable. The first data collection pass starts roughly six months back
from the project start date, then the dataset should keep growing as new race
days are collected across:

- Thoroughbred racing
- Harness racing
- Greyhound racing

This is planning only. Implementation should wait until the ingestion pipeline
can reliably identify favourites, final starters, and final placings.

As of `2026-06-18`, the app should read stored Supabase insight aggregates at
runtime. Local fixtures may seed backfills and tests, but the app should not
calculate the main historical insight tables from bundled fixtures.

## MVP Statistics Scope

The app should show:

- Percentage of favourites that won their race.
- Percentage of favourites that finished 2nd.
- Percentage of favourites that finished 3rd.
- Average return from a notional `$1` stake on every favourite.
- Total staked, total returned, net return, and ROI for that `$1` favourite
  strategy.
- Bonus-bet credit return for offers where a `$1` favourite stake receives a
  bonus bet when it finishes in a promo-eligible place.
- Average bonus-bet credit per `$1` favourite stake.
- The same full metric set broken down by final starter count, for example
  7 starters, 8 starters, 9 starters, and so on.
- Favourite price breakdown in 50c fixed-win price buckets, for example
  `$1.00-$1.49`, `$1.50-$1.99`, and so on.
- Separate summaries for thoroughbred, harness, and greyhound racing.
- Filters for date range, racing code, and track.
- The `$1` favourite return by discipline, starter-count breakdown, and
  favourite price breakdown should support an all-track view and individual
  track views.

The default statistics window should be the full collected date range. Users
should be able to change the date range, but collected data should not be capped
or discarded after the initial historical backfill window.

## Metric Definitions

### Favourite Win Percentage

Definition:

- `favourite_wins / races_with_known_favourite_and_final_result`

Rules:

- Count only races with a known favourite and a final result.
- Use the selected pre-race favourite from `odds_snapshots` when available.
- Keep result-page favourite rank separate from pre-race favourite.
- Do not include races where the favourite cannot be identified.
- Do not include abandoned races or races without a final result.
- Apply the same denominator rules when statistics are filtered to one country
  or one track.

### Favourite 2nd Percentage

Definition:

- `favourite_finished_2nd / races_with_known_favourite_and_final_result`

Rules:

- Use `race_results.finish_position = 2`.
- Keep dead-heat handling explicit once source examples are available.

### Favourite 3rd Percentage

Definition:

- `favourite_finished_3rd / races_with_known_favourite_and_final_result`

Rules:

- Use `race_results.finish_position = 3`.
- Keep dead-heat handling explicit once source examples are available.

### Starter Count Breakdown

Definition:

- Group the same favourite-performance statistics by
  `races.starter_count`.

Example groups:

- 7 starters
- 8 starters
- 9 starters
- 10 starters
- 11 starters
- 12+ starters, if small buckets become noisy

Rules:

- Use final starter count, not declared runner count.
- Exclude scratched runners from `starter_count`.
- Surface small-sample counts beside every percentage.
- Keep the raw race count visible so percentages are not misleading.
- Include the same fields as the top-level favourite performance summary:
  selections, win/2nd/3rd rates, total staked, cash returned, cash net, cash ROI,
  bonus-bet credit, bonus average, cash-plus-bonus value, cash-plus-bonus net,
  and averages.

### Favourite Unit-Stake Return

Definition:

- Stake `$1` on the selected favourite in every included race.
- If the favourite wins, return `favourite_win_price * 1`.
- If the favourite loses, return `$0`.
- Average return = `total_returned / races_with_known_favourite_result_and_price`.
- Net return = `total_returned - total_staked`.
- ROI percentage = `net_return / total_staked`.

Rules:

- Use decimal win price from the selected pre-race favourite snapshot when
  available.
- If a final official dividend is used instead, label the price source clearly.
- Exclude races missing favourite price from return denominators and count them
  separately.
- Keep return metrics separate by `race_code`: thoroughbred, harness, greyhound.
- Show both total stake and total returned so users can see the denominator.

### Bonus-Bet Credit Return

Definition:

- Count the bonus-credit face value earned by a notional `$1` favourite stake.
- Treat bonus credit as promotional face value, not cash.
- Add bonus credit to the cash return only in the cash-plus-bonus view.

Rules:

- Apply AU/NZ place-style terms from final starter count unless a source-backed
  promotion provides more specific rules.
- 8 or more final starters: credit 2nd or 3rd.
- 5 to 7 final starters: credit 2nd only; third place is a no-third-dividend
  style outcome and does not receive credit.
- Fewer than 5 final starters: no place-style bonus credit.
- Keep final starter count, not declared runner count, as the eligibility input.

### Favourite Price Breakdown

Definition:

- Group favourites by selected fixed-win price in 50c increments.
- The first bucket is `$1.00-$1.49`; the next is `$1.50-$1.99`, then
  `$2.00-$2.49`, and so on.
- Win percentage =
  `favourite_wins_in_price_bucket / favourites_with_known_result_and_price_in_bucket`.

Rules:

- Use the selected favourite's fixed-win price from the same source as the
  favourite selection.
- Include only favourites with a numeric price and final result.
- Show the favourite selection count beside every bucket.
- Recalculate buckets inside the selected track scope; do not reuse all-track
  bucket denominators for a filtered track.
- Sort buckets by numeric lower bound.
- Do not merge sparse buckets automatically until a minimum-sample rule is
  defined; surface the denominator instead.
- Supabase should expose these buckets as stored `insight_aggregates` rows.

### Favourite Bonus-Bet Credit Return

Definition:

- Stake `$1` on the selected favourite in every included race.
- If the favourite wins, cash return is unchanged:
  `favourite_win_price * 1`.
- If the favourite finishes 2nd or 3rd, record a `$1` bonus-bet credit.
- Bonus-bet credit is tracked at face value and is not converted into cash value.
- Bonus-bet average credit =
  `bonus_bet_credit / races_with_known_favourite_result_and_price`.
- Cash-plus-bonus value = `cash_return + bonus_bet_credit`.
- Cash-plus-bonus net value =
  `cash_plus_bonus_value - total_staked`.
- Cash-plus-bonus average value =
  `cash_plus_bonus_value / races_with_known_favourite_result_and_price`.

Rules:

- Keep cash return, bonus-bet credit, and cash-plus-bonus value separate.
- Show bonus average separately from cash-plus-bonus average.
- Label bonus-bet credit clearly as bonus face value, not withdrawable cash.
- Count each favourite selection that finishes 2nd or 3rd as one bonus-credit hit.
- Surface bonus-credit hit rate beside value metrics.
- Apply the same discipline and starter-count breakdowns as cash return metrics.

## Required Data

Each included race needs:

- race code
- track
- race date
- final starter count
- selected favourite runner
- selected favourite source and timestamp
- selected favourite win price
- selected favourite price source
- final finish position for the favourite
- final race status

Preferred source for favourite:

- Pre-race odds snapshot closest to jump time.

Fallback source:

- Result-page favourite rank can be stored and analysed separately, but it should
  not be silently merged into pre-race favourite statistics.

## Backfill Plan

The statistics feature needs a historical backfill process seeded from the
initial collection start date.

Planned flow:

1. Select the initial collection start date, initially set roughly six months
   before the project start date.
2. Discover race meetings for thoroughbred, harness, and greyhound codes.
3. Fetch final race results and runner-level finishing positions.
4. Fetch or infer favourite data only when a source explicitly supports it.
5. Store favourite win price or final dividend when explicitly available.
6. Store source fetches, raw payload references, and parser versions.
7. Derive favourite finish-position and `$1` unit-stake return summaries into
   stored Supabase aggregate rows.
8. Mark races with missing favourite, price, result, or starter-count data
   explicitly.

Backfill should start in manual mode before becoming scheduled or repeatable.
After initial backfill, a weekly missing-day update should refresh any new race
dates and rebuild or upsert affected `insight_aggregates`.

## Proposed Stored Read Models

The first Supabase implementation uses one generic stored aggregate table,
`insight_aggregates`, with `scope_type` and scope columns to represent the
conceptual views below. This keeps app reads simple while preserving distinct
denominators for overall, country, course, race-code, starter-count, and
price-bucket scopes.

### `favourite_performance_summary`

Purpose:

- Power top-level favourite statistics for a date range and filters.

Suggested fields:

- `race_code`
- `course_name`
- `date_bucket`
- `race_count`
- `known_favourite_count`
- `favourite_win_count`
- `favourite_second_count`
- `favourite_third_count`
- `favourite_win_percentage`
- `favourite_second_percentage`
- `favourite_third_percentage`
- `total_staked`
- `total_returned`
- `total_bonus_bet_credit`
- `average_bonus_bet_credit_per_1`
- `total_value_with_bonus_credit`
- `net_return`
- `net_value_with_bonus_credit`
- `average_return_per_1`
- `average_value_per_1_with_bonus_credit`
- `roi_percentage`
- `value_roi_percentage_with_bonus_credit`
- `bonus_bet_credit_count`
- `bonus_bet_credit_percentage`
- `missing_price_count`
- `missing_favourite_count`
- `missing_result_count`

Country and track filters should be applied before aggregation so each scoped
view has its own denominators, returns, and missing-data counts.

### `favourite_performance_by_starter_count`

Purpose:

- Power the starter-count breakdown.

Suggested fields:

- `race_code`
- `starter_count`
- `race_count`
- `known_favourite_count`
- `favourite_win_count`
- `favourite_second_count`
- `favourite_third_count`
- `favourite_win_percentage`
- `favourite_second_percentage`
- `favourite_third_percentage`
- `total_staked`
- `total_returned`
- `total_bonus_bet_credit`
- `average_bonus_bet_credit_per_1`
- `total_value_with_bonus_credit`
- `net_return`
- `net_value_with_bonus_credit`
- `average_return_per_1`
- `average_value_per_1_with_bonus_credit`
- `roi_percentage`
- `value_roi_percentage_with_bonus_credit`
- `bonus_bet_credit_count`
- `bonus_bet_credit_percentage`
- `missing_price_count`
- `missing_favourite_count`
- `missing_result_count`

### `favourite_performance_by_price_bucket`

Purpose:

- Power favourite win-rate analysis by fixed-win favourite price band.

Suggested fields:

- `race_code`
- `course_name`
- `price_bucket_start`
- `price_bucket_end`
- `price_bucket_label`
- `race_count`
- `known_favourite_count`
- `favourite_win_count`
- `favourite_win_percentage`
- `total_staked`
- `total_returned`
- `net_return`
- `average_return_per_1`
- `roi_percentage`
- `missing_price_count`
- `missing_favourite_count`
- `missing_result_count`

## IA Implications

The Insights area should include:

- Full collected date range by default.
- Separate discipline summaries for thoroughbred, harness, and greyhound.
- Top-level favourite finish-position rates.
- `$1` favourite unit-stake return metrics.
- Bonus-bet credit metrics using starter-count eligibility rules for 2nd/3rd
  finish promotions.
- Starter-count breakdown table or chart with the same metric set as the
  top-level summary, filtered to each starter-count bucket.
- Price-bucket breakdown table or chart using 50c fixed-win favourite price
  ranges with win percentage and selection count.
- Filters for code, country, track, and date range.
- Links from each aggregate row back to the matching race list.
- Missing-data counts alongside percentages.

## Validation Plan

Planned checks:

- Verify every included race has a final result.
- Verify every included percentage shows its denominator.
- Verify return metrics show total staked, total returned, average return, net
  return, and ROI.
- Verify bonus-bet credit metrics show bonus face value separately from cash
  return.
- Verify 2nd and 3rd favourite finishes generate one `$1` bonus-bet credit per
  included `$1` stake only when the final starter count makes that placing
  eligible.
- Compare a sample of favourite finish positions against source race cards.
- Compare a sample of favourite win prices against source race cards/dividends.
- Compare starter-count buckets against final starter counts after scratchings.
- Confirm starter-count rows use the same calculation rules as the top-level
  favourite summary.
- Confirm races missing favourite data are excluded from percentage denominators
  and counted separately.
- Confirm races missing favourite price are excluded from return denominators and
  counted separately.

## Open Questions

- Can historical pre-race favourite data be recovered reliably, or do we need to
  start accurate pre-race statistics from the first live snapshot date?
- Should result-page favourite rank have its own separate statistics view?
- How should dead heats be represented in finish-position percentages?
- Should small starter-count buckets be grouped, for example `12+ starters`?
- Should collection/reporting date ranges use calendar date, race date in NZ
  time, or ingestion date?
- For historical backfills, should return calculations prefer retained pre-race
  fixed-win price or final official win dividend when both are available?

## Football price-gap trial (2026-09-25)

Experiment `football_price_gap_v1` compares three favourite-win
probabilities: normalised three-way TAB implied probability, pooled historical
cohort win rate, and ridge logistic calibration with the market logit as offset.
The richer model includes log favourite odds, log(1+gap)/3, normalised draw
probability, home-favourite flag and league indicators. All weights use L2=0.1;
600 fixed gradient steps of size 0.1 avoid tuning on trial outcomes.

Exact `$2.00–$2.49` and cumulative `$2.00+` opponent-minus-favourite gaps are
separate overlapping cohorts. One frozen forecast per league/event/cohort uses
the first eligible snapshot no older than one hour, within 24 hours of kickoff.
Equal team prices, missing three-way prices, and post-kickoff captures are
ineligible for the forward trial. Historical reconstruction is stored separately
and does not apply the forward 24-hour entry window or one-hour freshness limit.

Training uses one captured pre-kickoff priced result per league/event, observed
before generation, with kickoff before generation and consistent settled
home/away/draw flags. Historical source result rows are read as currently known;
they have no reliable first-settlement timestamp, so reconstructed backtests
cannot claim verified historical result availability. Price snapshots may be closer to kickoff than trial captures;
prospective evaluation must test this timing mismatch. Historical rate requires
30 cohort matches. Rich calibration requires 100 matches, 10 wins and 10 losses,
and 20 matches from the target league. These fixed experimental thresholds
control availability, not statistical significance. Sparse models abstain and
retain their sample counts; there is no silently substituted market forecast.

Evaluate forward forecasts and reconstructed backtests separately. Report Brier score and clipped
binary log loss (epsilon 1e-6), with a paired market baseline on the exact same
scored matches, plus 10-percentage-point calibration bins and denominators.
Learned models may train on earlier settled trial matches as collection expands;
previous probabilities remain immutable. Compare league results before interpreting
pooled performance, and do not optimise the cutoff against trial outcomes.

Draws are losses for team wins. Excluded/unknown results do not enter scoring or
returns. Notional $1 stake/return/net/ROI applies to the shared favourite cohort,
not distinct model trading strategies. On 2026-09-25 the user requested all six
model/cohort variations as current recommendations. All qualifying upcoming
favourites with an available selected probability are shown; this adds no
probability threshold, staking policy or profit claim. Historical backtests
remain research records, never prospective recommendations.

User clarification on 2026-09-25 supersedes the initial forward-only scope:
Prediction History defaults to Historical backtest using retained pre-match
prices and already settled results. `replayFootballHistory` reconstructs each
match at its stored capture timestamp. Training includes only distinct events
whose kickoff was at least 24 hours before that timestamp; target, simultaneous
and future results cannot train their own forecast. The fixed embargo is an
availability assumption, not evidence that a particular result was published
then. Current source corrections and incomplete captured history remain limits.
Retain method `chronological_24h_embargo_v1`, cutoff, build timestamp, latest
training kickoff, samples, weights and digest. Null learned probabilities stay
null; the baseline and historical favourite returns remain visible during warm-up.

## Opponent $3.50+ rule (2026-10-15)

The requested seventh football selection uses opposing-team decimal odds >= 3.50,
not an opponent-minus-favourite gap threshold. Favourite means the shorter-priced
home/away team even if draw is shorter. Equal team prices and incomplete markets
are excluded. Display normalised three-way market-implied probability without
requiring learned-model availability. The shared store may retain bucket/context
outputs for this cohort, but this option exposes only the market probability.
Score regulation-time favourite wins; draws lose, and unknown/non-standard
results retain existing pending/excluded semantics. Reconstruct historical
results separately from prospective forecasts, retaining the existing 24-hour
training embargo and captured-odds limitations. Overlapping cohort returns
must not be combined. No new staking or profit assumptions are introduced.

## Football candidate research (2026-10-15)
Exploratory, read-only analysis requested after the opponent-price model rollout.
No new model, schedule, production data or UI behaviour is enabled by this research.
### Dataset and method
- Snapshot: 2026-10-15 16:39 NZDT; 371 source result rows across ten queried leagues.
- Usable: 250 distinct settled, pre-match-priced events, 9 September–15 October NZ, across 27 match days and seven leagues.
- Excluded: 114 non-settled rows and seven equal-team-price matches. MLS/EFL Cup have no source rows; Europa League has 27 unmatched and nine missing-result rows, no usable settlements.
- Twelve fixed selection hypotheses and five probability estimates were specified before viewing outcome summaries; no threshold optimisation.
- Learned models use the existing 24-hour result-availability embargo at each retained price timestamp, never target/future outcomes.
- Earlier segment: first 18 match days, 161 matches. Later segment: 2–15 October, nine match days, 89 matches. Split whole NZ days; this retrospective split is not a pristine unseen prospective holdout.
- Draws lose. Returns use one notional $1 per selected favourite at its captured odds. No multis, assumed cash-outs, synthetic odds or alternative markets.
- Uncertainty uses 2,000 seeded day-cluster bootstrap samples, including paired candidate-minus-baseline comparisons. Intervals are exploratory, not adjusted for multiple comparisons; few days and repeated teams limit independence.
- Existing market, pooled historical-rate and context models use repository thresholds unchanged. Probability comparisons require all estimates on the same matches.
### Selection results
| Fixed selection | Full matches | Wins | Full ROI | Later matches | Later ROI |
|---|---:|---:|---:|---:|---:|
| All priced team favourites | 250 | 140 | -5.32% | 89 | -0.20% |
| Price gap $2+ | 131 | 93 | +2.89% | 49 | -1.43% |
| Opponent $3.50+ | 156 | 106 | +2.72% | 58 | +3.40% |
| Opponent $3.50+ and home favourite | 105 | 74 | +5.16% | 38 | +8.87% |
| Opponent $3.50+ and favourite <= $2 | 149 | 103 | +3.42% | 55 | +5.31% |
| Opponent $3.50+ and implied draw <= 25% | 112 | 81 | +1.63% | 44 | +1.86% |
| Opponent $3.50+ and price gap $2+ | 131 | 93 | +2.89% | 49 | -1.43% |
| Opponent $3.50+ and historical rate >= 65% | 119 | 81 | +3.77% | 58 | +3.40% |
| Opponent $3.50+ and context probability >= 65% | 15 | 11 | -10.73% | 11 | -21.45% |
| Opponent $3.50+ and historical/context both >= 65% | 15 | 11 | -10.73% | 11 | -21.45% |
| Opponent $3.50+ and equal market/context blend >= 65% | 15 | 11 | -10.73% | 11 | -21.45% |
| Opponent $3.50+ and blended expected return >= 1.05 | 0 | 0 | — | 0 | — |

### Interpretation and next decision

- **Home favourite + opponent $3.50+: first candidate for forward-only shadow tracking.** Full net +$5.42 on 105 selections, win rate 70.48%; later net +$3.37 on 38. Full ROI 95% day-bootstrap interval is -7.75% to +17.78%; uplift over opponent-only is +2.44 percentage points with paired interval -5.16 to +9.06 points. This is not established superiority.
- Home-filter returns vary by league: EPL -29.64% (11), Bundesliga -14.10% (10), Nations League -6.67% (30), versus UCL +30.24% (17), La Liga +6.82% (17), Serie A +18.91% (11), Ligue 1 +41.22% (9). These small samples do not justify league-specific switches. Removing UCL reduces pooled ROI from +5.16% to +0.32%.
- The favourite <= $2 filter removes only seven of 156 opponent-price selections; incremental evidence is weak. The draw <=25% filter raises win rate but lowers ROI versus the baseline.
- Gap $2+ and the gap/opponent intersection select identical matches here. Historical rate >=65% accepts every match where that estimate is available, so its apparent difference is model warm-up coverage, not added discrimination.
- Context >=65%, historical/context consensus >=65%, and market/context blend >=65% select the same 15 matches (11 wins) and lose $1.61 overall. Very short odds explain why a high hit rate does not imply positive returns. Blended expected return >=1.05 selects no matches.
- No candidate has a clearly positive lower ROI bound. Trying multiple overlapping hypotheses increases selection bias; keep these thresholds fixed and evaluate newly recorded forward predictions before promotion.

### Probability combinations

On 36 identical matches with all three predictions available (29 Nations League,
five La Liga, two Serie A), equal-weight market/historical-rate/context averaging
has Brier 0.20884 versus market-only 0.21263 and log loss 0.60576 versus 0.61151
(lower is better). In the later 27-match subset, Brier is 0.22286 versus 0.22769.
The full paired Brier-difference interval is -0.01444 to +0.00281; later is
-0.01274 to +0.00109. Both include no improvement. This blend is a second
candidate for shadow probability tracking, not a validated profitable selection
rule. Keep estimates unavailable if any component lacks its minimum history;
do not average only whichever components happen to exist.

### Timing and prospective evidence

Restricting historical captures to within 24 hours of kickoff leaves 142
opponent-price matches (+1.94% ROI) and 95 home-filter matches (+5.65%). This
sensitivity check still cannot reproduce the first actually saved forecast;
retained historical snapshots are mutable and may differ from live entry prices.
The current frozen dataset contains 54 settled cumulative-gap forecasts
(38 wins, +$0.39 net; +0.72% ROI), five overlapping exact-gap forecasts,
and no opponent-price forward records. Never sum those overlapping cohorts or
claim the historical opponent-price results were recorded forecasts.

### Reproduction and validation

- Runner: `packages/ingestion/scripts/analyse-football-model-candidates.mjs` (offline only; no database client or writes).
- Input snapshot retained locally at `data/raw/research/football-model-candidates_2026-10-15.json` (git-ignored; no credentials).
- Full report: [football-model-candidates_2026-10-15.json](../branches/features/football-price-gap-trial/football-model-candidates_2026-10-15.json), including source digest, league sensitivity, overlaps, paired intervals and model coverage.
- Run `node packages/ingestion/scripts/analyse-football-model-candidates.mjs data/raw/research/football-model-candidates_2026-10-15.json /tmp/football-candidates.json` from the repository root.
- Four new tests cover chronology/embargo, outcome leakage, unit-return arithmetic, deterministic uncertainty, day splitting and unavailable-model abstention. All 46 ingestion tests pass. Independent Python recomputation confirms source eligibility and four simple-rule results.
- Method references: [time-ordered evaluation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) and [probability scoring](https://sklearn.org/stable/modules/calibration.html). Brier/log loss assess more than calibration alone; small improvements do not establish a pricing edge.

## Approved experimental trials (2026-10-15)

Following the research above, the user requested both candidates alongside the
existing models. Home favourite + opponent $3.50+ is a new independently frozen
cohort using market-implied probability. The three-model blend uses the same
opponent-price cohort and immutable component predictions with exactly 1/3 weight
each; it requires all components and has no minimum probability/return threshold.
No research thresholds were retuned. The historical-rate component uses the
opponent-price cohort across both venues, exactly as tested, not the home-only
subset. The home trial's displayed probability does not depend on learned models.

Forward trial is the default for the two experimental views. Backtests retain
the existing 24-hour result-availability assumption and do not become evidence
of actual forward trial performance. Blend scoring/returns use only available
blend forecasts with paired market scores on those same matches. No claims of
proven improvement, new staking rules or league exclusions are introduced.
