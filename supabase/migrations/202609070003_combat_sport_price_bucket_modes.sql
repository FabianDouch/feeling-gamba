alter table public.ufc_insight_aggregates
  add column if not exists bucket_size numeric not null default 0.50;

alter table public.pfl_insight_aggregates
  add column if not exists bucket_size numeric not null default 0.50;

alter table public.ufc_insight_aggregates
  drop constraint if exists ufc_insight_aggregates_bucket_size_check;

alter table public.ufc_insight_aggregates
  add constraint ufc_insight_aggregates_bucket_size_check
  check (
    bucket_size in (0.25, 0.50)
  );

alter table public.pfl_insight_aggregates
  drop constraint if exists pfl_insight_aggregates_bucket_size_check;

alter table public.pfl_insight_aggregates
  add constraint pfl_insight_aggregates_bucket_size_check
  check (
    bucket_size in (0.25, 0.50)
  );

alter table public.ufc_insight_aggregates
  drop constraint if exists ufc_insight_aggregates_scope_type_check;

alter table public.ufc_insight_aggregates
  add constraint ufc_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'favourite_price_bucket',
      'favourite_price_bucket_plus',
      'other_fighter_price_bucket',
      'other_fighter_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus',
      'price_match_status'
    )
  );

alter table public.pfl_insight_aggregates
  drop constraint if exists pfl_insight_aggregates_scope_type_check;

alter table public.pfl_insight_aggregates
  add constraint pfl_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'favourite_price_bucket',
      'favourite_price_bucket_plus',
      'other_fighter_price_bucket',
      'other_fighter_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus',
      'price_match_status'
    )
  );

create index if not exists ufc_insight_aggregates_bucket_lookup_idx
  on public.ufc_insight_aggregates (
    scope_type,
    bucket_size,
    price_bucket_start
  );

create index if not exists pfl_insight_aggregates_bucket_lookup_idx
  on public.pfl_insight_aggregates (
    scope_type,
    bucket_size,
    price_bucket_start
  );

notify pgrst, 'reload schema';
