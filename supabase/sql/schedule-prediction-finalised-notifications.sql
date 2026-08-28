-- Schedule finalised prediction notification checks through Supabase Cron.
-- The function is idempotent, so repeated checks will not duplicate deliveries.
-- Run this in the Supabase SQL editor after:
-- 1. Deploying send-prediction-finalised-notifications.
-- 2. Setting the same PREDICTION_NOTIFICATION_ADMIN_TOKEN as an Edge Function secret.
-- 3. Creating the Vault secret below with that token value.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- Create or rotate the required Vault secret separately:
-- select vault.create_secret('<prediction-notification-admin-token>', 'prediction_notification_admin_token');

select cron.unschedule('send-prediction-finalised-notifications')
where exists (
  select 1
  from cron.job
  where jobname = 'send-prediction-finalised-notifications'
);

select cron.schedule(
  'send-prediction-finalised-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://parobgrsaxrmnvrkagyb.supabase.co/functions/v1/send-prediction-finalised-notifications',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-refresh-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'prediction_notification_admin_token'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
