alter table public.user_race_bets
  add column if not exists bookmaker text not null default 'betcha'
    check (bookmaker in ('tab', 'betcha'));

alter table public.user_race_bets
  drop constraint if exists user_race_bets_user_id_source_source_race_card_id_key;

alter table public.user_race_bets
  add constraint user_race_bets_user_bookmaker_source_race_card_key
  unique (user_id, bookmaker, source, source_race_card_id);

create index if not exists user_race_bets_user_bookmaker_recorded_idx
  on public.user_race_bets (user_id, bookmaker, recorded_at desc);
