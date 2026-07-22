create table if not exists public.user_locked_multi_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null default 'betcha',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  prediction_model text not null,
  recommendation_type text not null check (recommendation_type in ('neutral', 'positive')),
  locked_at timestamptz not null default now(),
  generated_at timestamptz,
  generated_at_nz text,
  leg_count int not null check (leg_count >= 3),
  combined_fixed_win_price numeric(12, 2),
  average_score numeric(12, 4),
  legs jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_date, prediction_model)
);

drop trigger if exists set_user_locked_multi_recommendations_updated_at
  on public.user_locked_multi_recommendations;

create trigger set_user_locked_multi_recommendations_updated_at
  before update on public.user_locked_multi_recommendations
  for each row execute function public.set_updated_at();

create index if not exists user_locked_multi_recommendations_lookup_idx
  on public.user_locked_multi_recommendations (user_id, source_date desc, prediction_model);

alter table public.user_locked_multi_recommendations enable row level security;

drop policy if exists "Users can read own locked multi recommendations"
  on public.user_locked_multi_recommendations;
drop policy if exists "Users can insert own locked multi recommendations"
  on public.user_locked_multi_recommendations;
drop policy if exists "Users can delete own locked multi recommendations"
  on public.user_locked_multi_recommendations;

create policy "Users can read own locked multi recommendations"
  on public.user_locked_multi_recommendations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own locked multi recommendations"
  on public.user_locked_multi_recommendations
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (now() at time zone 'Pacific/Auckland')::time < time '10:00'
  );

create policy "Users can delete own locked multi recommendations"
  on public.user_locked_multi_recommendations
  for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
