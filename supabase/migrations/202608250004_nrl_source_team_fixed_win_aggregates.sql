alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_scope_type_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_scope_type_check
  check (
    scope_type in (
      'overall',
      'source',
      'selection_type',
      'source_selection_type',
      'team',
      'source_team',
      'season',
      'season_round',
      'player',
      'player_team'
    )
  );

create index if not exists nrl_insight_aggregates_source_team_idx
  on public.nrl_insight_aggregates (insight_type, source, team_source_id);
