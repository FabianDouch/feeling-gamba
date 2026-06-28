alter table public.race_day_entries
  add column if not exists other_starters_average_fixed_win_price numeric,
  add column if not exists other_starters_price_count int,
  add column if not exists other_starters_price_outlier_count int;

alter table public.insight_aggregates
  add column if not exists other_starters_average_price_bucket_start numeric,
  add column if not exists other_starters_average_price_bucket_end numeric,
  add column if not exists other_starters_average_price_bucket_label text;

alter table public.insight_aggregates
  drop constraint if exists insight_aggregates_scope_type_check;

alter table public.insight_aggregates
  add constraint insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'country',
      'course',
      'race_code',
      'country_race_code',
      'course_race_code',
      'starter_count',
      'price_bucket',
      'distance_band',
      'track_condition',
      'other_starters_average_price_bucket'
    )
  );

alter table public.promotion_predictions
  add column if not exists predicted_other_starters_average_fixed_win_price numeric,
  add column if not exists predicted_other_starters_price_count int,
  add column if not exists predicted_other_starters_price_outlier_count int;

with selected_market as (
  select
    race_market_state.race_id,
    race_market_state.favourite_runner_id,
    odds_snapshots.snapshot_at,
    odds_snapshots.source
  from public.race_market_state
  left join public.odds_snapshots
    on odds_snapshots.id = race_market_state.selected_snapshot_id
),
other_starter_metrics as (
  select
    odds_snapshots.race_id,
    round(avg(odds_snapshots.win_price) filter (
      where odds_snapshots.win_price < 70
    ), 2) as other_starters_average_fixed_win_price,
    count(*) filter (
      where odds_snapshots.win_price < 70
    )::int as other_starters_price_count,
    count(*) filter (
      where odds_snapshots.win_price >= 70
    )::int as other_starters_price_outlier_count
  from public.odds_snapshots
  join selected_market
    on selected_market.race_id = odds_snapshots.race_id
  where odds_snapshots.win_price is not null
    and odds_snapshots.runner_id is distinct from selected_market.favourite_runner_id
    and (
      selected_market.source is null
      or odds_snapshots.source = selected_market.source
    )
    and (
      selected_market.snapshot_at is null
      or odds_snapshots.snapshot_at = selected_market.snapshot_at
    )
  group by odds_snapshots.race_id
)
update public.race_day_entries
set
  other_starters_average_fixed_win_price = coalesce(
    race_day_entries.other_starters_average_fixed_win_price,
    other_starter_metrics.other_starters_average_fixed_win_price
  ),
  other_starters_price_count = coalesce(
    race_day_entries.other_starters_price_count,
    other_starter_metrics.other_starters_price_count
  ),
  other_starters_price_outlier_count = coalesce(
    race_day_entries.other_starters_price_outlier_count,
    other_starter_metrics.other_starters_price_outlier_count
  )
from other_starter_metrics
where race_day_entries.race_id = other_starter_metrics.race_id;

create index if not exists insight_aggregates_other_starters_avg_price_idx
  on public.insight_aggregates (
    scope_type,
    country,
    race_code,
    other_starters_average_price_bucket_start
  );
