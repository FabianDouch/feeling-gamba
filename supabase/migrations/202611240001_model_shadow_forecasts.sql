-- Service-only research records preserve source quotes separately from both probability estimates.
create table public.model_shadow_forecasts (
  id uuid primary key default gen_random_uuid(),
  model text not null check (model in ('football_draw_v1', 'thoroughbred_favourite_v1')),
  source_group text not null,
  source_event_id text not null,
  source_identity jsonb not null,
  event_at timestamptz not null,
  captured_at timestamptz not null,
  forecast_at timestamptz not null,
  source_prices jsonb not null,
  baseline jsonb not null,
  prediction jsonb,
  training jsonb not null,
  outcome_status text not null default 'pending' check (outcome_status in ('pending', 'settled', 'excluded')),
  actual text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (model, source_group, source_event_id),
  check (captured_at <= forecast_at and forecast_at < event_at),
  check (event_at <= forecast_at + interval '24 hours'),
  check (captured_at >= forecast_at - case model when 'football_draw_v1' then interval '1 hour' else interval '24 hours' end),
  check ((outcome_status = 'settled' and actual is not null and settled_at is not null and
    ((model = 'football_draw_v1' and actual in ('home', 'draw', 'away')) or
     (model = 'thoroughbred_favourite_v1' and actual in ('win', 'loss')))) or
    (outcome_status <> 'settled' and actual is null and settled_at is null))
);

alter table public.model_shadow_forecasts enable row level security;
revoke all on public.model_shadow_forecasts from public, anon, authenticated;
grant select, insert, update on public.model_shadow_forecasts to service_role;

-- Prevent historical inserts and modifications to the original forecast during reconciliation.
create function public.guard_model_shadow_forecast() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.event_at <= clock_timestamp() or new.forecast_at > clock_timestamp()
      or new.forecast_at < clock_timestamp() - interval '15 minutes' or new.outcome_status <> 'pending' then
      raise exception 'Shadow trial requires a fresh pre-event forecast';
    end if;
  elsif (to_jsonb(new) - array['outcome_status', 'actual', 'settled_at'])
    is distinct from (to_jsonb(old) - array['outcome_status', 'actual', 'settled_at']) then
    raise exception 'Shadow trial forecast inputs are immutable';
  end if;
  return new;
end;
$$;

create trigger guard_model_shadow_forecast before insert or update on public.model_shadow_forecasts
for each row execute function public.guard_model_shadow_forecast();
