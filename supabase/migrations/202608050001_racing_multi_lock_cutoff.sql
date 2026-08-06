alter table public.user_locked_multi_recommendations
  add column if not exists lock_cutoff_at timestamptz;

comment on column public.user_locked_multi_recommendations.lock_cutoff_at is
  'Current racing prediction-window cutoff captured when the user locks a percentage multi.';

drop policy if exists "Users can insert own locked multi recommendations"
  on public.user_locked_multi_recommendations;

create policy "Users can insert own locked multi recommendations"
  on public.user_locked_multi_recommendations
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and lock_cutoff_at is not null
    and now() < lock_cutoff_at
  );

notify pgrst, 'reload schema';
