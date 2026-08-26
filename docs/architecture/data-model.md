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
As of `2026-07-17`, signed-in users can lock one current win-percentage multi
recommendation per source date/model, implemented in
`supabase/migrations/202607170004_user_locked_multi_recommendations.sql`.
As of `2026-08-05`, racing percentage multi locks close at the current
prediction snapshot's first eligible race start instead of a fixed 10:00am NZ
time cutoff.
As of `2026-08-26`, `single_win_percentage_60_plus_v1` and
`single_win_percentage_65_plus_v1` are additional single-runner
`prediction_model` values stored in `promotion_predictions`. They track each
current favourite whose blended historical win score is at least the selected
threshold as a separate notional `$1` single and do not require a new table.
As of `2026-07-24`, `multi_win_percentage_60_plus_v1` and
`multi_place_percentage_v1` are additional multi-only `prediction_model`
values for tracked percentage multis; they use the existing multi
recommendation tables. `multi_place_percentage_v1` adds an RPC migration for
place-hit rank filtering, but does not require a new table.
As of `2026-07-24`, UFC historical support is implemented as a separate
sport-specific read path in
`supabase/migrations/202607240002_ufc_historical_data_and_insights.sql`. The
first UFC importer combines the Vali Hameed UFC master Kaggle dataset with exact
date+fighter-pair matches from the Jerzy Szocik daily odds dataset. UFC rows do
not use racing `meetings`, `races`, `runners`, starter-count, country, track, or
discipline fields.
As of `2026-07-24`, current UFC percentage multi predictions use separate UFC
recommendation and lock tables in
`supabase/migrations/202607240003_ufc_prediction_multis.sql`, because the
racing multi tables depend on race-card fields and a first-eligible-race
prediction lock rule.
As of `2026-08-25`, NRL settlement support starts with sport-specific source
tables in `supabase/migrations/202608250001_nrl_settlement_data.sql`. Official
NRL match, team, player, and try-scorer rows are stored separately from racing
and UFC because the source identity model and scoring events do not fit the
race/runner shape. Current-market fixed-win snapshot capture writes current
`Match Betting` prices to `nrl_market_snapshots`, and
`supabase/migrations/202608250002_nrl_fixed_win_snapshot_results.sql` adds
fixed-win snapshot result/status rows for settled return tracking.
`supabase/migrations/202608250003_nrl_insight_aggregates.sql` adds NRL player
match appearances plus `nrl_insight_aggregates`, so Insights can show
fixed-win single aggregates and official try-scorer percentage aggregates.

The design should support:

- Google-authenticated app users.
- Daily ingestion.
- Multiple racing codes.
- Multiple sports through sport-specific historical read models where the
  source shape does not fit racing meetings/runners.
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
- Do not add stake sizing, bankroll guidance, account scraping, or automated
  wagering.

### `user_balance_accounts`

Manual personal balance tracker account for signed-in users. This is a
user-entered ledger, not a betting recommendation, stake-sizing engine, or
bookmaker account integration.

Key fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `currency text not null default 'NZD'`
- `initial_balance numeric(12, 2)`
- `current_balance numeric(12, 2)`
- `opened_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique key:

- `(user_id)` so each signed-in user has one active manual balance account.

Rules:

- A user can read only their own balance account through RLS.
- Balance mutations should go through the `create_user_balance_account` and
  `add_user_balance_event` RPC functions so the current balance and event log
  remain consistent.
- Balances cannot be negative in the MVP.

### `user_balance_events`

Append-style manual balance history used to draw the Account balance line
graph.

Key fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `account_id uuid references user_balance_accounts(id) on delete cascade`
- `event_type text` - `initial`, `deposit`, `withdrawal`, or `manual_update`
- `amount numeric(12, 2)`
- `balance_delta numeric(12, 2)`
- `balance_after numeric(12, 2)`
- `note text`
- `occurred_at timestamptz`
- `created_at timestamptz`

Rules:

- A user can read only their own balance events through RLS.
- Deposit and withdrawal events store a positive `amount`; withdrawals store a
  negative `balance_delta`.
- Manual update events store the resulting `balance_after` and the implied
  `balance_delta`, so corrections are visible on the graph.
- Events are not linked to predictions, recommendations, or tracked promo bets
  for stake sizing.

### `user_locked_multi_recommendations`

Implemented owner-secured lock table for the signed-in user's current
percentage multi recommendation. This preserves the exact current
recommendation the user chose before the recommendation cache can refresh again.

Key fields:

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `source text`
- `source_date date`
- `source_time_zone text`
- `prediction_model text`
- `recommendation_type text` - `neutral` or `positive`
- `locked_at timestamptz`
- `lock_cutoff_at timestamptz`
- `generated_at timestamptz`
- `generated_at_nz text`
- `leg_count int`
- `combined_fixed_win_price numeric`
- `average_score numeric`
- `legs jsonb`
- `raw jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

Unique key:

- `(user_id, source, source_date, prediction_model)`

Rules:

- A user can read, insert, and delete only their own locked multi rows through
  RLS.
- The app and insert RLS policy allow creating a lock only before the stored
  `lock_cutoff_at`, which is copied from the current racing prediction
  snapshot's first eligible race start.
- The first lock for a user/source/source-date/model wins; later app refreshes
  should display the locked snapshot instead of replacing it with a newer live
  recommendation.
- The stored legs are the signed-in user's personal percentage-multi snapshot.
  Prediction History can read them through authenticated RPCs and derive
  outcomes from stored `races`, `runners`, and `race_results` rows so a user's
  locked multi can be counted separately from the later shared recommendation.
  Locks still do not store real stake size and do not enable automated
  wagering.

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
- Current prediction models can derive field-shape signals from this table,
  including the average fixed-win price of non-favourite starters.

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
- Do not replace the current row when the racing source scan returns race IDs
  but every race-card detail request fails; preserve the previous usable
  snapshot instead.

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
- `predicted_other_starters_average_fixed_win_price numeric`
- `predicted_other_starters_price_count int`
- `predicted_other_starters_price_outlier_count int`
- `predicted_starter_count int`
- `rank int`
- `cash_average_score numeric`
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
    historical cash averages for matching favourite price and final
    starter-count buckets, with cash-plus-bonus retained only as supporting
    context.
  - `global_bucket_cash_blend_v1`: scores current favourites using all-country
    historical cash averages for matching favourite price and final
    starter-count buckets; bonus-credit value is excluded.
  - `global_bucket_cash_even_blend_v1`: scores current favourites using an even
    50/50 blend of all-country favourite price-bucket cash average and final
    starter-count cash average; bonus-credit value is excluded.
  - `global_bucket_cash_price_only_v1`: scores current favourites using only
    the all-country favourite price-bucket cash average; bonus-credit value is
    excluded.
  - `global_bucket_cash_starter_only_v1`: scores current favourites using only
    the all-country final starter-count cash average; bonus-credit value is
    excluded.
  - `global_other_starters_average_price_cash_v1`: scores current favourites
    using the all-country cash average for the matching bucket of average
    fixed-win price among the other priced starters. Other-starter prices at
    `$70.00` or above are excluded from the average to reduce outlier
    distortion; the excluded count is stored with each prediction row.
  - `country_code_bucket_blend_shrunk_v1`: scores current favourites using
    country-and-discipline cash buckets where available, shrunk toward matching
    global cash bucket values to reduce small-sample noise.
  - `country_code_distance_condition_v1`: scores current favourites using
    country-and-discipline cash buckets for price, starter-count,
    distance-band, and track-condition signals with conservative shrinkage
    toward broader cash history.
  - `single_win_percentage_60_plus_v1` and
    `single_win_percentage_65_plus_v1`: track each current favourite whose
    blended win score is at least the selected threshold, where the score is 65%
    favourite price-bucket win rate and 35% starter-count win rate. Each
    eligible row is a separate `$1` single outcome; `cash_average_score` stores
    the win score and `blended_cash_plus_bonus_average` is null.
- Current candidate lists are ordered by the active prediction model's
  `cashAverageScore`, which is calculated differently for each prediction type.
  Cash-plus-bonus value remains supporting context and must not drive
  recommendations.
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
- The Predictions tab may call `get_prediction_history_summary` to summarise
  the full selected history date range because the visible history list is
  paginated and must not be used as an aggregate denominator.
- The Predictions tab reads itemised history through
  `get_prediction_history_entries` so ordering is applied before pagination.

### `multi_bet_recommendations`

Stores one tracked multi bet recommendation per model/source date when the
pre-race candidate snapshot has enough eligible legs. Most rows are keyed to a
single-runner prediction model; dedicated multi-only models may also use this
table. This is a statistical tracking record, not a staking recommendation.

Key fields:

- `id uuid primary key`
- `prediction_model text`
- `source text`
- `source_date date`
- `predicted_at timestamptz`
- `prediction_signature text`
- `recommendation_type text` - `neutral` or `positive`
- `leg_count int`
- `combined_fixed_win_price numeric`
- `average_cash_score numeric`
- `outcome_status text`
- `outcome_win_return numeric`
- `outcome_settled_leg_count int`
- `outcome_winning_leg_count int`
- `outcome_missing_result_count int`
- `outcome_missing_runner_count int`
- `raw jsonb`

Rules:

- Keep one current row per `(prediction_model, source, source_date,
  recommendation_type)`, while the refresh worker removes stale same-day
  recommendation types for the same model when a later pre-race refresh changes
  the active recommendation.
- When a changed same-day recommendation replaces the stored leg snapshot, reset
  the parent outcome fields to `pending` before reconciliation so stale results
  from the previous leg set do not leak into Prediction History.
- Prefer a `positive` multi when at least three Positive priced legs exist for
  the model; otherwise store a `neutral` multi from Positive-or-Neutral priced
  legs.
- Store three to five legs for cash-score and original win-percentage multis,
  ordered by the model-specific score and then advertised start.
- `multi_win_percentage_blend_v1` is a multi-only model that scores favourites
  from historical win percentages using 65% favourite price-bucket win rate and
  35% starter-count win rate. It keeps the same Positive-first then
  Neutral-or-better minimum-three-leg rule as cash-score multis, but its stored
  `average_cash_score`/leg `cash_average_score` values represent win-rate
  percentages for display as an average win score.
- `multi_win_percentage_60_plus_v1` and
  `multi_win_percentage_65_plus_v1` are stricter multi-only models using the
  same blended win score. They store only priced legs with scores of at least
  60% and 65% respectively, require at least three eligible legs, and can store
  up to 10 legs.
- `multi_place_percentage_v1` is a percentage-based placing multi model. It
  scores favourites from historical place percentages using 65% favourite
  price-bucket place rate and 35% starter-count place rate, stores only races
  with an active place market, requires at least three eligible legs, and can
  store up to eight legs.
- Win-based multis settle as a cash win only when every leg wins; otherwise a
  fully resulted multi settles as a cash loss.
- `multi_place_percentage_v1` stores source-observed fixed-place odds on each
  leg and the combined fixed-place price on the parent recommendation. It
  settles as a place multi cash return only when every leg finishes inside the
  stored `placePayoutDepth`; the cash return is the product of the stored
  fixed-place leg prices.
- Do not store or display bonus-bet value for multi recommendations.
- Public RLS read access is allowed because rows contain app-facing prediction
  facts and outcomes only.

### `multi_bet_recommendation_legs`

Stores the leg snapshot and settled outcome for each tracked multi bet
recommendation.

Key fields:

- `id uuid primary key`
- `recommendation_id uuid references multi_bet_recommendations(id)`
- `leg_index int`
- `source_race_card_id text`
- `country text`
- `race_code text`
- `course_name text`
- `course_slug text`
- `race_number int`
- `race_name text`
- `advertised_start timestamptz`
- `predicted_runner_number int`
- `predicted_runner_name text`
- `predicted_fixed_win_price numeric`
- `prediction_rank int` - rank from the model-specific candidate list, used by
  rank-filtered percentage multi performance.
- `cash_average_score numeric`
- `signal_label text`
- `signal_tone text`
- `outcome_status text`
- `outcome_result_position int`
- `outcome_win_return numeric`
- `raw jsonb`

Rules:

- Refresh replaces the leg snapshot whenever the parent recommendation
  signature changes before the first eligible race starts.
- Reconcile outcomes by matching `source_race_card_id` to `races` and the
  predicted runner number to `runners` / `race_results`.
- Keep no-race matches pending during the same 24-hour grace window used by
  single-runner predictions.
- Prediction history should show leg-level Won/Lost/Pending/Missing labels so a
  multi loss can be inspected without recalculating from raw rows in the app.
- Dedicated percentage multi leg snapshots must preserve the original
  percentage candidate rank so historical performance can be re-aggregated as
  hypothetical top-N multis after settlement. The original win-percentage model
  supports top 3-5, the 60%+/65%+ win-percentage models support top 3-10,
  `multi_place_percentage_v1` supports top 3-8, and UFC percentage multi
  models support top 3-8.

### `ufc_multi_recommendations`

Stores one current UFC same-card percentage multi recommendation per model,
source date, and Betcha UFC card. These rows are separate from racing multis
because they use fight-card IDs, fighter entrants, and card-start lock cutoffs
instead of race cards and racing prediction-window locks.

Key fields:

- `prediction_model text` - one of
  `ufc_multi_favourite_price_win_percentage_v1`,
  `ufc_multi_other_fighter_price_win_percentage_v1`, or
  `ufc_multi_price_difference_win_percentage_v1`.
- `source_date date`, `source_card_id text`, `source_card_name text`
- `prediction_signature text`
- `leg_count int`
- `first_fight_start timestamptz`
- `lock_cutoff_at timestamptz`
- `combined_fixed_win_price numeric`
- `average_win_score numeric`
- `scope_type text` - favourite price bucket, other fighter price bucket, or
  price-difference bucket.
- outcome fields for pending, settled, and missing-result states.

Rules:

- Only current Betcha competitions whose name/slug clearly identifies a UFC
  card can create UFC recommendations; non-UFC MMA competitions such as PFL are
  filtered out.
- Current UFC prediction snapshots also expose per-model UFC Win % single
  candidates in the payload for Predictions display. The base single candidates
  use the same favourite-price, other-fighter-price, and price-difference
  historical bucket signals as UFC multis. Dedicated 65%+, 75%+, and 85%+ single
  threshold models keep each fight's strongest qualifying signal across those
  UFC bucket models. All UFC singles are persisted separately in
  `ufc_single_predictions` for $1 unit-stake history.
- Every leg in a UFC multi must come from the same Betcha UFC card and an open
  Head to Head market with two priced fighters.
- Each model requires at least three eligible fights and can store up to eight
  legs, ordered by model-specific historical favourite win percentage and then
  advertised start.
- UFC locks close from the stored `lock_cutoff_at`, currently 15 minutes before
  the first fight on the card, not at the racing first-eligible-race cutoff.
- UFC reconciliation matches leg fighter pairs to stored `ufc_fight_entries`
  result rows within a small event-date window. Matched settled fights store the
  winner and `$1` leg return; unmatched legs more than four hours after
  advertised start become `missing_result` open issues instead of remaining
  pending indefinitely.

### `ufc_multi_recommendation_legs`

Stores fight-level leg snapshots for each UFC multi recommendation.

Key fields:

- `recommendation_id uuid references ufc_multi_recommendations(id)`
- `leg_index int`
- `source_event_id text`, `source_market_id text`
- `advertised_start timestamptz`
- predicted fighter name, entrant ID, and fixed-win price.
- other fighter name, entrant ID, and fixed-win price.
- `price_difference numeric`
- `prediction_rank int`
- `win_score numeric`
- bucket label, bucket win percentage, and bucket sample size.
- pending/settled/missing result outcome fields.

Rules:

- Leg snapshots preserve original model ranks so Prediction History can
  re-aggregate all legs, top 3, or top 4 views for each UFC model.
- Public read access is allowed because rows contain app-facing market snapshots
  and derived outcomes only.

### `ufc_single_predictions`

Stores every current UFC Win % single candidate per model, source date, Betcha
UFC card, and fight. These rows answer the historical question "what happens if
we put $1 on every eligible UFC single candidate for this model?" without
recalculating from current snapshots.

Key fields:

- `prediction_model text` - one of the UFC percentage model keys, including the
  three UFC same-card bucket models or the `ufc_single_win_percentage_65_plus_v1`,
  `ufc_single_win_percentage_75_plus_v1`, and
  `ufc_single_win_percentage_85_plus_v1` threshold single models.
- `source_date date`, `source_card_id text`, `source_card_name text`
- `source_event_id text`, `source_market_id text`
- `advertised_start timestamptz`
- `prediction_signature text`
- fight name, predicted fighter entrant/name/fixed-win price, opposing fighter
  entrant/name/fixed-win price, and `price_difference`.
- `prediction_rank int`
- `win_score numeric`
- bucket label, bucket win percentage, bucket sample size, signal label, tone,
  and detail.
- outcome fields for pending, settled, and missing-result states.

Rules:

- Rows are upserted from `ufcWinPercentageMultis.models[].singleCandidates`
  during UFC current-prediction refresh and snapshot replay.
- Threshold single rows use the strongest qualifying UFC bucket-model signal per
  fight and are ranked within the model/source date/card by win score.
- The unique key is `(prediction_model, source, source_date, source_card_id,
  source_event_id)`, so each model tracks one single candidate per fight.
- Stale rows for the same source date/model are deleted when a refreshed payload
  no longer contains the candidate.
- UFC single reconciliation uses the same fighter-pair and event-date matching
  as UFC multi legs, writes the stored winner, and records `$1` cash return from
  the predicted fighter's fixed-win price when the predicted fighter wins.
- `get_ufc_single_prediction_summary` and
  `get_ufc_single_prediction_entries` provide app-facing date-range performance
  and history without racing-only country, discipline, or racecourse filters.
- Public read access is allowed because rows contain app-facing market snapshots
  and derived outcomes only.

### `user_locked_ufc_multi_recommendations`

Stores a signed-in user's locked UFC multi snapshot for a source date, UFC card,
and UFC percentage model.

Rules:

- A user can lock one row per `(user_id, source, source_date, source_card_id,
  prediction_model)`.
- Owner-only RLS applies to reads/deletes; inserts require `auth.uid()` and
  `now() < lock_cutoff_at`.
- Locked UFC snapshots are informational only. They do not store stake size,
  bankroll state, or automated wagering instructions.

### NRL settlement tables

Implemented sport-specific NRL tables for official result settlement:

- `nrl_teams`: source-specific team identities.
- `nrl_players`: source-specific player identities and latest observed team.
- `nrl_matches`: official NRL match rows, final scores, winner, status, venue,
  season, and round.
- `nrl_try_scorers`: official NRL `type: "Try"` timeline rows with player,
  team, game seconds, display minute, and running score when provided.
- `nrl_player_match_appearances`: official NRL match roster rows used as the
  denominator for player/team anytime try-scorer percentages.
- `nrl_market_snapshots`: current fixed-win snapshots, kept separate from
  official NRL result rows.
- `nrl_fixed_win_snapshot_results`: one outcome/status row per current-market
  fixed-win snapshot, including pending, unmatched, missing-result, settled,
  draw, and non-standard states.
- `nrl_insight_aggregates`: stored app-facing NRL aggregates for fixed-win
  singles and try-scorer percentages.
- `nrl_single_predictions`: persisted current NRL single prediction rows for
  fixed-win percentage and try-scorer percentage models.

Rules:

- Official NRL is stored with `source = 'official_nrl'`.
- Current-market IDs must not be treated as interchangeable with official NRL
  IDs.
- NRL result and try-scorer rows can support percentage models once prediction
  selection rules exist.
- NRL cash models require source-backed current-market prices before a row can
  contribute to return metrics.
- Pending, unmatched, and missing-result fixed-win snapshots are retained for
  auditability but excluded from settled return denominators.
- Try-scorer percentages use player-match appearances as the denominator and
  official try events as the numerator. Try-scorer cash metrics remain blocked
  until source-backed player try-scorer prices are validated.
- Current NRL single predictions must preserve whether a row came from a
  source-backed bookmaker market or from official historical roster context.
- Same-game multi return metrics require quoted same-game multi prices or a
  documented return basis; do not infer them from multiplied single-leg prices.

### `nrl_insight_aggregates`

Stored app-facing NRL aggregate read model. The app reads this table when the
Insights sport toggle is set to NRL.

Key fields:

- `scope_key text unique`
- `insight_type text` - `fixed_win_single` or `try_scorer_percentage`
- `scope_type text` - app-facing NRL rows use `overall`, `selection_type`,
  `team`, `season`, `season_round`, `player`, or `player_team`
- `source text`
- `selection_type text` - `home`, `away`, or `favourite`
- `season int`
- `round_number int`
- `team_source_id text`
- `team_name text`
- `player_source_id text`
- `player_name text`
- `date_from date`
- `date_to date`
- `event_count int`
- `selection_count int`
- `win_count int`
- `win_percentage numeric`
- `total_tries int`
- `total_stake numeric`
- `total_return numeric`
- `net_return numeric`
- `average_return_per_dollar numeric`
- `roi_percentage numeric`
- `missing_price_count int`
- `pending_count int`
- `unmatched_count int`
- `missing_result_count int`

Rules:

- Fixed-win aggregates use current `Match Betting` prices reconciled through
  `nrl_fixed_win_snapshot_results`.
- The overall fixed-win row tracks favourites only. Team rows track home/away
  fixed-win selections for each team without double-counting the favourite.
- Provider-specific fixed-win rows are intentionally not generated for the
  app-facing Insights view.
- Try-scorer percentage rows use one settled player appearance as one
  selection and count a win when that player scored at least one official try.
- Try-scorer rows store counts and percentages only; cash fields remain zero
  until source-backed player try-scorer prices are added.
- Public RLS read access is allowed because rows contain app-facing aggregate
  facts only.

### `nrl_single_predictions`

Stored app-facing current NRL single prediction rows. The Predictions tab reads
this table for NRL Singles -> Win %.

Key fields:

- `prediction_model text` -
  `nrl_fixed_win_percentage_single_v1` or
  `nrl_try_scorer_percentage_single_v1`
- `source text`
- `source_date date`
- `source_prediction_key text unique`
- `source_event_id text`
- `source_market_id text`
- `matched_nrl_match_id uuid`
- `source_match_id text`
- `advertised_start_at timestamptz`
- `predicted_at timestamptz`
- `match_label text`
- `home_team_name text`
- `away_team_name text`
- `predicted_team_source_id text`
- `predicted_team_name text`
- `predicted_player_source_id text`
- `predicted_player_name text`
- `predicted_fixed_win_price numeric`
- `other_team_name text`
- `other_team_fixed_win_price numeric`
- `prediction_rank int`
- `win_score numeric`
- `signal_label text`
- `signal_tone text`
- `signal_detail text`
- `bucket_sample_size int`
- `lineup_status text` - `not_applicable`, `official_lineup`, or
  `historical_team_roster`
- `outcome_status text`
- outcome fields for winner, team win, player scored, try count, and `$1`
  return

Rules:

- `nrl_fixed_win_percentage_single_v1` uses the latest current `Match Betting`
  favourite per event and scores it with official 2026 team win percentage.
- `nrl_try_scorer_percentage_single_v1` uses official 2026 player/team
  appearance-to-try percentages and writes `lineup_status =
  'historical_team_roster'` until current official lineups are validated.
- Try-scorer prediction rows do not include price or cash return until
  source-backed player try-scorer prices are captured.
- Public RLS read access is allowed because rows contain app-facing current
  predictions and derived outcomes only.

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

Stores an audit record for on-demand track-race public odds requests from the
Insights screen.

Key fields:

- `id uuid primary key`
- `requested_at timestamptz`
- `source text`
- `source_date date`
- `source_time_zone text`
- `country text`
- `course_slug text`
- `race_code text`
- `race_numbers int[] not null default array[]::int[]`
- `status text`
- `fetched_at timestamptz`
- `payload jsonb`
- `error_message text`

Rules:

- The app may request these rows only through the `request-track-race-odds`
  Edge Function.
- The function fetches public Betcha race-card odds for all races at the
  selected track by default. It can still accept explicit race numbers for
  targeted diagnostics.
- Payloads may include runner number, runner name, fixed-win price, favourite
  flag, MarketMover flag, starter count, race status, and fetched timestamp.
- Payloads may also include the same source-backed favourite context shown for
  Betcha bet-back candidates: implied win percentage, favourite price bucket,
  historical price bucket, starter bucket, default `global_bucket_blend_v1`
  cash average score, blended cash-plus-bonus average, sample size, and signal
  text.
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
- `favourite_place_return numeric`
- `favourite_bonus_credit numeric`
- `favourite_total_value_with_bonus_credit numeric`
- `other_starters_average_fixed_win_price numeric`
- `other_starters_price_count int`
- `other_starters_price_outlier_count int`
- `market_mover_runner_name text`
- `winner_runner_name text`
- `winner_win_dividend numeric`
- `source_status text`
- `missing_favourite boolean`
- `missing_price boolean`
- `missing_result boolean`

Rules:

- Default Race Days reads should request the latest 20 races across all
  AUS/NZ/HK records, interpreted by the app using the `Pacific/Auckland`
  calendar timezone where date conversion is needed.
- Date, country, discipline, and course filters should query Supabase for the
  specific filtered rows instead of filtering a bundled all-data fixture.
- Missing favourite, price, and result states must be explicit.
- Public RLS read access is allowed because this table contains app-facing race
  facts only.

### `historical_multi_backtest_recommendations`

Generated read model for Historical Data model backtests. These rows answer what
the win-percentage multi models would have recommended on historical dates using
only rows before each `source_date`. They are intentionally separate from live
`multi_bet_recommendations` and `ufc_multi_recommendations`.

Key fields:

- `sport text` - `racing` or `ufc`.
- `prediction_model text`
- `source_date date`
- `group_key text`, `group_name text` - all eligible racing rows for racing,
  or one UFC card/event group for UFC.
- `model_data_cutoff_date date` - normally the day before `source_date`.
- `recommendation_type text` - positive or neutral.
- `leg_count int`
- `combined_fixed_win_price numeric`
- `average_win_score numeric`
- outcome fields for `$1` notional multi return and settled/missing-result leg
  counts.
- `raw jsonb`

Rules:

- Rebuilds must use prior-date-only training rows to avoid leaking future
  results into historical recommendations.
- Racing backtests currently cover
  `multi_win_percentage_blend_v1`, `multi_win_percentage_60_plus_v1`, and
  `multi_win_percentage_65_plus_v1`.
- UFC backtests currently cover the UFC favourite price, other fighter price,
  and price-difference win-percentage multi models.
- A winning backtest multi returns the multiplied fixed-win prices for a
  notional `$1`; if any leg loses, return is `$0`.
- Historical Data reads aggregate backtest performance through
  `get_historical_multi_backtest_summary(p_sport, p_prediction_model,
  p_max_leg_rank)`. The RPC rebuilds each multi from eligible legs for the
  selected rank filter before calculating settled count, hit rate, `$1` returns,
  cash average, net return, ROI, and missing-result counts.
- These rows are informational historical analysis only and must not be mixed
  into live Prediction History.

### `historical_multi_backtest_legs`

Generated leg snapshots for historical multi backtests.

Key fields:

- `recommendation_id uuid references historical_multi_backtest_recommendations(id)`
- `leg_index int`
- `source_entry_id text`
- `title text`
- `participant_name text`
- `fixed_win_price numeric`
- optional opponent/other participant price fields for UFC.
- `prediction_rank int`
- `win_score numeric`
- bucket label, bucket win percentage, and bucket sample size from the
  prior-date-only training set.
- settled/missing-result outcome fields.

Rules:

- Preserve `prediction_rank` so later Historical Data views can compare all
  legs, top 3, top 4, or other model-specific slices without regenerating the
  whole backtest.
- Public read access is allowed because rows are generated app-facing historical
  analysis.

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
- `other_starters_average_price_bucket_start numeric`
- `other_starters_average_price_bucket_end numeric`
- `other_starters_average_price_bucket_label text`
- `race_count int`
- `favourite_selections int`
- `wins int`
- `seconds int`
- `thirds int`
- `win_percentage numeric`
- `second_percentage numeric`
- `third_percentage numeric`
- `place_eligible_selections int`
- `place_hits int`
- `place_percentage numeric`
- `total_place_stake numeric`
- `total_place_return numeric`
- `place_net_return numeric`
- `place_average_return_per_dollar numeric`
- `place_roi_percentage numeric`
- `missing_place_return_count int`
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
- Keep favourite place-return cash metrics separate from bonus-credit metrics.
  Place-return aggregates stake `$1` only when the source field size pays a
  place dividend: AU/NZ count 5-7 starters for top 2 and 8+ for top 3, while HK
  counts 4-6 starters for top 2 and 7+ for top 3.
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

### `ufc_fight_entries`

Stored app-facing UFC Historical Data read model. It stores one settled
two-fighter contest from the five-year Kaggle import or a forward result-only
refresh and carries the source confidence needed to keep price-based Insights
honest.

Key fields:

- `source_fight_key text unique`
- `event_date date`
- `location text`
- `fight_url text`
- `red_fighter_name text`
- `blue_fighter_name text`
- `winner_side text`
- `winner_name text`
- `result_status text`
- `finish_type text`
- `red_fixed_win_price numeric`
- `blue_fixed_win_price numeric`
- `price_source text`
- `price_match_status text` - `master_priced`, `daily_exact`,
  `review_candidate`, or `result_only`
- `price_source_count int`
- `price_sample_at timestamptz`
- `favourite_name text`
- `favourite_price numeric`
- `other_fighter_name text`
- `other_fighter_price numeric`
- `price_difference numeric`
- `favourite_won boolean`
- `favourite_win_return numeric`
- `missing_price boolean`
- `match_review_required boolean`
- `included_in_insights boolean`
- `raw jsonb`

Rules:

- `master_priced` rows use Vali Hameed `RedOdds` / `BlueOdds` converted from
  American moneyline to decimal fixed-win price.
- `daily_exact` rows fill missing master prices only when the daily odds file
  has an exact `event_date` plus unordered fighter-pair match.
- Duplicate daily odds rows are reduced deterministically by taking the latest
  row per `source + region`, then the median decimal price per fighter.
- Forward ESPN scoreboard rows are `result_only` settlement rows with
  `price_source = missing`, `missing_price = true`, and
  `included_in_insights = false`. They can settle UFC prediction history but do
  not feed UFC price buckets.
- `result_only` rows may appear in Historical Data but must not feed favourite
  price, other fighter price, price-difference, or `$1` return Insights.
- Equal-price fights and non-standard results are stored, but excluded from
  favourite-return denominators because there is no clear favourite or no
  standard winner.

### `ufc_insight_aggregates`

Stored app-facing UFC aggregate read model. The app reads this table when the
Insights sport toggle is set to UFC.

Key fields:

- `scope_key text unique`
- `scope_type text` - `overall`, `favourite_price_bucket`,
  `other_fighter_price_bucket`, `price_difference_bucket`, or
  `price_match_status`
- `date_from date`
- `date_to date`
- `price_bucket_start numeric`
- `price_bucket_end numeric`
- `price_bucket_label text`
- `fight_count int`
- `priced_fight_count int`
- `result_only_count int`
- `review_candidate_count int`
- `favourite_selections int`
- `favourite_wins int`
- `favourite_win_percentage numeric`
- `total_stake numeric`
- `total_return numeric`
- `net_return numeric`
- `average_return_per_dollar numeric`
- `roi_percentage numeric`
- `missing_price_count int`

Rules:

- Aggregates use source-backed priced fights only.
- Bucket scopes cover favourite price, other fighter price, and the decimal
  difference between the two fixed-win prices.
- Public RLS read access is allowed because these rows contain app-facing
  historical statistics only.

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
- This remains the source for the Predictions tab `$1` return by discipline
  section. The top `Stored model performance` cards use
  `get_prediction_performance_summary` when discipline/rank/signal filters are
  applied.

### `get_prediction_performance_summary(...)`

PostgREST RPC used by the Predictions tab `Stored model performance` cards when
the user filters by discipline, prediction rank, or recommendation signal.

Parameters:

- `p_prediction_model text`
- `p_race_code text default null` - `horse`, `harness`, `greyhound`, or null for
  all disciplines.
- `p_max_rank int default null` - `1`, `2`, `3`, or null for all ranks.
- `p_signal_filter text default 'all'` - `all`, `positive_only`, or
  `neutral_or_better`.

Rules:

- Aggregate directly from `promotion_predictions`, not `prediction_aggregates`,
  so rank and signal filters are available.
- `positive_only` includes only `Positive candidate`.
- `neutral_or_better` includes only `Positive candidate` and
  `Neutral candidate`; it excludes `Small sample` and `Limited history`.
- Use settled predictions as the return denominator.
- Exclude pending, missing-result, missing-runner, and race-not-found rows from
  stake, cash, bonus, net, ROI, and average-return calculations.
- Keep prediction, pending, missing-result, and missing-runner counts visible for
  the selected filter set.
- Include place-cash return fields for place-eligible settled predictions:
  `total_place_stake`, `total_place_return`, `place_net_return`,
  `place_average_return_per_dollar`, `place_roi_percentage`, and
  `missing_place_return_count`. These are derived from the matched
  `race_results` place dividend rather than bonus-bet credit, with a fallback
  to `race_day_entries.favourite_place_return` when the prediction runner is
  the stored favourite and runner-level place dividends are empty.

### `get_prediction_history_summary(...)`

PostgREST RPC used by the Predictions tab `Prediction history` date-range
breakdown.

Parameters:

- `p_prediction_model text`
- `p_from_date date default null`
- `p_to_date date default null`
- `p_country text default null`
- `p_race_code text default null`
- `p_course_slug text default null`

Rules:

- Aggregate directly from all matching `promotion_predictions` rows for the
  selected prediction model and history filters.
- Use the same output metric shape as `get_prediction_performance_summary` so
  the app can format the date-range breakdown consistently with the top summary
  cards.
- Use settled predictions as the return denominator.
- Exclude pending, missing-result, missing-runner, and race-not-found rows from
  stake, cash, bonus, net, ROI, and average-return calculations.
- Keep prediction, pending, missing-result, and missing-runner counts visible for
  the selected history date range.

### `get_prediction_history_entries(...)`

PostgREST RPC used by the Predictions tab itemised history list.

Parameters:

- `p_prediction_model text`
- `p_from_date date default null`
- `p_to_date date default null`
- `p_country text default null`
- `p_race_code text default null`
- `p_course_slug text default null`
- `p_limit int default 50`
- `p_offset int default 0`

Rules:

- Return filtered `promotion_predictions` rows plus a `total_count` value for
  the full matching filter set.
- Apply history ordering before pagination: wins first, then 2nd, then 3rd,
  then other settled losses, then pending rows, then missing/open issue rows.
- Within each outcome group, show the latest advertised starts first.
- Migration `202607310001_prediction_history_entries_rpc.sql` reasserts this
  RPC and triggers a PostgREST schema reload because the app can otherwise show
  fallback table-read history while logging `PGRST202` for a missing RPC
  signature.
- Keep the RPC model-scoped so prediction variation tabs do not mix rows.

### `get_multi_bet_recommendation_summary(...)`

PostgREST RPC used by the Predictions tab to summarise tracked multi bet
recommendations for the selected history filters.

Parameters:

- `p_prediction_model text`
- `p_from_date date default null`
- `p_to_date date default null`
- `p_country text default null`
- `p_race_code text default null`
- `p_course_slug text default null`
- `p_recommendation_type text default null` - `neutral`, `positive`, or null
  for all tracked multi types.
- `p_max_leg_rank int default null` - optional rank cap for models that persist
  ranked legs, used by dedicated percentage multi models.

Rules:

- Aggregate directly from `multi_bet_recommendations`.
- Use settled multi recommendations as the `$1` return denominator.
- A settled win-based multi wins only when every stored leg wins.
- `multi_place_percentage_v1` counts a hit only when every stored or simulated
  leg finishes inside that leg's stored place payout depth.
- Return cash-only metrics: count, settled, pending, win rate, cash average,
  cash net, ROI, and open issues. For `multi_place_percentage_v1`, the same RPC
  shape is reused but `wins`/`win_percentage` represent place-multi hits and
  cash return metrics use stored fixed-place odds where available.
- Do not include bonus-bet value in multi recommendation summaries.
- Country, discipline, and racecourse filters match recommendations that
  include at least one matching leg because a multi can contain mixed legs.
- When `p_max_leg_rank` is set, aggregate from each matching recommendation's
  ranked top-N leg subset rather than the stored parent outcome: include only
  recommendations with at least `p_max_leg_rank` ranked legs, settle the subset
  from leg outcomes, and calculate the hypothetical combined cash return from
  the subset's stored predicted fixed-win prices for win-based multis. For
  `multi_place_percentage_v1`, settle the subset from stored place payout depth
  and calculate the hypothetical combined cash return from the subset's stored
  predicted fixed-place prices.

### `get_multi_bet_recommendation_entries(...)`

PostgREST RPC used by the Predictions tab to show tracked multi bet
recommendation outcomes and their legs.

Parameters:

- `p_prediction_model text`
- `p_from_date date default null`
- `p_to_date date default null`
- `p_country text default null`
- `p_race_code text default null`
- `p_course_slug text default null`
- `p_recommendation_type text default null`
- `p_max_leg_rank int default null`
- `p_limit int default 50`
- `p_offset int default 0`

Rules:

- Return one row per tracked multi recommendation plus ordered leg JSON.
- Include leg-level outcome status and result position so the app can show
  which legs won or lost without recalculating from raw prediction rows.
- Apply ordering before pagination: cash-winning multis first, then settled
  losses, then pending rows, then missing/open issue rows.
- Keep the RPC model-scoped so prediction variation tabs do not mix rows.
- When `p_max_leg_rank` is set, return only the matching ranked leg subset and
  label the parent metrics as the hypothetical top-N outcome for display.
- Prediction History builds Racing percentage multi date/course/discipline
  metadata from `multi_bet_recommendations` and its legs for the selected
  multi-only model, so `multi_place_percentage_v1` does not depend on the
  currently selected single-runner prediction model having matching rows.

### `get_user_locked_multi_recommendation_summary(...)`

Authenticated PostgREST RPC used by Prediction History when a signed-in user
has locked racing percentage multis for the selected model.

Parameters match `get_multi_bet_recommendation_summary(...)`.

Rules:

- Read only `user_locked_multi_recommendations` rows owned by `auth.uid()`.
- Derive leg outcomes at read time by matching each locked JSON leg's
  `raceCardId` and favourite runner number against stored race, runner, and
  result rows.
- Use the same `$1` unit-stake summary shape as tracked multi recommendations.
- Support the same all-legs/top-N rank filters for racing percentage multi
  models.

### `get_user_locked_multi_recommendation_entries(...)`

Authenticated PostgREST RPC used by Prediction History to show the signed-in
user's locked racing percentage multis and derived leg outcomes.

Parameters match `get_multi_bet_recommendation_entries(...)`.

Rules:

- Return one row per user-owned locked multi plus ordered leg JSON in the same
  display shape as tracked multi recommendation history.
- Treat missing race/result data with the same pending/open-issue vocabulary as
  tracked multi recommendations.
- For `multi_place_percentage_v1`, count a leg as successful only when the
  stored finish position is inside the locked leg's place payout depth.

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
