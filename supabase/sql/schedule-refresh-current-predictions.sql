-- Schedule a daily pre-race current prediction refresh through Supabase Cron.
-- Replace <project-ref> and <anon-or-service-token> before applying.

select cron.unschedule('refresh-current-predictions-intraday')
where exists (
  select 1
  from cron.job
  where jobname = 'refresh-current-predictions-intraday'
);

select cron.unschedule('refresh-current-predictions-morning')
where exists (
  select 1
  from cron.job
  where jobname = 'refresh-current-predictions-morning'
);

select cron.schedule(
  'refresh-current-predictions-morning',
  '35 17,18 * * *',
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
