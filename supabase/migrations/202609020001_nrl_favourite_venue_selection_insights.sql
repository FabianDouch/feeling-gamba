alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_selection_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_selection_type_check
  check (
    selection_type is null
    or selection_type in (
      'home',
      'away',
      'favourite',
      'favourite_home',
      'favourite_away'
    )
  );

notify pgrst, 'reload schema';
