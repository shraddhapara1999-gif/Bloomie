-- Schedule the reminder sender every 5 minutes. Run ONCE in the Supabase SQL
-- editor of your hosted project (not a migration, because the URL and secret
-- differ per environment). Requires the pg_cron and pg_net extensions
-- (Database → Extensions) and two Vault secrets:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<the same value as the CRON_SECRET function secret>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'bloomie-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Optional housekeeping: keep 90 days of delivery history and error logs.
select cron.schedule('bloomie-prune-logs', '17 3 * * *', $$
  delete from public.reminder_deliveries where created_at < now() - interval '90 days';
  delete from public.client_error_logs where created_at < now() - interval '90 days';
$$);

-- To remove: select cron.unschedule('bloomie-send-reminders');
