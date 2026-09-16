do $$
declare
  aggregate_table text;
  aggregate_tables text[] := array[
    'nrl_insight_aggregates',
    'npc_insight_aggregates',
    'nfl_insight_aggregates',
    'ucl_insight_aggregates',
    'epl_insight_aggregates',
    'laliga_insight_aggregates',
    'bundesliga_insight_aggregates',
    'seriea_insight_aggregates',
    'ligue1_insight_aggregates',
    'mls_insight_aggregates',
    'europaleague_insight_aggregates',
    'eflcup_insight_aggregates',
    'sport_group_insight_aggregates'
  ];
begin
  foreach aggregate_table in array aggregate_tables
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      aggregate_table,
      aggregate_table || '_selection_type_check'
    );

    execute format(
      $sql$
        alter table public.%I
          add constraint %I
          check (
            selection_type is null
            or selection_type in (
              'home',
              'away',
              'favourite',
              'underdog',
              'favourite_home',
              'favourite_away'
            )
          )
      $sql$,
      aggregate_table,
      aggregate_table || '_selection_type_check'
    );
  end loop;
end $$;
