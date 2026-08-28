create table if not exists public.user_locked_current_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  prediction_sport text not null check (prediction_sport in ('racing', 'ufc', 'pfl', 'nrl')),
  prediction_format text not null check (prediction_format in ('singles', 'multis')),
  prediction_type text not null check (prediction_type in ('cash', 'win_percentage', 'placing')),
  prediction_model text not null,
  generated_at timestamptz,
  generated_at_nz text,
  locked_at timestamptz not null default now(),
  lock_cutoff_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_date, prediction_sport, prediction_format, prediction_type, prediction_model)
);

comment on table public.user_locked_current_predictions is
  'Owner-secured current prediction view locks captured before the sport-specific 15-minute finalisation cutoff.';

alter table public.user_locked_current_predictions enable row level security;

drop policy if exists "Users can read their locked current predictions"
  on public.user_locked_current_predictions;
create policy "Users can read their locked current predictions"
  on public.user_locked_current_predictions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their locked current predictions before cutoff"
  on public.user_locked_current_predictions;
create policy "Users can insert their locked current predictions before cutoff"
  on public.user_locked_current_predictions
  for insert
  with check (
    auth.uid() = user_id
    and now() < lock_cutoff_at
  );

drop policy if exists "Users can delete their locked current predictions"
  on public.user_locked_current_predictions;
create policy "Users can delete their locked current predictions"
  on public.user_locked_current_predictions
  for delete
  using (auth.uid() = user_id);

create index if not exists user_locked_current_predictions_lookup_idx
  on public.user_locked_current_predictions (
    user_id,
    source_date desc,
    prediction_sport,
    prediction_format,
    prediction_type,
    prediction_model
  );

notify pgrst, 'reload schema';
