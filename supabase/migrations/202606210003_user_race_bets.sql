create table if not exists public.user_race_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null default 'betcha',
  source_race_card_id text not null,
  source_date date,
  source_time_zone text not null default 'Pacific/Auckland',
  race_code text not null check (race_code in ('horse', 'harness', 'greyhound')),
  country text,
  course_name text,
  course_slug text,
  source_track text,
  race_number int,
  race_name text,
  advertised_start timestamptz,
  promotion_kind text,
  promotion_label text,
  signal_label text,
  rank int,
  selected_runner_number int,
  selected_runner_name text,
  selected_fixed_win_price numeric,
  selected_starter_count int,
  outcome_status text not null default 'pending' check (
    outcome_status in ('pending', 'settled', 'race_not_found', 'missing_runner', 'missing_result')
  ),
  outcome_race_id uuid references public.races(id) on delete set null,
  outcome_runner_id uuid references public.runners(id) on delete set null,
  outcome_result_position int,
  outcome_starter_count int,
  outcome_win_return numeric,
  outcome_bonus_credit numeric,
  outcome_total_value_with_bonus_credit numeric,
  outcome_missing_result boolean not null default false,
  outcome_missing_runner boolean not null default false,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_race_card_id)
);

drop trigger if exists set_user_race_bets_updated_at on public.user_race_bets;

create trigger set_user_race_bets_updated_at
  before update on public.user_race_bets
  for each row
  execute function public.set_updated_at();

create index if not exists user_race_bets_user_recorded_idx
  on public.user_race_bets (user_id, recorded_at desc);

create index if not exists user_race_bets_outcome_idx
  on public.user_race_bets (outcome_status, advertised_start, race_code);

alter table public.user_race_bets enable row level security;

drop policy if exists "Users can read own race bets" on public.user_race_bets;
drop policy if exists "Users can insert own race bets" on public.user_race_bets;
drop policy if exists "Users can update own race bets" on public.user_race_bets;
drop policy if exists "Users can delete own race bets" on public.user_race_bets;

create policy "Users can read own race bets"
  on public.user_race_bets
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own race bets"
  on public.user_race_bets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own race bets"
  on public.user_race_bets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own race bets"
  on public.user_race_bets
  for delete
  to authenticated
  using (auth.uid() = user_id);
