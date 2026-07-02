create table if not exists public.user_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  currency text not null default 'NZD' check (currency ~ '^[A-Z]{3}$'),
  initial_balance numeric(12, 2) not null check (initial_balance >= 0),
  current_balance numeric(12, 2) not null check (current_balance >= 0),
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.user_balance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.user_balance_accounts(id) on delete cascade,
  event_type text not null check (event_type in ('initial', 'deposit', 'withdrawal', 'manual_update')),
  amount numeric(12, 2) not null check (amount >= 0),
  balance_delta numeric(12, 2) not null,
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

drop trigger if exists set_user_balance_accounts_updated_at on public.user_balance_accounts;

create trigger set_user_balance_accounts_updated_at
  before update on public.user_balance_accounts
  for each row
  execute function public.set_updated_at();

create index if not exists user_balance_accounts_user_idx
  on public.user_balance_accounts (user_id);

create index if not exists user_balance_events_user_occurred_idx
  on public.user_balance_events (user_id, occurred_at desc);

create index if not exists user_balance_events_account_occurred_idx
  on public.user_balance_events (account_id, occurred_at asc);

alter table public.user_balance_accounts enable row level security;
alter table public.user_balance_events enable row level security;

drop policy if exists "Users can read own balance accounts" on public.user_balance_accounts;
drop policy if exists "Users can read own balance events" on public.user_balance_events;

create policy "Users can read own balance accounts"
  on public.user_balance_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read own balance events"
  on public.user_balance_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.create_user_balance_account(
  p_initial_balance numeric,
  p_currency text default 'NZD',
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns public.user_balance_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.user_balance_accounts;
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'NZD'));
  v_initial_balance numeric(12, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_initial_balance is null then
    raise exception 'Initial balance is required.';
  end if;

  v_initial_balance := round(p_initial_balance::numeric, 2);

  if v_initial_balance < 0 then
    raise exception 'Initial balance must be zero or greater.';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code.';
  end if;

  insert into public.user_balance_accounts (
    user_id,
    currency,
    initial_balance,
    current_balance,
    opened_at
  )
  values (
    auth.uid(),
    v_currency,
    v_initial_balance,
    v_initial_balance,
    coalesce(p_occurred_at, now())
  )
  returning * into v_account;

  insert into public.user_balance_events (
    user_id,
    account_id,
    event_type,
    amount,
    balance_delta,
    balance_after,
    note,
    occurred_at
  )
  values (
    auth.uid(),
    v_account.id,
    'initial',
    v_initial_balance,
    v_initial_balance,
    v_initial_balance,
    nullif(trim(p_note), ''),
    v_account.opened_at
  );

  return v_account;
exception
  when unique_violation then
    raise exception 'Balance account already exists for this user.';
end;
$$;

create or replace function public.add_user_balance_event(
  p_event_type text,
  p_amount numeric default null,
  p_balance_after numeric default null,
  p_note text default null,
  p_occurred_at timestamptz default now()
)
returns public.user_balance_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.user_balance_accounts;
  v_amount numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_delta numeric(12, 2);
  v_event_type text := lower(trim(p_event_type));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_account
  from public.user_balance_accounts
  where user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Set an initial balance before adding balance events.';
  end if;

  if v_event_type not in ('deposit', 'withdrawal', 'manual_update') then
    raise exception 'Unsupported balance event type.';
  end if;

  if v_event_type in ('deposit', 'withdrawal') then
    v_amount := round(coalesce(p_amount, 0)::numeric, 2);

    if v_amount <= 0 then
      raise exception 'Amount must be greater than zero.';
    end if;

    v_delta := case when v_event_type = 'deposit' then v_amount else -v_amount end;
    v_balance_after := round(v_account.current_balance + v_delta, 2);
  else
    v_balance_after := round(coalesce(p_balance_after, -1)::numeric, 2);
    v_delta := round(v_balance_after - v_account.current_balance, 2);
    v_amount := abs(v_delta);
  end if;

  if v_balance_after < 0 then
    raise exception 'Balance cannot be negative.';
  end if;

  if v_event_type = 'manual_update' and v_delta = 0 then
    raise exception 'Manual update must change the balance.';
  end if;

  update public.user_balance_accounts
  set current_balance = v_balance_after
  where id = v_account.id
  returning * into v_account;

  insert into public.user_balance_events (
    user_id,
    account_id,
    event_type,
    amount,
    balance_delta,
    balance_after,
    note,
    occurred_at
  )
  values (
    auth.uid(),
    v_account.id,
    v_event_type,
    v_amount,
    v_delta,
    v_balance_after,
    nullif(trim(p_note), ''),
    coalesce(p_occurred_at, now())
  );

  return v_account;
end;
$$;

revoke execute on function public.create_user_balance_account(numeric, text, text, timestamptz) from public, anon;
revoke execute on function public.add_user_balance_event(text, numeric, numeric, text, timestamptz) from public, anon;
grant execute on function public.create_user_balance_account(numeric, text, text, timestamptz) to authenticated;
grant execute on function public.add_user_balance_event(text, numeric, numeric, text, timestamptz) to authenticated;
