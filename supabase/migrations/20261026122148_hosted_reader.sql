-- Only the local publisher and trusted server may access these objects.
create table public.reader_productions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title text not null check (length(btrim(title)) between 1 and 200),
  active_revision uuid
);
create table public.reader_revisions (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.reader_productions(id),
  payload jsonb not null check (jsonb_typeof(payload->'script'->'records') = 'array' and jsonb_array_length(payload->'script'->'records') > 0 and jsonb_typeof(payload->'script'->'characters') = 'array' and jsonb_array_length(payload->'script'->'characters') > 0 and jsonb_typeof(payload->'media') = 'object'),
  created_at timestamptz not null default now(),
  unique (production_id, id)
);
alter table public.reader_productions add constraint reader_active_revision foreign key (id, active_revision) references public.reader_revisions(production_id, id);
create table public.reader_browser_days (
  browser_hash text not null,
  production_id uuid not null references public.reader_productions(id),
  day date not null,
  tags text[] not null default '{}' check (cardinality(tags) <= 5),
  primary key (browser_hash, production_id, day)
);
create table public.reader_rates (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (bucket, window_start)
);
create index reader_days_expiry on public.reader_browser_days(day);
create index reader_rates_expiry on public.reader_rates(window_start);
create index reader_revisions_production on public.reader_revisions(production_id);
alter table public.reader_productions enable row level security;
alter table public.reader_revisions enable row level security;
alter table public.reader_browser_days enable row level security;
alter table public.reader_rates enable row level security;
revoke all on public.reader_productions, public.reader_revisions, public.reader_browser_days, public.reader_rates from public, anon, authenticated;
grant select, insert, update on public.reader_productions to service_role;
grant select, insert on public.reader_revisions to service_role;
grant select, insert, update, delete on public.reader_browser_days, public.reader_rates to service_role;

create function public.reader_publish(p_slug text, p_title text, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  production uuid;
  revision uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or
     jsonb_typeof(p_payload->'script'->'records') is distinct from 'array' or
     jsonb_typeof(p_payload->'script'->'characters') is distinct from 'array' or
     jsonb_typeof(p_payload->'media') is distinct from 'object' then
    raise exception 'Invalid publication payload';
  end if;
  insert into public.reader_productions(slug, title) values(p_slug, p_title)
    on conflict (slug) do update set title = excluded.title returning id into production;
  insert into public.reader_revisions(production_id, payload) values(production, p_payload) returning id into revision;
  update public.reader_productions set active_revision = revision where id = production;
  return revision;
end;
$$;

create function public.reader_fetch(
  p_slug text, p_browser text, p_ip text, p_new_browser boolean,
  p_character text default null, p_revision uuid default null,
  p_browser_limit integer default 60, p_ip_limit integer default 1200,
  p_identity_limit integer default 120, p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  minute_start timestamptz := date_trunc('minute', p_now);
  today date := (p_now at time zone 'Asia/Seoul')::date;
  reset_at timestamptz := (today + 1)::timestamp at time zone 'Asia/Seoul';
  production public.reader_productions%rowtype;
  revision public.reader_revisions%rowtype;
  choices text[];
  count_hits integer;
  bucket_name text;
  bucket_limit integer;
  meta jsonb;
begin
  if p_browser !~ '^[a-f0-9]{64}$' or p_ip !~ '^[a-f0-9]{64}$' or
     p_browser is null or p_ip is null or p_now is null or
     least(p_browser_limit, p_ip_limit, p_identity_limit) < 1 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  delete from public.reader_rates where window_start < p_now - interval '2 days';
  delete from public.reader_browser_days where day < today - 1;
  -- Aggregate buckets are locked by UPSERT; rejected calls remain rejected until rollover.
  for bucket_name, bucket_limit in
    select 'b:' || p_browser, p_browser_limit union all
    select 'ip:' || p_ip, p_ip_limit union all
    select 'new:' || p_ip, p_identity_limit where p_new_browser
  loop
    insert into public.reader_rates(bucket, window_start, hits) values(bucket_name, minute_start, 1)
      on conflict (bucket, window_start) do update set hits = public.reader_rates.hits + 1
      returning hits into count_hits;
    if count_hits > bucket_limit then
      return jsonb_build_object('error', 'rate', 'retryAfter', greatest(1, ceil(extract(epoch from minute_start + interval '1 minute' - p_now)))::integer);
    end if;
  end loop;
  select * into production from public.reader_productions where slug = p_slug;
  if not found or production.active_revision is null then return jsonb_build_object('error', 'not_found'); end if;
  select * into revision from public.reader_revisions where id = production.active_revision;
  if p_character is not null then
    if p_revision is distinct from revision.id then return jsonb_build_object('error', 'revision_changed'); end if;
    if not exists(select 1 from jsonb_array_elements(revision.payload->'script'->'characters') c where c->>'tag' = p_character) then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    insert into public.reader_browser_days(browser_hash, production_id, day) values(p_browser, production.id, today)
      on conflict do nothing;
    -- One lock covers count-and-admit, including concurrent sixth-character attempts.
    select tags into choices from public.reader_browser_days
      where browser_hash = p_browser and production_id = production.id and day = today for update;
    if not (p_character = any(choices)) then
      if cardinality(choices) >= 5 then return jsonb_build_object('error', 'quota', 'resetAt', reset_at); end if;
      choices := array_append(choices, p_character);
      update public.reader_browser_days set tags = choices
        where browser_hash = p_browser and production_id = production.id and day = today;
    end if;
  else
    select tags into choices from public.reader_browser_days
      where browser_hash = p_browser and production_id = production.id and day = today;
  end if;
  meta := jsonb_build_object('slug', production.slug, 'title', production.title, 'revision', revision.id,
    'characters', revision.payload->'script'->'characters', 'used', coalesce(cardinality(choices), 0), 'resetAt', reset_at);
  if p_character is null then return jsonb_build_object('production', meta); end if;
  return jsonb_build_object('production', meta, 'payload', revision.payload);
end;
$$;
revoke all on function public.reader_publish(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reader_fetch(text, text, text, boolean, text, uuid, integer, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.reader_publish(text, text, jsonb) to service_role;
grant execute on function public.reader_fetch(text, text, text, boolean, text, uuid, integer, integer, integer, timestamptz) to service_role;
-- The dashboard-created event trigger stays enabled; its helper isn't a public RPC.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
