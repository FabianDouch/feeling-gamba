-- Extend both stores without changing frozen forecasts or the existing gap cohorts.
do $$
declare target regclass; constraint_row record;
begin
  foreach target in array array['public.football_price_gap_predictions'::regclass,
    'public.football_price_gap_backtests'::regclass] loop
    -- LIKE INCLUDING ALL can preserve source constraint names on the backtest table.
    -- Locate only the original single-column cohort and gap checks by column identity.
    for constraint_row in
      select c.conname from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and c.conkey = array[a.attnum]
      where c.conrelid = target and c.contype = 'c' and a.attname in ('cohort','price_gap')
    loop
      execute format('alter table %s drop constraint %I', target, constraint_row.conname);
    end loop;
    execute format('alter table %s add constraint football_selection_cohort_check
      check (cohort in (''exact_2'',''plus_2'',''opponent_3_50_plus''))', target);
    execute format('alter table %s add constraint football_selection_threshold_check check (
      (cohort = ''opponent_3_50_plus'' and other_price >= 3.50 and price_gap >= 0)
      or (cohort in (''exact_2'',''plus_2'') and price_gap >= 2)
    )', target);
  end loop;
end $$;
notify pgrst, 'reload schema';
