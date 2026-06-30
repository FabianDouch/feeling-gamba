alter table public.track_race_odds_requests
  alter column race_numbers set default array[]::int[];
