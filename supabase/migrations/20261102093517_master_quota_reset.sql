-- One-time operational resets retain metadata only, independently of production rosters.
create table reader_private.quota_reset_operations (
 operation_id uuid primary key,
 actor_id uuid not null,
 actor_role text not null check(actor_role='master'),
 occurred_at timestamptz not null default clock_timestamp(),
 action text not null check(action='reset_reader_allowances'),
 day date not null,
 affected_count bigint not null check(affected_count>=0)
);
alter table reader_private.quota_reset_operations enable row level security;
revoke all on reader_private.quota_reset_operations from public,anon,authenticated,service_role;
grant select,insert on reader_private.quota_reset_operations to service_role;

create function public.reader_quota_admin(p_actor uuid,p_action text default 'today',p_expected_day date default null,p_operation uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare today date; affected bigint; previous reader_private.quota_reset_operations%rowtype;
begin
 -- Same membership lock as access management: demotion and reset cannot race.
 perform 1 from public.reader_admin_state where singleton for update;
 if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved' and role='master') then return jsonb_build_object('error','forbidden'); end if;
 if p_action is null or p_action not in ('today','reset') then return jsonb_build_object('error','invalid_request'); end if;
 if p_action='today' then
  if p_expected_day is not null or p_operation is not null then return jsonb_build_object('error','invalid_request'); end if;
  today:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
  select count(*) into affected from public.reader_browser_days where day=today;
  return jsonb_build_object('day',today,'count',affected);
 end if;
 if p_expected_day is null or p_operation is null then return jsonb_build_object('error','invalid_request'); end if;
 select * into previous from reader_private.quota_reset_operations where operation_id=p_operation;
 if found then
  if previous.actor_id is distinct from p_actor or previous.day is distinct from p_expected_day then return jsonb_build_object('error','invalid_request'); end if;
  -- A response lost after commit can be retried, even after midnight, without deleting again.
  return jsonb_build_object('day',previous.day,'count',previous.affected_count,'operationId',previous.operation_id);
 end if;
 -- Readers acquire their compatible gate before retention cleanup or rate locks.
 -- A reset excludes admissions and other resets until DELETE+audit commit atomically.
 lock table public.reader_browser_days in share row exclusive mode;
 today:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
 if today is distinct from p_expected_day then return jsonb_build_object('error','day_changed'); end if;
 delete from public.reader_browser_days where day=today;
 get diagnostics affected=row_count;
 insert into reader_private.quota_reset_operations(operation_id,actor_id,actor_role,action,day,affected_count)
 values(p_operation,p_actor,'master','reset_reader_allowances',today,affected);
 return jsonb_build_object('day',today,'count',affected,'operationId',p_operation);
end; $$;
revoke all on function public.reader_quota_admin(uuid,text,date,uuid) from public,anon,authenticated;
grant execute on function public.reader_quota_admin(uuid,text,date,uuid) to service_role;

-- Establish lock order before content's expired-rate cleanup, not after rate/row locks.
-- Reader gates are mutually compatible; only a rare explicit reset excludes readers.
create or replace function public.reader_fetch(
 p_slug text,p_browser text,p_ip text,p_new_browser boolean,p_character text default null,p_revision uuid default null,
 p_browser_limit integer default 60,p_ip_limit integer default 1200,p_identity_limit integer default 120,
 p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; defaults jsonb;
begin
 lock table public.reader_browser_days in row exclusive mode;
 result:=public.reader_fetch_content(p_slug,p_browser,p_ip,p_new_browser,p_character,p_revision,p_browser_limit,p_ip_limit,p_identity_limit,p_now);
 if result ? 'production' then
  select jsonb_build_object('before',default_before,'after',default_after) into defaults from public.reader_productions where slug=p_slug;
  result:=jsonb_set(result,'{production}',(result->'production')||jsonb_build_object('defaults',defaults));
 end if;
 return result;
end; $$;
revoke all on function public.reader_fetch(text,text,text,boolean,text,uuid,integer,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.reader_fetch(text,text,text,boolean,text,uuid,integer,integer,integer,timestamptz) to service_role;
