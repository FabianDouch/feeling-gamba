create table if not exists public.ufc_single_predictions (
  id uuid primary key default gen_random_uuid(),
  prediction_model text not null,
  source text not null default 'betcha',
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  source_card_id text not null,
  source_card_name text not null,
  source_card_slug text,
  source_event_id text not null,
  source_market_id text,
  advertised_start timestamptz,
  predicted_at timestamptz not null,
  prediction_signature text not null,
  fight_name text,
  predicted_entrant_id text,
  predicted_fighter_name text not null,
  predicted_fixed_win_price numeric(12, 2),
  other_entrant_id text,
  other_fighter_name text,
  other_fighter_fixed_win_price numeric(12, 2),
  price_difference numeric(12, 2),
  prediction_rank int,
  win_score numeric(12, 4),
  signal_label text,
  signal_tone text,
  signal_detail text,
  bucket_label text,
  bucket_win_percentage numeric(12, 4),
  bucket_sample_size int,
  outcome_status text not null default 'pending'
    check (outcome_status in ('pending', 'settled', 'missing_result')),
  outcome_fight_id uuid references public.ufc_fight_entries(id) on delete set null,
  outcome_winner_name text,
  outcome_favourite_won boolean,
  outcome_win_return numeric(12, 2) not null default 0,
  outcome_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_model, source, source_date, source_card_id, source_event_id)
);

drop trigger if exists set_ufc_single_predictions_updated_at
  on public.ufc_single_predictions;
create trigger set_ufc_single_predictions_updated_at
  before update on public.ufc_single_predictions
  for each row execute function public.set_updated_at();

create index if not exists ufc_single_predictions_history_idx
  on public.ufc_single_predictions (prediction_model, source_date desc, source_card_id, outcome_status);

create index if not exists ufc_single_predictions_event_idx
  on public.ufc_single_predictions (source_event_id, advertised_start, outcome_status);

alter table public.ufc_single_predictions enable row level security;

drop policy if exists "UFC single predictions are readable"
  on public.ufc_single_predictions;
create policy "UFC single predictions are readable"
  on public.ufc_single_predictions
  for select
  using (true);

create or replace function public.get_ufc_single_prediction_summary(
  p_prediction_model text,
  p_from_date date,
  p_to_date date
)
returns table (
  prediction_model text,
  date_from date,
  date_to date,
  prediction_count int,
  recommendation_type text,
  settled_count int,
  pending_count int,
  missing_result_count int,
  missing_runner_count int,
  total_stake numeric,
  total_return numeric,
  net_return numeric,
  average_return_per_dollar numeric,
  roi_percentage numeric,
  wins int,
  win_percentage numeric
)
language sql
stable
as $$
  with filtered as (
    select prediction.*
    from public.ufc_single_predictions prediction
    where prediction.prediction_model = p_prediction_model
      and (p_from_date is null or prediction.source_date >= p_from_date)
      and (p_to_date is null or prediction.source_date <= p_to_date)
  ),
  summary as (
    select
      min(source_date) as date_from,
      max(source_date) as date_to,
      count(*)::int as prediction_count,
      count(*) filter (where outcome_status = 'settled')::int as settled_count,
      count(*) filter (where outcome_status = 'pending')::int as pending_count,
      count(*) filter (where outcome_status = 'missing_result')::int as missing_result_count,
      count(*) filter (where outcome_status = 'settled')::numeric as total_stake,
      coalesce(sum(outcome_win_return) filter (where outcome_status = 'settled'), 0)::numeric as total_return,
      count(*) filter (where outcome_status = 'settled' and outcome_win_return > 0)::int as wins
    from filtered
  )
  select
    p_prediction_model as prediction_model,
    summary.date_from,
    summary.date_to,
    summary.prediction_count,
    null::text as recommendation_type,
    summary.settled_count,
    summary.pending_count,
    summary.missing_result_count,
    0::int as missing_runner_count,
    summary.total_stake,
    summary.total_return,
    summary.total_return - summary.total_stake as net_return,
    case when summary.total_stake > 0 then round(summary.total_return / summary.total_stake, 4) else 0 end,
    case when summary.total_stake > 0 then round(((summary.total_return - summary.total_stake) / summary.total_stake) * 100, 2) else 0 end,
    summary.wins,
    case when summary.settled_count > 0 then round((summary.wins::numeric / summary.settled_count::numeric) * 100, 2) else 0 end
  from summary;
$$;

grant execute on function public.get_ufc_single_prediction_summary(text, date, date)
  to anon, authenticated;

create or replace function public.get_ufc_single_prediction_entries(
  p_prediction_model text,
  p_from_date date,
  p_to_date date,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  prediction_model text,
  source_date date,
  source_card_name text,
  source_event_id text,
  source_market_id text,
  advertised_start timestamptz,
  predicted_at timestamptz,
  fight_name text,
  predicted_fighter_name text,
  predicted_fixed_win_price numeric,
  other_fighter_name text,
  other_fighter_fixed_win_price numeric,
  price_difference numeric,
  prediction_rank int,
  win_score numeric,
  signal_label text,
  signal_tone text,
  bucket_label text,
  bucket_win_percentage numeric,
  bucket_sample_size int,
  outcome_status text,
  outcome_winner_name text,
  outcome_favourite_won boolean,
  outcome_win_return numeric,
  total_count int
)
language sql
stable
as $$
  with filtered as (
    select prediction.*
    from public.ufc_single_predictions prediction
    where prediction.prediction_model = p_prediction_model
      and (p_from_date is null or prediction.source_date >= p_from_date)
      and (p_to_date is null or prediction.source_date <= p_to_date)
  ),
  counted as (
    select filtered.*, count(*) over ()::int as total_count
    from filtered
  )
  select
    counted.id,
    counted.prediction_model,
    counted.source_date,
    counted.source_card_name,
    counted.source_event_id,
    counted.source_market_id,
    counted.advertised_start,
    counted.predicted_at,
    counted.fight_name,
    counted.predicted_fighter_name,
    counted.predicted_fixed_win_price,
    counted.other_fighter_name,
    counted.other_fighter_fixed_win_price,
    counted.price_difference,
    counted.prediction_rank,
    counted.win_score,
    counted.signal_label,
    counted.signal_tone,
    counted.bucket_label,
    counted.bucket_win_percentage,
    counted.bucket_sample_size,
    counted.outcome_status,
    counted.outcome_winner_name,
    counted.outcome_favourite_won,
    counted.outcome_win_return,
    counted.total_count
  from counted
  order by
    case counted.outcome_status
      when 'settled' then 0
      when 'missing_result' then 1
      else 2
    end,
    counted.source_date desc,
    counted.advertised_start asc nulls last,
    counted.prediction_rank asc nulls last
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_ufc_single_prediction_entries(text, date, date, int, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
