create table if not exists public.current_prediction_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  generated_at timestamptz not null,
  generated_at_nz text,
  payload jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_date, source_time_zone)
);

alter table public.current_prediction_snapshots enable row level security;

drop policy if exists "Current prediction snapshots are readable" on public.current_prediction_snapshots;

create policy "Current prediction snapshots are readable"
  on public.current_prediction_snapshots
  for select
  to anon, authenticated
  using (true);

create or replace function public.set_current_prediction_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_current_prediction_snapshots_updated_at on public.current_prediction_snapshots;

create trigger set_current_prediction_snapshots_updated_at
  before update on public.current_prediction_snapshots
  for each row
  execute function public.set_current_prediction_snapshots_updated_at();

create index if not exists current_prediction_snapshots_generated_at_idx
  on public.current_prediction_snapshots (generated_at desc);
