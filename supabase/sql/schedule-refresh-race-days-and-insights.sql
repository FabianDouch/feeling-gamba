-- Schedules the hosted weekly race-day + insights refresh.
-- Run this in the Supabase SQL editor after:
-- 1. Deploying refresh-race-days-and-insights.
-- 2. Setting the same RACE_DAY_REFRESH_ADMIN_TOKEN as an Edge Function secret.
-- 3. Creating the Vault secret below with that token value.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- Create or rotate the required Vault secret separately:
-- select vault.create_secret('<race-day-refresh-admin-token>', 'race_day_refresh_admin_token');

select cron.unschedule('refresh-race-days-and-insights-weekly')
where exists (
  select 1
  from cron.job
  where jobname = 'refresh-race-days-and-insights-weekly'
);

select cron.schedule(
  'refresh-race-days-and-insights-weekly',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://parobgrsaxrmnvrkagyb.supabase.co/functions/v1/refresh-race-days-and-insights',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-refresh-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'race_day_refresh_admin_token'
      )
    ),
    body := jsonb_build_object(
      'lookbackDays', 7,
      'rebuildInsights', true
    )
  ) as request_id;
  $$
);
