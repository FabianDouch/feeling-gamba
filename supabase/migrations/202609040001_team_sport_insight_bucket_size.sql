alter table public.nrl_insight_aggregates
  add column if not exists bucket_size numeric not null default 0.50;

alter table public.npc_insight_aggregates
  add column if not exists bucket_size numeric not null default 0.50;

alter table public.nrl_insight_aggregates
  drop constraint if exists nrl_insight_aggregates_bucket_size_check;

alter table public.nrl_insight_aggregates
  add constraint nrl_insight_aggregates_bucket_size_check
  check (
    bucket_size in (0.25, 0.50)
  );

alter table public.npc_insight_aggregates
  drop constraint if exists npc_insight_aggregates_bucket_size_check;

alter table public.npc_insight_aggregates
  add constraint npc_insight_aggregates_bucket_size_check
  check (
    bucket_size in (0.25, 0.50)
  );

create index if not exists nrl_insight_aggregates_bucket_lookup_idx
  on public.nrl_insight_aggregates (
    insight_type,
    scope_type,
    bucket_size,
    selection_type,
    price_bucket_start
  );

create index if not exists npc_insight_aggregates_bucket_lookup_idx
  on public.npc_insight_aggregates (
    insight_type,
    scope_type,
    bucket_size,
    selection_type,
    price_bucket_start
  );

notify pgrst, 'reload schema';
