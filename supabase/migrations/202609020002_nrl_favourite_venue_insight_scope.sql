alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_scope_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'selection_type',
      'source',
      'source_selection_type',
      'team',
      'season',
      'season_round',
      'player',
      'player_team',
      'price_bucket',
      'other_team_price_bucket',
      'price_difference_bucket',
      'favourite_venue'
    )
  );

create index if not exists nrl_insight_aggregates_favourite_venue_idx
  on public.nrl_insight_aggregates (
    insight_type,
    selection_type
  )
  where scope_type = 'favourite_venue';

notify pgrst, 'reload schema';
