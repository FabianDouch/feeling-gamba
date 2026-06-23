# Supabase Data Model

## Context

The database should normalize racing entities while preserving raw source details. Source data will be incomplete or inconsistent across TAB GraphQL, TAB Form Guide, HRNZ, and future sources.

As of `2026-06-18`, race-day browsing and Insights should use Supabase as the
runtime source of truth. Local JSON fixtures may seed development backfills and
parser tests, but the app should not depend on bundled race fixtures once the
Supabase read models are populated.

As of `2026-06-21`, Google-authenticated user identity is in scope. The first
user-owned tables are implemented in
`supabase/migrations/202606210001_user_profiles_and_favourite_tracks.sql` and
`supabase/migrations/202606210003_user_race_bets.sql`, with bookmaker-specific
tracking added by `supabase/migrations/202606210004_user_race_bet_bookmaker.sql`.

The design should support:

- Google-authenticated app users.
- Daily ingestion.
- Multiple racing codes.
- Multiple source IDs for the same race.
- Odds snapshots over time.
- Final results and dividends.
- Source-backed promotion signals.
- Parser/debug auditability.
- User-owned favourite tracks and personal race-performance logs behind
  row-level security.

The initial Supabase race-data migration is
`supabase/migrations/202606180002_race_data_and_insight_read_models.sql`.
It creates server-side normalized race tables plus two public app-facing read
models: `race_day_entries` and `insight_aggregates`.

## Proposed Tables

### Supabase Auth Users

Supabase Auth owns the canonical user identity in `auth.users`.

Rules:

- Google is the first configured provider.
- Expo uses Supabase PKCE OAuth with the app redirect scheme
  `feelinggamba://auth/callback`.
- User-owned application tables should reference `auth.users(id)` and enforce
  `auth.uid() = user_id` through RLS.

### `profiles`

Implemented user profile table, one row per authenticated user.

Suggested fields:

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text`
- `display_name text`
- `avatar_url text`
- `created_at timestamptz`
- `updated_at timestamptz`

Rules:

- A profile row is created automatically when Supabase Auth inserts a new user.
- A user can read and update only their own profile.
- Profile data should not be required for public race, insight, or promotion
  reads.

### `user_favourite_tracks`

Implemented user-owned favourite course list.

Suggested fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `country text`
- `race_code text`
- `course_slug text`
- `course_name text`
- `created_at timestamptz`

Suggested unique key:

- `(user_id, country, race_code, course_slug)`

Rules:

- A user can read/write only their own favourites.
- Favourites should filter or shortcut existing Supabase race and insight read
  models; they should not duplicate public race rows.
- RLS policies allow authenticated users to select, insert, update, and delete
  only rows where `auth.uid() = user_id`.

### `user_race_bets`

Implemented manual personal race log. This is a user-entered performance record,
not an automated wagering action.

Key fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `bookmaker text` - `tab` or `betcha`
- `source text`
- `source_race_card_id text`
- `source_date date`
- `race_code text`
- `country text`
- `course_name text`
- `course_slug text`
- `race_number int`
- `race_name text`
- `selected_runner_number int`
- `selected_runner_name text`
- `selected_fixed_win_price numeric`
- `selected_starter_count int`
- `outcome_status text`
- `outcome_race_id uuid references races(id) on delete set null`
- `outcome_runner_id uuid references runners(id) on delete set null`
- `outcome_result_position int`
- `outcome_starter_count int`
- `outcome_win_return numeric`
- `outcome_bonus_credit numeric`
- `outcome_total_value_with_bonus_credit numeric`
- `raw jsonb`
- `recorded_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique key:

- `(user_id, bookmaker, source, source_race_card_id)`

Rules:

- A user can read/write only their own bet log rows.
- Promos can create or update one logged record for a visible race-card signal;
  repeated taps update the existing record for the selected bookmaker rather
  than duplicating it.
- TAB and Betcha tracked bets are separate rows so the same race can be tracked
  once per bookmaker.
- Weekly race-day refresh reconciles pending rows by matching
  `source_race_card_id` to `races` and the selected runner number to
  `runners` / `race_results`.
- Settled personal performance calculations must exclude pending and missing
  outcomes from return denominators.
- Personal return metrics use `$1` unit-return calculations only. The table does
  not store real stake size.
- Do not add stake sizing, balance ledgers, withdrawal ledgers, bankroll
  guidance, account scraping, or automated wagering.

### `meetings`

One row per track meeting.

Key fields:

- `id uuid primary key`
- `race_code text not null` - `horse`, `harness`, `greyhound`
- `course_name text not null`
- `course_slug text`
- `country text not null default 'NZ'`
- `region text`
- `meeting_date date not null`
- `source_primary text`
- `source_meeting_id text`
- `created_at timestamptz`
- `updated_at timestamptz`

Suggested unique key:

- `(race_code, country, course_slug, meeting_date)`

### `races`

One row per race.

Key fields:

- `id uuid primary key`
- `meeting_id uuid references meetings(id)`
- `race_number int not null`
- `race_name text`
- `advertised_start timestamptz`
- `status text`
- `distance_m int`
- `track_condition text`
- `declared_runner_count int` - field size before late scratchings where available
- `starter_count int` - final number of runners that started
- `scratched_count int`
- `source_race_id text`
- `source_form_id text`
- `source_race_card_id text`
- `created_at timestamptz`
- `updated_at timestamptz`

Suggested unique key:

- `(meeting_id, race_number)`

### `runners`

One row per runner in a race.

Key fields:

- `id uuid primary key`
- `race_id uuid references races(id)`
- `runner_number int`
- `runner_name text not null`
- `barrier text`
- `trainer_name text`
- `driver_or_jockey_name text`
- `scratched boolean default false`
- `source_runner_id text`
- `created_at timestamptz`
- `updated_at timestamptz`

Suggested unique key:

- `(race_id, runner_number)`

Runner count rules:

- `declared_runner_count` should come from source-level race metadata such as TAB Form Guide `NumberOfRunners` when available.
- `starter_count` should count non-scratched runners once final fields/results are known.
- `scratched_count` should count runners marked as scratched in the final field.
- For historical result pages that only list final participants, set `starter_count` from parsed result rows and leave `declared_runner_count` null unless a declared field source is available.

### `odds_snapshots`

Point-in-time pricing and market metadata.

Key fields:

- `id uuid primary key`
- `race_id uuid references races(id)`
- `runner_id uuid references runners(id)`
- `source text not null`
- `snapshot_at timestamptz not null`
- `win_price numeric`
- `place_price numeric`
- `is_favourite boolean`
- `is_market_mover boolean`
- `raw jsonb`

Notes:

- This table is the source of truth for market state over time.
- `is_market_mover` should only be populated when the source explicitly provides it.

### `race_results`

Final runner-level outcomes.

Key fields:

- `id uuid primary key`
- `race_id uuid references races(id)`
- `runner_id uuid references runners(id)`
- `finish_position int`
- `finish_status text`
- `margin text`
- `result_time text`
- `win_dividend numeric`
- `place_dividend numeric`
- `tote_win_dividend numeric`
- `tote_place_dividend numeric`
- `raw jsonb`

Suggested unique key:

- `(race_id, runner_id)`

### `race_dividends`

Race-level exotic and pool dividends.

Key fields:

- `id uuid primary key`
- `race_id uuid references races(id)`
- `source text not null`
- `product text not null` - e.g. `quinella`, `trifecta`, `first4`, `double`
- `combination text`
- `amount numeric`
- `raw_text text`
- `raw jsonb`

### `source_fetches`

Audit table for every fetch attempt.

Key fields:

- `id uuid primary key`
- `source text not null`
- `url text`
- `method text`
- `request_key text`
- `status_code int`
- `fetched_at timestamptz not null`
- `parser_version text`
- `success boolean not null`
- `error_message text`
- `raw_storage_path text`
- `raw jsonb`

### `ingestion_runs`

One row per manual worker or scheduled function invocation.

Key fields:

- `id uuid primary key`
- `function_name text not null`
- `triggered_by text` - `manual`, `cron`, or `retry`
- `started_at timestamptz`
- `finished_at timestamptz`
- `success boolean`
- `summary jsonb`
- `error_message text`

### `ingestion_locks`

Small lock table to prevent overlapping ingestion for the same source/date.

Key fields:

- `lock_key text primary key`
- `locked_at timestamptz`
- `expires_at timestamptz`
- `run_id uuid references ingestion_runs(id)`

### `race_market_state`

Derived selected market state for each race.

Key fields:

- `race_id uuid primary key references races(id)`
- `selected_snapshot_id uuid references odds_snapshots(id)`
- `favourite_runner_id uuid references runners(id)`
- `market_mover_runner_id uuid references runners(id)`
- `snapshot_at timestamptz`
- `source text`
- `updated_at timestamptz`

Rules:

- Derive from `odds_snapshots`.
- Do not treat this table as the market source of truth.

### `promotions`

Stores source-backed public racing promotions from TAB and Betcha.

Suggested fields:

- `id uuid primary key`
- `source text` - `tab_graphql_promotions` or `betcha_graphql_promotions`
- `source_promotion_id text`
- `description text`
- `uri text`
- `root_category_group text`
- `expiry timestamptz`
- `raw jsonb`
- `fetched_at timestamptz`

Rules:

- Store public promotions separately from authenticated/personalized promotions.
- Treat broad racing promotions separately from race-specific promotion URLs;
  broad unmatched offers are diagnostic records and are not app-facing by
  default.
- Keep raw source payloads because promotion terms and text parsing can change.

### `current_promotion_snapshots`

Stores the current app-facing promotion payload while the MVP still uses a
single generated recommendations document for source-backed promotion signals.

Suggested fields:

- `id uuid primary key`
- `source_date date`
- `source_time_zone text`
- `generated_at timestamptz`
- `generated_at_nz text`
- `payload jsonb`
- `summary jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Rules:

- Use this as the Promos screen cache until the full normalized
  `promotions`/`promotion_recommendations` model is wired.
- Allow public read access through RLS because the payload contains public
  promotion facts only.
- Restrict writes to server-side ingestion using the Supabase secret/service
  role key.

### `current_prediction_snapshots`

Stores the current app-facing Betcha candidate prediction payload independently
from promotions so current race-card predictions can refresh even when there
are no active race-specific promotion URLs.

Suggested fields:

- `id uuid primary key`
- `source_date date`
- `source_time_zone text`
- `generated_at timestamptz`
- `generated_at_nz text`
- `payload jsonb`
- `summary jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Rules:

- Use this as the Predictions screen current-candidate cache.
- Allow public read access through RLS because the payload contains public race
  facts and statistical signals only.
- Treat rows older than 15 minutes as stale because live race cards and
  fixed-win prices can change during the day.
- Restrict writes to `fetch-current-predictions` /
  `refresh-current-predictions` using the Supabase secret/service role key.

### `promotion_predictions`

Stores the latest Betcha bet-back candidate prediction for each prediction model
and source race card. This is a statistical tracking record, not an instruction
to bet.

Key fields:

- `id uuid primary key`
- `prediction_model text`
- `source text`
- `source_race_card_id text`
- `source_date date`
- `predicted_at timestamptz`
- `prediction_signature text`
- `race_code text`
- `country text`
- `course_name text`
- `course_slug text`
- `race_number int`
- `race_name text`
- `advertised_start timestamptz`
- `predicted_runner_number int`
- `predicted_runner_name text`
- `predicted_fixed_win_price numeric`
- `predicted_starter_count int`
- `rank int`
- `blended_cash_plus_bonus_average numeric`
- `outcome_status text`
- `outcome_result_position int`
- `outcome_win_return numeric`
- `outcome_bonus_credit numeric`
- `outcome_total_value_with_bonus_credit numeric`
- `raw jsonb`

Rules:

- Keep one row per `(prediction_model, source, source_race_card_id)` so multiple
  prediction variations can run in parallel on the same race card.
- Current prediction refresh writes these rows independently of promotions so
  same-day race cards can receive predictions even when no source-backed
  promotion is matched.
- Current model keys:
  - `global_bucket_blend_v1`: scores current favourites using all-country
    historical cash-plus-bonus averages for matching favourite price and final
    starter-count buckets.
  - `global_bucket_cash_blend_v1`: scores current favourites using all-country
    historical cash averages for matching favourite price and final
    starter-count buckets; bonus-credit value is excluded.
  - `global_bucket_cash_even_blend_v1`: scores current favourites using an even
    50/50 blend of all-country favourite price-bucket cash average and final
    starter-count cash average; bonus-credit value is excluded.
  - `country_code_bucket_blend_shrunk_v1`: scores current favourites using
    country-and-discipline buckets where available, shrunk toward matching
    global bucket values to reduce small-sample noise.
  - `country_code_distance_condition_v1`: scores current favourites using
    country-and-discipline price, starter-count, distance-band, and
    track-condition buckets with conservative shrinkage toward broader history.
- Current candidate lists are ordered by estimated historical cash return per
  `$1`, not cash-plus-bonus value. Cash-only model tabs use their own cash
  formula; other model tabs order by the 50/50 cash-return estimate.
- Upsert only when the prediction signature changes, such as favourite, price,
  starter count, rank, signal, or model score changing.
- Reconcile outcomes by matching `source_race_card_id` to `races` and the
  predicted runner number to `runners` / `race_results`.
- Keep no-race matches pending until at least 24 hours after advertised start so
  same-day predictions are not marked `race_not_found` before race-day ingestion
  catches up.
- Calculate prediction returns from the stored predicted fixed-win price, not
  from the later final favourite.
- Apply the same bonus-credit rule as Insights: 2nd earns `$1` for 5+ final
  starters; 3rd earns `$1` for 8+ final starters.
- Public RLS read access is allowed because rows contain app-facing prediction
  facts and outcomes only.
- The Predictions tab may read recent rows for itemised race history, but must
  continue using model-scoped `prediction_aggregates` for performance metrics.
- Itemised history reads may filter by `source_date`, `country`, `race_code`,
  and `course_slug`.

### `promotion_recommendations`

Derived current race-card facts and historical statistical signals for
race-specific promotions.

Suggested fields:

- `id uuid primary key`
- `promotion_id uuid references promotions(id)`
- `race_id uuid references races(id)`
- `source_race_card_id text`
- `starter_count int`
- `favourite_runner_id uuid references runners(id)`
- `favourite_price numeric`
- `price_bucket_label text`
- `price_bucket_win_percentage numeric`
- `starter_count_win_percentage numeric`
- `historical_delta_percentage numeric`
- `signal_label text`
- `signal_detail text`
- `missing_price boolean`
- `raw jsonb`

Rules:

- Use current race-card prices only when the source returns numeric fixed-win
  prices.
- Show missing-price states explicitly; do not invent favourites.
- Signals may compare historical bucket win rates with implied price
  probabilities, but must not include stake sizing or bankroll advice.

### `track_race_odds_requests`

Stores an audit record for on-demand first-two-races public odds requests from
the Insights screen.

Key fields:

- `id uuid primary key`
- `requested_at timestamptz`
- `source text`
- `source_date date`
- `source_time_zone text`
- `country text`
- `course_slug text`
- `race_code text`
- `race_numbers int[]`
- `status text`
- `fetched_at timestamptz`
- `payload jsonb`
- `error_message text`

Rules:

- The app may request these rows only through the `request-track-race-odds`
  Edge Function.
- The function fetches public Betcha race-card odds for races 1 and 2 only.
- Payloads may include runner number, runner name, fixed-win price, favourite
  flag, MarketMover flag, starter count, race status, and fetched timestamp.
- Payloads may also include the same source-backed favourite context shown for
  Betcha bet-back candidates: implied win percentage, favourite price bucket,
  historical price bucket, starter bucket, blended cash-plus-bonus average,
  sample size, and signal text.
- Do not store TAB/Betcha account credentials or automate personalised promo
  access in this table or function.

## App-Facing Read Models

### `race_day_entries`

Stored read model for the Race Days default list and filter results. The app
should read this table instead of bundled race fixtures.

Key fields:

- `race_id uuid primary key`
- `meeting_id uuid`
- `meeting_date date`
- `country text`
- `race_code text`
- `course_name text`
- `course_slug text`
- `race_number int`
- `race_name text`
- `advertised_start timestamptz`
- `distance_m int`
- `track_condition text`
- `declared_runner_count int`
- `starter_count int`
- `favourite_runner_name text`
- `favourite_price numeric`
- `favourite_result_position int`
- `favourite_win_return numeric`
- `favourite_bonus_credit numeric`
- `favourite_total_value_with_bonus_credit numeric`
- `market_mover_runner_name text`
- `winner_runner_name text`
- `winner_win_dividend numeric`
- `source_status text`
- `missing_favourite boolean`
- `missing_price boolean`
- `missing_result boolean`

Rules:

- Default Race Days reads should request the latest 20 races across all AUS/NZ
  records, interpreted by the app using the `Pacific/Auckland` calendar timezone
  where date conversion is needed.
- Date, country, discipline, and course filters should query Supabase for the
  specific filtered rows instead of filtering a bundled all-data fixture.
- Missing favourite, price, and result states must be explicit.
- Public RLS read access is allowed because this table contains app-facing race
  facts only.

### `insight_aggregate_runs`

Operational table recording each stored insight derivation run.

Key fields:

- `id uuid primary key`
- `source text`
- `triggered_by text`
- `started_at timestamptz`
- `finished_at timestamptz`
- `source_min_date date`
- `source_max_date date`
- `success boolean`
- `summary jsonb`
- `error_message text`

### `insight_aggregates`

Stored read model for Insights and promotion signal comparisons. The app should
read these stored aggregate rows rather than calculating historical insight
metrics from raw race rows at runtime.

Key fields:

- `scope_key text unique`
- `scope_type text` - `overall`, `country`, `course`, `race_code`,
  `country_race_code`, `course_race_code`, `starter_count`, `price_bucket`,
  `distance_band`, or `track_condition`
- `date_from date`
- `date_to date`
- `country text`
- `race_code text`
- `course_name text`
- `course_slug text`
- `starter_count int`
- `distance_band text`
- `track_condition_group text`
- `price_bucket_start numeric`
- `price_bucket_end numeric`
- `price_bucket_label text`
- `race_count int`
- `favourite_selections int`
- `wins int`
- `seconds int`
- `thirds int`
- `win_percentage numeric`
- `second_percentage numeric`
- `third_percentage numeric`
- `total_stake numeric`
- `total_return numeric`
- `net_return numeric`
- `average_return_per_dollar numeric`
- `roi_percentage numeric`
- `total_bonus_credit numeric`
- `total_value_with_bonus_credit numeric`
- `average_value_per_dollar_with_bonus_credit numeric`
- `bonus_credit_percentage numeric`
- `missing_favourite_count int`
- `missing_price_count int`
- `missing_result_count int`

Rules:

- Rebuild or upsert aggregates after new race-day data is inserted or
  reconciled.
- Store scoped rows separately so country/course filters use their own
  denominators.
- Starter-count and price-bucket rows should include all-country/all-discipline,
  country-only, race-code-only, country+race-code, and course scopes. The
  country+race-code bucket rows support prediction-model comparisons that need
  discipline-specific history inside NZ or AUS.
- Distance-band and track-condition rows should include all-country, race-code,
  and country+race-code scopes. These rows support prediction variants and do
  not need to be displayed as standard Insights tables yet.
- Client metadata reads should use the small canonical scopes: `country` rows
  for countries, `course` rows for racecourses, and `race_code` rows for
  disciplines. Do not scan every aggregate row to build filters because the REST
  response can be capped before the full course list is returned.
- Public RLS read access is allowed because this table contains app-facing
  aggregate facts only.

### `prediction_aggregates`

Stored read model for the Predictions tab. The app should read these stored rows
instead of calculating prediction performance from raw prediction rows at
runtime.

Key fields:

- `scope_key text unique`
- `prediction_model text`
- `scope_type text` - `overall` or `race_code`
- `date_from date`
- `date_to date`
- `race_code text`
- `prediction_count int`
- `settled_count int`
- `pending_count int`
- `wins int`
- `seconds int`
- `thirds int`
- `win_percentage numeric`
- `second_percentage numeric`
- `third_percentage numeric`
- `total_stake numeric`
- `total_return numeric`
- `net_return numeric`
- `average_return_per_dollar numeric`
- `roi_percentage numeric`
- `total_bonus_credit numeric`
- `total_value_with_bonus_credit numeric`
- `average_value_per_dollar_with_bonus_credit numeric`
- `bonus_credit_percentage numeric`
- `missing_result_count int`
- `missing_runner_count int`

Rules:

- Rebuild after prediction outcome reconciliation, grouped by
  `prediction_model`.
- Use settled predictions as the return denominator.
- Exclude pending, missing-result, missing-runner, and race-not-found rows from
  stake, cash, bonus, net, ROI, and average-return calculations.
- Keep pending and missing-outcome counts visible.
- Public RLS read access is allowed because this table contains app-facing
  aggregate facts only.
- This remains the source for Predictions tab performance metrics even when the
  tab also displays recent model-filtered `promotion_predictions` rows as
  history.

### Legacy Named Insight Views

Older planning notes refer to `race_favourite_results`,
`favourite_performance_summary`, `favourite_performance_by_starter_count`, and
`favourite_performance_by_price_bucket`. Those names describe useful conceptual
views, but the first Supabase implementation stores the minimal app contract in
`race_day_entries` and `insight_aggregates`. If the app later needs detailed
race drill-in or separate SQL views, create them as read models over the same
normalized tables rather than reintroducing local fixture calculations.

#### `favourite_performance_summary`

A view aggregating favourite finish-position outcomes for a filterable date
range.

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
- `net_return`
- `average_return_per_1`
- `roi_percentage`
- `missing_price_count`
- `missing_favourite_count`
- `missing_result_count`

Rules:

- Count only races with known favourite and final result in percentage
  denominators.
- Show missing favourite/result counts separately.
- Use pre-race odds favourite as the default statistic source.
- Calculate `$1` unit-stake returns only when the favourite has a known win
  price or labelled final dividend source.
- Keep summaries separable by `race_code` for thoroughbred, harness, and
  greyhound views.

#### `favourite_performance_by_starter_count`

A view aggregating favourite finish-position outcomes by final starter count.

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
- `net_return`
- `average_return_per_1`
- `roi_percentage`
- `missing_price_count`
- `missing_favourite_count`
- `missing_result_count`

Rules:

- Group by `races.starter_count`, not declared runner count.
- Exclude scratched runners from starter counts.
- Keep small-sample denominators visible beside percentages.
- Keep return denominators visible and exclude races missing favourite price.

#### `favourite_performance_by_price_bucket`

A view aggregating favourite win outcomes by fixed-win favourite price band.

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

Rules:

- Use 50c buckets: `$1.00-$1.49`, `$1.50-$1.99`, `$2.00-$2.49`, and onward.
- Include only favourites with a numeric selected price and final result in
  bucket denominators.
- Sort buckets by numeric lower bound.
- Keep small-sample denominators visible beside percentages.

## Design Notes

- Store source IDs separately from internal UUIDs because TAB, Form Guide, HRNZ, NZTR, and GRNZ use different IDs.
- Keep `raw jsonb` on source-derived tables so parsers can be fixed without losing historical context.
- Prefer append-only odds snapshots over updating a single current odds field.
- Store both declared field size and final starter count; scratchings matter for favourite performance analysis.
- Treat final results as mutable until the source status is final and at least one successful post-race fetch has been recorded.
- Do not silently merge result-page favourite rank into pre-race favourite statistics; expose it separately if used.
- Do not silently mix pre-race fixed-win prices with final dividends in return
  calculations; label the price source used for each return metric.
- Keep normalized source/raw tables server-side. The public client read surface
  should be app-facing read models such as `race_day_entries`,
  `insight_aggregates`, and current promotion snapshots.
