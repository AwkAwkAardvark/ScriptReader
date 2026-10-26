-- Cover the remaining foreign keys; the revision composite unique index already covers production_id.
create index reader_days_production on public.reader_browser_days(production_id);
create index reader_productions_revision on public.reader_productions(id, active_revision);
drop index public.reader_revisions_production;

-- Supabase includes pg_cron. Embedded local PostgreSQL falls back to API-time cleanup.
do $setup$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule('reader_retention', '*/5 * * * *', $job$
      delete from public.reader_rates where window_start < now() - interval '2 days';
      delete from public.reader_browser_days where day < ((now() at time zone 'Asia/Seoul')::date - 1);
      delete from cron.job_run_details where jobid in
        (select jobid from cron.job where jobname = 'reader_retention')
        and end_time < now() - interval '2 days';
    $job$);
  end if;
end;
$setup$;
