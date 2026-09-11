alter table public.ucl_insight_aggregates
  drop constraint if exists ucl_insight_aggregates_insight_type_check;

alter table public.ucl_insight_aggregates
  add constraint ucl_insight_aggregates_insight_type_check
  check (
    insight_type in (
      'fixed_win_single',
      'fixed_draw_single',
      'goal_scorer_percentage',
      'same_game_multi_percentage'
    )
  );

alter table public.epl_insight_aggregates
  drop constraint if exists epl_insight_aggregates_insight_type_check;

alter table public.epl_insight_aggregates
  add constraint epl_insight_aggregates_insight_type_check
  check (
    insight_type in (
      'fixed_win_single',
      'fixed_draw_single',
      'half_time_full_time_double',
      'goal_scorer_percentage',
      'same_game_multi_percentage'
    )
  );

notify pgrst, 'reload schema';
