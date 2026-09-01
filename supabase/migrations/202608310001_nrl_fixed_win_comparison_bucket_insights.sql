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
      'price_difference_bucket'
    )
  );

create index if not exists nrl_insight_aggregates_fixed_win_comparison_bucket_idx
  on public.nrl_insight_aggregates (
    insight_type,
    scope_type,
    price_bucket_start
  )
  where scope_type in (
    'other_team_price_bucket',
    'price_difference_bucket'
  );

notify pgrst, 'reload schema';
