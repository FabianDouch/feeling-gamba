delete from public.nrl_single_predictions
where source = 'betcha';

delete from public.nrl_fixed_win_snapshot_results
where source = 'betcha';

delete from public.nrl_market_snapshots
where source = 'betcha';

delete from public.nrl_insight_aggregates
where insight_type = 'fixed_win_single'
  and (
    source = 'betcha'
    or scope_type in ('source', 'source_selection_type', 'source_team')
  );

alter table public.nrl_market_snapshots
  drop constraint if exists nrl_market_snapshots_source_check;

alter table public.nrl_market_snapshots
  add constraint nrl_market_snapshots_source_check
  check (source = 'tab');

alter table public.nrl_fixed_win_snapshot_results
  drop constraint if exists nrl_fixed_win_snapshot_results_source_check;

alter table public.nrl_fixed_win_snapshot_results
  add constraint nrl_fixed_win_snapshot_results_source_check
  check (source = 'tab');

notify pgrst, 'reload schema';
