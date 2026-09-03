-- Keep team-sport fixed-win market capture to one canonical pre-kickoff row per source event.

with ranked as (
  select
    id,
    row_number() over (
      partition by source, source_event_id
      order by snapshot_at desc, id desc
    ) as duplicate_rank
  from public.nrl_market_snapshots
)
delete from public.nrl_market_snapshots snapshots
using ranked
where snapshots.id = ranked.id
  and ranked.duplicate_rank > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by source, source_event_id
      order by snapshot_at desc, id desc
    ) as duplicate_rank
  from public.npc_market_snapshots
)
delete from public.npc_market_snapshots snapshots
using ranked
where snapshots.id = ranked.id
  and ranked.duplicate_rank > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by source, source_event_id
      order by snapshot_at desc, id desc
    ) as duplicate_rank
  from public.nrl_fixed_win_snapshot_results
)
delete from public.nrl_fixed_win_snapshot_results results
using ranked
where results.id = ranked.id
  and ranked.duplicate_rank > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by source, source_event_id
      order by snapshot_at desc, id desc
    ) as duplicate_rank
  from public.npc_fixed_win_snapshot_results
)
delete from public.npc_fixed_win_snapshot_results results
using ranked
where results.id = ranked.id
  and ranked.duplicate_rank > 1;

update public.nrl_market_snapshots
set source_snapshot_key = source || ':' || source_event_id;

update public.npc_market_snapshots
set source_snapshot_key = source || ':' || source_event_id;

update public.nrl_fixed_win_snapshot_results
set source_snapshot_key = source || ':' || source_event_id;

update public.npc_fixed_win_snapshot_results
set source_snapshot_key = source || ':' || source_event_id;

create unique index if not exists nrl_market_snapshots_source_event_unique_idx
  on public.nrl_market_snapshots (source, source_event_id);

create unique index if not exists npc_market_snapshots_source_event_unique_idx
  on public.npc_market_snapshots (source, source_event_id);

create unique index if not exists nrl_fixed_win_snapshot_results_source_event_unique_idx
  on public.nrl_fixed_win_snapshot_results (source, source_event_id);

create unique index if not exists npc_fixed_win_snapshot_results_source_event_unique_idx
  on public.npc_fixed_win_snapshot_results (source, source_event_id);
