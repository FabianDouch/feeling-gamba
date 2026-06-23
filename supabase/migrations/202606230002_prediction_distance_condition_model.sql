alter table public.race_day_entries
  add column if not exists distance_m int,
  add column if not exists track_condition text;

update public.race_day_entries entries
set
  distance_m = coalesce(entries.distance_m, races.distance_m),
  track_condition = coalesce(entries.track_condition, races.track_condition)
from public.races races
where entries.race_id = races.id
  and (
    entries.distance_m is null
    or entries.track_condition is null
  );

alter table public.insight_aggregates
  add column if not exists distance_band text,
  add column if not exists track_condition_group text;

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
      'track_condition'
    )
  );

create index if not exists insight_aggregates_distance_condition_idx
  on public.insight_aggregates (scope_type, country, race_code, distance_band, track_condition_group);
