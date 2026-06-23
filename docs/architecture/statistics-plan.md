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
