-- Full payload is available only to trusted server/CLI callers, never browser database roles.
create function public.reader_song_context(p_slug text, p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.reader_productions%rowtype; payload jsonb; songs jsonb;
begin
 if p_actor is not null then
  perform 1 from public.reader_admin_state where singleton for update;
  if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved') then return jsonb_build_object('error','forbidden'); end if;
 end if;
 select * into item from public.reader_productions where slug=p_slug;
 if not found then return jsonb_build_object('version',null,'songs','[]'::jsonb); end if;
 select r.payload into payload from public.reader_revisions r where r.id=item.active_revision;
 select coalesce(jsonb_agg(jsonb_build_object('no',r->'no','title',r->'source'->>'English','video',payload->'media'->>(r->>'no')) order by ord),'[]'::jsonb)
 into songs from jsonb_array_elements(payload->'script'->'records') with ordinality records(r,ord) where (r->'types') ? 'Song';
 return jsonb_build_object('version',item.management_version,'songs',songs,'payload',payload,'title',item.title,'before',item.default_before,'after',item.default_after);
end; $$;
revoke all on function public.reader_song_context(text,uuid) from public, anon, authenticated;
grant execute on function public.reader_song_context(text,uuid) to service_role;

create function public.reader_publish_checked(p_slug text,p_title text,p_payload jsonb,p_expected uuid,
 p_actor uuid default null,p_before integer default null,p_after integer default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.reader_productions%rowtype; revision uuid;
begin
 perform 1 from public.reader_admin_state where singleton for update;
 if p_actor is not null and not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved') then return jsonb_build_object('error','forbidden'); end if;
 select * into item from public.reader_productions where slug=p_slug for update;
 if found then
  if item.management_version is distinct from p_expected then return jsonb_build_object('error','conflict'); end if;
 elsif p_expected is not null then return jsonb_build_object('error','conflict'); end if;
 if (p_before is not null and p_before not between 0 and 5) or (p_after is not null and p_after not between 0 and 5) then return jsonb_build_object('error','invalid_request'); end if;
 revision:=public.reader_publish(p_slug,p_title,p_payload);
 update public.reader_productions set default_before=coalesce(p_before,default_before),default_after=coalesce(p_after,default_after) where slug=p_slug;
 return jsonb_build_object('saved',true,'revision',revision);
end; $$;
revoke all on function public.reader_publish_checked(text,text,jsonb,uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.reader_publish_checked(text,text,jsonb,uuid,uuid,integer,integer) to service_role;
