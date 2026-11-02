-- Provider names remain internal; masters may independently choose an application display name.
alter table public.reader_admin_accounts add column display_name text
 check(display_name is null or (length(display_name) between 1 and 100 and display_name=btrim(display_name,U&' \00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') and display_name !~ U&'[\0001-\001F\007F-\009F]' and display_name ~ '[^[:space:]]'));
create function reader_private.admin_account_public(p_account public.reader_admin_accounts)
returns jsonb language sql stable strict security invoker set search_path='' as $$
 select (to_jsonb(p_account)-'display_name') || jsonb_build_object('name',coalesce((p_account).display_name,(p_account).name));
$$;
revoke all on function reader_private.admin_account_public(public.reader_admin_accounts) from public,anon,authenticated;
grant execute on function reader_private.admin_account_public(public.reader_admin_accounts) to service_role;

create or replace function public.reader_admin_access(
  p_action text, p_actor uuid, p_email text default null, p_name text default null,
  p_target uuid default null, p_role text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor public.reader_admin_accounts%rowtype;
  target public.reader_admin_accounts%rowtype;
  masters integer;
begin
  if p_action is null or p_action not in ('me', 'request', 'list', 'change') or p_actor is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if p_action <> 'me' then
    perform 1 from public.reader_admin_state where singleton for update;
  end if;
  select * into actor from public.reader_admin_accounts where user_id = p_actor;
  if p_action = 'me' then
    return jsonb_build_object('account', case when actor.user_id is null then null else reader_private.admin_account_public(actor) end);
  end if;
  if p_action = 'request' then
    if p_email is null or length(p_email) not between 1 and 320 or
       p_name is null or length(p_name) not between 1 and 200 then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    if actor.status in ('pending', 'approved') then
      return jsonb_build_object('account', reader_private.admin_account_public(actor));
    end if;
    insert into public.reader_admin_accounts(user_id, email, name)
      values(p_actor, p_email, p_name)
      on conflict(user_id) do update set email = excluded.email, name = excluded.name,
        role = 'admin', status = 'pending', requested_at = now(), updated_at = now()
      returning * into actor;
    return jsonb_build_object('account', reader_private.admin_account_public(actor));
  end if;
  if actor.user_id is null or actor.status <> 'approved' or actor.role <> 'master' then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_action = 'list' then
    return jsonb_build_object('accounts', coalesce((select jsonb_agg(reader_private.admin_account_public(a) order by a.requested_at, a.user_id)
      from public.reader_admin_accounts a), '[]'::jsonb));
  end if;
  if p_role is null or p_role not in ('admin', 'master', 'revoked') or p_target is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  select * into target from public.reader_admin_accounts where user_id = p_target;
  if target.user_id is null then return jsonb_build_object('error', 'not_found'); end if;
  select count(*) into masters from public.reader_admin_accounts where role = 'master' and status = 'approved';
  if target.role = 'master' and p_role <> 'master' and masters <= 1 then
    return jsonb_build_object('error', 'last_master');
  end if;
  if target.role <> 'master' and p_role = 'master' and masters >= 3 then
    return jsonb_build_object('error', 'master_limit');
  end if;
  update public.reader_admin_accounts set role = case when p_role = 'master' then 'master' else 'admin' end,
    status = case when p_role = 'revoked' then 'revoked' else 'approved' end, updated_at = now()
    where user_id = p_target returning * into target;
  return jsonb_build_object('account', reader_private.admin_account_public(target));
end;
$$;
revoke all on function public.reader_admin_access(text, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reader_admin_access(text, uuid, text, text, uuid, text) to service_role;

create or replace function public.reader_admin_bootstrap(p_user uuid, p_email text, p_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ready boolean;
  account public.reader_admin_accounts%rowtype;
begin
  select bootstrapped into ready from public.reader_admin_state where singleton for update;
  if ready then return jsonb_build_object('error', 'already_bootstrapped'); end if;
  if p_user is null or p_email is null or length(p_email) not between 1 and 320 or
     p_name is null or length(p_name) not between 1 and 200 then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  insert into public.reader_admin_accounts(user_id, email, name, role, status)
    values(p_user, p_email, p_name, 'master', 'approved')
    on conflict(user_id) do update set email = excluded.email, name = excluded.name, role = 'master', status = 'approved', updated_at = now()
    returning * into account;
  update public.reader_admin_state set bootstrapped = true where singleton;
  return jsonb_build_object('account', reader_private.admin_account_public(account));
end;
$$;
revoke all on function public.reader_admin_bootstrap(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reader_admin_bootstrap(uuid, text, text) to service_role;

-- The shared access lock serializes renaming with demotion/revocation. Identity and access are unchanged.
create function public.reader_admin_display_name(p_actor uuid,p_target uuid,p_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.reader_admin_accounts%rowtype; normalized text:=btrim(p_name,U&' \00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
begin
 perform 1 from public.reader_admin_state where singleton for update;
 if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved' and role='master') then return jsonb_build_object('error','forbidden'); end if;
 if p_target is null or (p_name is not null and (length(normalized) not between 1 and 100 or p_name ~ U&'[\0001-\001F\007F-\009F]' or p_name !~ '[^[:space:]]')) then return jsonb_build_object('error','invalid_request'); end if;
 update public.reader_admin_accounts set display_name=case when p_name is null then null else normalized end,updated_at=clock_timestamp()
 where user_id=p_target returning * into target;
 if not found then return jsonb_build_object('error','not_found'); end if;
 return jsonb_build_object('account',reader_private.admin_account_public(target));
end; $$;
revoke all on function public.reader_admin_display_name(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reader_admin_display_name(uuid,uuid,text) to service_role;
