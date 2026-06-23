-- Schedule intraday current prediction refreshes through Supabase Cron.
-- Replace <project-ref> and <anon-or-service-token> before applying.

select cron.unschedule('refresh-current-predictions-intraday')
where exists (
  select 1
  from cron.job
  where jobname = 'refresh-current-predictions-intraday'
);

select cron.schedule(
  'refresh-current-predictions-intraday',
  '*/15 22-10 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/refresh-current-predictions',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <anon-or-service-token>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
