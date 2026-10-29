-- Production administration remains server-only.
alter table public.reader_productions
  add column default_before integer not null default 2 check (default_before between 0 and 5),
  add column default_after integer not null default 1 check (default_after between 0 and 5),
  add column management_version uuid not null default gen_random_uuid();
create function public.reader_production_version() returns trigger language plpgsql set search_path = '' as $$
begin new.management_version := gen_random_uuid(); return new; end; $$;
revoke all on function public.reader_production_version() from public, anon, authenticated;
create trigger reader_production_version before update on public.reader_productions
  for each row execute function public.reader_production_version();

create table public.reader_site_settings (
  singleton boolean primary key default true check (singleton),
  home_slug text references public.reader_productions(slug),
  version uuid not null default gen_random_uuid()
);
alter table public.reader_site_settings enable row level security;
revoke all on public.reader_site_settings from public, anon, authenticated;
grant select, update on public.reader_site_settings to service_role;
insert into public.reader_site_settings(singleton, home_slug)
  values(true, (select slug from public.reader_productions where slug='aladdin' and active_revision is not null));

create function public.reader_home() returns jsonb language sql security invoker set search_path = '' as $$
 select jsonb_build_object('destination',case when home_slug is null then '/import' else '/p/' || home_slug end)
 from public.reader_site_settings where singleton;
$$;
revoke all on function public.reader_home() from public, anon, authenticated;
grant execute on function public.reader_home() to service_role;

create function public.reader_manage_productions(p_action text, p_actor uuid, p_slug text default null,
  p_expected uuid default null, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 item public.reader_productions%rowtype;
 site public.reader_site_settings%rowtype;
 revision uuid;
 result jsonb;
begin
 -- Serialize permissions with account revocations before reading membership.
 perform 1 from public.reader_admin_state where singleton for update;
 if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved') then
  return jsonb_build_object('error','forbidden');
 end if;
 if p_action='list' then
  select jsonb_build_object('productions',coalesce(jsonb_agg(jsonb_build_object(
   'slug',p.slug,'title',p.title,'revision',p.active_revision,'version',p.management_version,
   'before',p.default_before,'after',p.default_after,'publishedAt',r.created_at,
   'mediaCount',coalesce((select count(*) from jsonb_object_keys(r.payload->'media')),0)) order by r.created_at desc nulls last,p.title),'[]'::jsonb))
   into result from public.reader_productions p left join public.reader_revisions r on r.id=p.active_revision;
  select * into site from public.reader_site_settings where singleton;
  return result || jsonb_build_object('home',jsonb_build_object('slug',site.home_slug,'version',site.version));
 elsif p_action='home' then
  select * into site from public.reader_site_settings where singleton for update;
  if p_expected is distinct from site.version then return jsonb_build_object('error','conflict'); end if;
  if p_slug is not null and not exists(select 1 from public.reader_productions where slug=p_slug and active_revision is not null) then
   return jsonb_build_object('error','not_found'); end if;
  update public.reader_site_settings set home_slug=p_slug,version=gen_random_uuid() where singleton;
  return jsonb_build_object('saved',true);
 elsif p_action not in ('publish','settings') then return jsonb_build_object('error','invalid_request'); end if;
 if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>80 then return jsonb_build_object('error','invalid_request'); end if;
 select * into item from public.reader_productions where slug=p_slug for update;
 if found then
  if p_expected is distinct from item.management_version then return jsonb_build_object('error','conflict'); end if;
 elsif p_action='settings' then return jsonb_build_object('error','not_found');
 elsif p_expected is not null then return jsonb_build_object('error','conflict'); end if;
 if jsonb_typeof(p_data->'title') is distinct from 'string' or length(btrim(p_data->>'title')) not between 1 and 200 or
  coalesce(p_data->>'before','') !~ '^[0-5]$' or coalesce(p_data->>'after','') !~ '^[0-5]$' then
  return jsonb_build_object('error','invalid_request'); end if;
 if p_action='publish' then
  revision := public.reader_publish(p_slug,p_data->>'title',p_data->'payload');
 end if;
 update public.reader_productions set title=p_data->>'title',default_before=(p_data->>'before')::integer,
  default_after=(p_data->>'after')::integer where slug=p_slug;
 return jsonb_build_object('saved',true,'revision',revision);
end;
$$;
revoke all on function public.reader_manage_productions(text,uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reader_manage_productions(text,uuid,text,uuid,jsonb) to service_role;

-- Preserve the existing admission/quota implementation and add defaults to its metadata.
alter function public.reader_fetch(text,text,text,boolean,text,uuid,integer,integer,integer,timestamptz) rename to reader_fetch_content;
create function public.reader_fetch(
 p_slug text,p_browser text,p_ip text,p_new_browser boolean,p_character text default null,p_revision uuid default null,
 p_browser_limit integer default 60,p_ip_limit integer default 1200,p_identity_limit integer default 120,
 p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; defaults jsonb;
begin
 result := public.reader_fetch_content(p_slug,p_browser,p_ip,p_new_browser,p_character,p_revision,p_browser_limit,p_ip_limit,p_identity_limit,p_now);
 if result ? 'production' then
  select jsonb_build_object('before',default_before,'after',default_after) into defaults from public.reader_productions where slug=p_slug;
  result := jsonb_set(result,'{production}',(result->'production') || jsonb_build_object('defaults',defaults));
 end if;
 return result;
end; $$;
revoke all on function public.reader_fetch(text,text,text,boolean,text,uuid,integer,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.reader_fetch(text,text,text,boolean,text,uuid,integer,integer,integer,timestamptz) to service_role;
