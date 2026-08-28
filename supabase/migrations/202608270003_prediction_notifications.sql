create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  device_id text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_push_token),
  unique (user_id, expo_push_token)
);

comment on table public.user_push_tokens is
  'Owner-secured Expo push tokens used for mobile prediction-finalised notifications.';

create table if not exists public.user_favourite_prediction_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sport text not null check (sport in ('racing', 'ufc', 'pfl', 'nrl')),
  prediction_format text not null check (prediction_format in ('singles', 'multis')),
  prediction_type text not null,
  model_key text not null,
  enabled boolean not null default true,
  notify_on_finalised boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sport, prediction_format, prediction_type, model_key)
);

comment on table public.user_favourite_prediction_models is
  'Owner-secured model notification preferences keyed by the prediction screen hierarchy.';

create table if not exists public.prediction_notification_events (
  id uuid primary key default gen_random_uuid(),
  source_date date not null,
  source_time_zone text not null default 'Pacific/Auckland',
  sport text not null check (sport in ('racing', 'ufc', 'pfl', 'nrl')),
  prediction_format text not null check (prediction_format in ('singles', 'multis')),
  prediction_type text not null,
  model_key text not null,
  event_type text not null default 'prediction_finalised',
  prediction_key text not null default '',
  finalises_at timestamptz not null,
  active_prediction_count integer not null check (active_prediction_count > 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (
    event_type,
    source_date,
    sport,
    prediction_format,
    prediction_type,
    model_key,
    prediction_key
  )
);

comment on table public.prediction_notification_events is
  'Idempotency ledger for finalised prediction-model notification events.';

create table if not exists public.user_prediction_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token_id uuid not null references public.user_push_tokens(id) on delete cascade,
  event_id uuid not null references public.prediction_notification_events(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  expo_ticket_id text,
  expo_receipt_status text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, push_token_id, event_id)
);

comment on table public.user_prediction_notifications is
  'Per-user push delivery attempts for finalised model notifications.';

drop trigger if exists set_user_push_tokens_updated_at on public.user_push_tokens;
create trigger set_user_push_tokens_updated_at
  before update on public.user_push_tokens
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_user_favourite_prediction_models_updated_at
  on public.user_favourite_prediction_models;
create trigger set_user_favourite_prediction_models_updated_at
  before update on public.user_favourite_prediction_models
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_user_prediction_notifications_updated_at
  on public.user_prediction_notifications;
create trigger set_user_prediction_notifications_updated_at
  before update on public.user_prediction_notifications
  for each row
  execute function public.set_updated_at();

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id, enabled, last_seen_at desc);

create index if not exists user_favourite_prediction_models_lookup_idx
  on public.user_favourite_prediction_models (
    user_id,
    enabled,
    notify_on_finalised,
    sport,
    prediction_format,
    prediction_type,
    model_key
  );

create index if not exists prediction_notification_events_lookup_idx
  on public.prediction_notification_events (
    source_date desc,
    sport,
    prediction_format,
    prediction_type,
    model_key
  );

create index if not exists user_prediction_notifications_event_idx
  on public.user_prediction_notifications (event_id, status);

alter table public.user_push_tokens enable row level security;
alter table public.user_favourite_prediction_models enable row level security;
alter table public.prediction_notification_events enable row level security;
alter table public.user_prediction_notifications enable row level security;

drop policy if exists "Users can read own push tokens" on public.user_push_tokens;
drop policy if exists "Users can insert own push tokens" on public.user_push_tokens;
drop policy if exists "Users can update own push tokens" on public.user_push_tokens;
drop policy if exists "Users can delete own push tokens" on public.user_push_tokens;

create policy "Users can read own push tokens"
  on public.user_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own push tokens"
  on public.user_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own push tokens"
  on public.user_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own push tokens"
  on public.user_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own favourite prediction models"
  on public.user_favourite_prediction_models;
drop policy if exists "Users can insert own favourite prediction models"
  on public.user_favourite_prediction_models;
drop policy if exists "Users can update own favourite prediction models"
  on public.user_favourite_prediction_models;
drop policy if exists "Users can delete own favourite prediction models"
  on public.user_favourite_prediction_models;

create policy "Users can read own favourite prediction models"
  on public.user_favourite_prediction_models
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own favourite prediction models"
  on public.user_favourite_prediction_models
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own favourite prediction models"
  on public.user_favourite_prediction_models
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own favourite prediction models"
  on public.user_favourite_prediction_models
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own prediction notification deliveries"
  on public.user_prediction_notifications;

create policy "Users can read own prediction notification deliveries"
  on public.user_prediction_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
