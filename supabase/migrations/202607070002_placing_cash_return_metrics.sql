alter table public.race_day_entries
  add column if not exists favourite_place_return numeric;

alter table public.insight_aggregates
  add column if not exists total_place_stake numeric not null default 0,
  add column if not exists total_place_return numeric not null default 0,
  add column if not exists place_net_return numeric not null default 0,
  add column if not exists place_average_return_per_dollar numeric not null default 0,
  add column if not exists place_roi_percentage numeric not null default 0,
  add column if not exists missing_place_return_count int not null default 0;

update public.race_day_entries entry
set favourite_place_return = case
  when entry.favourite_result_position is null then null
  when (
    case
      when entry.country = 'HK' and coalesce(entry.starter_count, 0) >= 7 then 3
      when entry.country = 'HK' and coalesce(entry.starter_count, 0) >= 4 then 2
      when coalesce(entry.country, '') <> 'HK' and coalesce(entry.starter_count, 0) >= 8 then 3
      when coalesce(entry.country, '') <> 'HK' and coalesce(entry.starter_count, 0) >= 5 then 2
      else 0
    end
  ) = 0 then null
  when entry.favourite_result_position <= (
    case
      when entry.country = 'HK' and coalesce(entry.starter_count, 0) >= 7 then 3
      when entry.country = 'HK' and coalesce(entry.starter_count, 0) >= 4 then 2
      when coalesce(entry.country, '') <> 'HK' and coalesce(entry.starter_count, 0) >= 8 then 3
      when coalesce(entry.country, '') <> 'HK' and coalesce(entry.starter_count, 0) >= 5 then 2
      else 0
    end
  ) then coalesce(result.place_dividend, result.tote_place_dividend)
  else 0
end
from public.race_results result
where result.race_id = entry.race_id
  and result.runner_id = entry.favourite_runner_id;
