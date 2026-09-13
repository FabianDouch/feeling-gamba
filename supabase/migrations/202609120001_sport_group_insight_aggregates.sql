create table if not exists public.sport_group_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  sport_group text not null check (
    sport_group in (
      'football',
      'rugby_league',
      'rugby_union'
    )
  ),
  scope_key text not null unique,
  insight_type text not null check (
    insight_type in (
      'fixed_win_single',
      'fixed_draw_single',
      'half_time_full_time_double',
      'same_game_multi_percentage',
      'try_scorer_percentage',
      'goal_scorer_percentage'
    )
  ),
  scope_type text not null check (
    scope_type in (
      'overall',
      'selection_type',
      'favourite_venue',
      'team',
      'player',
      'player_team',
      'price_bucket',
      'price_bucket_plus',
      'other_team_price_bucket',
      'other_team_price_bucket_plus',
      'price_difference_bucket',
      'price_difference_bucket_plus'
    )
  ),
  source text,
  included_leagues text[] not null default '{}'::text[],
  source_league_count int not null default 0,
  selection_type text check (
    selection_type is null
    or selection_type in (
      'home',
      'away',
      'favourite',
      'favourite_home',
      'favourite_away'
    )
  ),
  team_source_id text,
  team_name text,
  player_source_id text,
  player_name text,
  price_bucket_label text,
  price_bucket_start numeric,
  price_bucket_end numeric,
  bucket_size numeric not null default 0.50 check (
    bucket_size in (0.25, 0.50)
  ),
  date_from date,
  date_to date,
  event_count int not null default 0,
  selection_count int not null default 0,
  win_count int not null default 0,
  win_percentage numeric not null default 0,
  total_tries int not null default 0,
  total_goals int not null default 0,
  total_stake numeric not null default 0,
  total_return numeric not null default 0,
  net_return numeric not null default 0,
  average_return_per_dollar numeric not null default 0,
  roi_percentage numeric not null default 0,
  missing_price_count int not null default 0,
  pending_count int not null default 0,
  unmatched_count int not null default 0,
  missing_result_count int not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_sport_group_insight_aggregates_updated_at
  on public.sport_group_insight_aggregates;

create trigger set_sport_group_insight_aggregates_updated_at
  before update on public.sport_group_insight_aggregates
  for each row
  execute function public.set_updated_at();

create index if not exists sport_group_insight_aggregates_lookup_idx
  on public.sport_group_insight_aggregates (
    sport_group,
    insight_type,
    scope_type,
    selection_type,
    bucket_size,
    price_bucket_start
  );

create index if not exists sport_group_insight_aggregates_team_idx
  on public.sport_group_insight_aggregates (sport_group, insight_type, team_name);

create index if not exists sport_group_insight_aggregates_player_idx
  on public.sport_group_insight_aggregates (sport_group, insight_type, player_name);

alter table public.sport_group_insight_aggregates enable row level security;

drop policy if exists "Sport group insight aggregates are readable"
  on public.sport_group_insight_aggregates;

create policy "Sport group insight aggregates are readable"
  on public.sport_group_insight_aggregates
  for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
