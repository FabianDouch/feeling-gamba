alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_scope_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'price_bucket',
      'price_bucket_plus',
      'other_team_price_bucket',
      'other_team_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus',
      'team',
      'season',
      'season_round',
      'player',
      'player_team'
    )
  );

alter table public.npc_insight_aggregates
  drop constraint if exists npc_insight_aggregates_scope_type_check;

alter table public.npc_insight_aggregates
  add constraint npc_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'price_bucket',
      'price_bucket_plus',
      'other_team_price_bucket',
      'other_team_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus',
      'team',
      'season',
      'season_round',
      'player',
      'player_team'
    )
  );

alter table public.ucl_insight_aggregates
  drop constraint if exists ucl_insight_aggregates_scope_type_check;

alter table public.ucl_insight_aggregates
  add constraint ucl_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'price_bucket',
      'price_bucket_plus',
      'other_team_price_bucket',
      'other_team_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus',
      'team',
      'season',
      'season_round',
      'player',
      'player_team'
    )
  );

notify pgrst, 'reload schema';
