-- Student data is intentionally separate from immutable public script revisions.
create table public.reader_assignment_sets (
 production_id uuid primary key references public.reader_productions(id),
 version uuid not null default gen_random_uuid(),
 assignments jsonb not null default '[]'::jsonb check(jsonb_typeof(assignments)='array' and jsonb_array_length(assignments)<=5000)
);
alter table public.reader_assignment_sets enable row level security;
revoke all on public.reader_assignment_sets from public, anon, authenticated;
grant select, insert, update on public.reader_assignment_sets to service_role;

create function public.reader_staff_context(p_actor uuid,p_slug text,p_action text default 'read',
 p_expected uuid default null,p_production uuid default null,p_rows jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.reader_productions%rowtype; saved public.reader_assignment_sets%rowtype; payload jsonb; next_version uuid;
begin
 perform 1 from public.reader_admin_state where singleton for update;
 if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved') then return jsonb_build_object('error','forbidden'); end if;
 -- Same lock order as publication: membership, production, then assignments.
 select * into item from public.reader_productions where slug=p_slug for update;
 if not found or item.active_revision is null then return jsonb_build_object('error','not_found'); end if;
 select r.payload into payload from public.reader_revisions r where r.id=item.active_revision;
 select * into saved from public.reader_assignment_sets where production_id=item.id;
 if p_action='read' then
  return jsonb_build_object('title',item.title,'productionVersion',item.management_version,'version',saved.version,
   'assignments',coalesce(saved.assignments,'[]'::jsonb),'characters',payload->'script'->'characters','payload',payload);
 end if;
 if p_action<>'save' then return jsonb_build_object('error','invalid_request'); end if;
 if saved.version is distinct from p_expected or item.management_version is distinct from p_production then return jsonb_build_object('error','conflict'); end if;
 if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then return jsonb_build_object('error','invalid_request'); end if;
 if jsonb_array_length(p_rows)>5000 then return jsonb_build_object('error','invalid_request'); end if;
 if exists(select 1 from jsonb_array_elements(p_rows) a where jsonb_typeof(a) is distinct from 'object') then return jsonb_build_object('error','invalid_request'); end if;
 if exists(select 1 from jsonb_array_elements(p_rows) a where
  (select count(*) from jsonb_object_keys(a))<>5 or
  jsonb_typeof(a->'studentId') is distinct from 'string' or coalesce(a->>'studentId','') !~ '^[A-Za-z0-9_-]{1,64}$' or
  jsonb_typeof(a->'studentName') is distinct from 'string' or length(btrim(coalesce(a->>'studentName',''))) not between 1 and 100 or
  jsonb_typeof(a->'className') is distinct from 'string' or length(a->>'className')>100 or
  jsonb_typeof(a->'performance') is distinct from 'string' or coalesce(a->>'performance','') not in ('1부','2부') or
  jsonb_typeof(a->'tag') is distinct from 'string' or
  not exists(select 1 from jsonb_array_elements(payload->'script'->'characters') c where c->>'tag'=a->>'tag')
 ) or exists(select 1 from jsonb_array_elements(p_rows) a group by a->>'performance',a->>'tag' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_rows) a group by a->>'studentId' having count(distinct jsonb_build_array(a->>'studentName',a->>'className'))>1)
 then return jsonb_build_object('error','validation'); end if;
 next_version:=gen_random_uuid();
 insert into public.reader_assignment_sets(production_id,version,assignments) values(item.id,next_version,p_rows)
 on conflict(production_id) do update set version=excluded.version,assignments=excluded.assignments;
 return jsonb_build_object('saved',true,'version',next_version);
end; $$;
revoke all on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) to service_role;

-- Also guard trusted CLI publication, not only the browser upload workflow.
create function public.reader_assignment_tags_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.active_revision is distinct from old.active_revision and exists(
  select 1 from public.reader_assignment_sets s cross join lateral jsonb_array_elements(s.assignments) a
  where s.production_id=new.id and not exists(
   select 1 from public.reader_revisions r cross join lateral jsonb_array_elements(r.payload->'script'->'characters') c
   where r.id=new.active_revision and c->>'tag'=a->>'tag')) then
  raise exception 'Update or remove assignments before removing assigned character tags' using errcode='23514';
 end if;
 return new;
end; $$;
revoke all on function public.reader_assignment_tags_guard() from public, anon, authenticated;
create trigger reader_assignment_tags_guard before update of active_revision on public.reader_productions
for each row execute function public.reader_assignment_tags_guard();
