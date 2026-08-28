create table if not exists public.pfl_fight_entries (
  id uuid primary key default gen_random_uuid(),
  source_fight_key text not null unique,
  event_date date not null,
  event_name text,
  location text,
  source_url text,
  fighter_one_name text not null,
  fighter_two_name text not null,
  fighter_one_key text not null,
  fighter_two_key text not null,
  fighter_one_source_id text,
  fighter_two_source_id text,
  winner_side text check (
    winner_side is null
    or winner_side in ('fighter_one', 'fighter_two', 'draw', 'no_contest', 'unknown')
  ),
  winner_name text,
  result_status text not null default 'settled',
  finish_type text,
  finish_details text,
  finish_round numeric,
  total_fight_time_seconds numeric,
  fighter_one_price_american numeric,
  fighter_two_price_american numeric,
  fighter_one_fixed_win_price numeric,
  fighter_two_fixed_win_price numeric,
  price_source text not null default 'missing',
  price_match_status text not null check (
    price_match_status in (
      'bookmakers_review_priced',
      'current_snapshot',
      'review_candidate',
      'result_only'
    )
  ),
  price_match_detail text,
  price_source_count int not null default 0,
  price_sample_at timestamptz,
  price_bookmaker text,
  price_region text,
  favourite_side text check (
    favourite_side is null
    or favourite_side in ('fighter_one', 'fighter_two')
  ),
  favourite_name text,
  favourite_price numeric,
  other_fighter_name text,
  other_fighter_price numeric,
  price_difference numeric,
  favourite_won boolean,
  favourite_win_return numeric,
  missing_price boolean not null default true,
  match_review_required boolean not null default false,
  included_in_insights boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_pfl_fight_entries_updated_at on public.pfl_fight_entries;

create trigger set_pfl_fight_entries_updated_at
  before update on public.pfl_fight_entries
  for each row
  execute function public.set_updated_at();

create index if not exists pfl_fight_entries_event_date_idx
  on public.pfl_fight_entries (event_date desc);

create index if not exists pfl_fight_entries_price_match_status_idx
  on public.pfl_fight_entries (price_match_status, included_in_insights);

create index if not exists pfl_fight_entries_favourite_price_idx
  on public.pfl_fight_entries (favourite_price, event_date desc)
  where included_in_insights;

create table if not exists public.pfl_insight_aggregates (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  scope_type text not null check (
    scope_type in (
      'overall',
      'favourite_price_bucket',
      'other_fighter_price_bucket',
      'price_difference_bucket',
      'price_match_status'
    )
  ),
  date_from date,
  date_to date,
  price_bucket_start numeric,
  price_bucket_end numeric,
  price_bucket_label text,
  fight_count int not null default 0,
  priced_fight_count int not null default 0,
  result_only_count int not null default 0,
  review_candidate_count int not null default 0,
  favourite_selections int not null default 0,
  favourite_wins int not null default 0,
  favourite_win_percentage numeric not null default 0,
  total_stake numeric not null default 0,
  total_return numeric not null default 0,
  net_return numeric not null default 0,
  average_return_per_dollar numeric not null default 0,
  roi_percentage numeric not null default 0,
  missing_price_count int not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_pfl_insight_aggregates_updated_at on public.pfl_insight_aggregates;

create trigger set_pfl_insight_aggregates_updated_at
  before update on public.pfl_insight_aggregates
  for each row
  execute function public.set_updated_at();

create index if not exists pfl_insight_aggregates_lookup_idx
  on public.pfl_insight_aggregates (scope_type, price_bucket_start);

alter table public.pfl_fight_entries enable row level security;
alter table public.pfl_insight_aggregates enable row level security;

drop policy if exists "PFL fight entries are readable" on public.pfl_fight_entries;
drop policy if exists "PFL insight aggregates are readable" on public.pfl_insight_aggregates;

create policy "PFL fight entries are readable" on public.pfl_fight_entries
  for select to anon, authenticated using (true);

create policy "PFL insight aggregates are readable" on public.pfl_insight_aggregates
  for select to anon, authenticated using (true);
