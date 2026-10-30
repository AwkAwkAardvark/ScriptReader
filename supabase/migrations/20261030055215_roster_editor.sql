-- Independent student records remain production-local, private and outside script history.
alter table public.reader_assignment_sets add column students jsonb not null default '[]'::jsonb
 check(jsonb_typeof(students)='array' and jsonb_array_length(students)<=5000);
update public.reader_assignment_sets sets set students=(
 select coalesce(jsonb_agg(s order by s->>'id'),'[]'::jsonb) from (
  select distinct on(a->>'studentId') jsonb_build_object('id',a->>'studentId','name',a->>'studentName','className',a->>'className','label','') s
  from jsonb_array_elements(sets.assignments) a order by a->>'studentId'
 ) people
);

-- Preserve the CSV endpoint: imported names/classes update by ID, retaining labels
-- and students without roles. Explicit global clearing removes both arrays.
create function public.reader_roster_sync() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select coalesce(jsonb_agg(s order by s->>'id'),'[]'::jsonb) into new.students from (
  select distinct on(a->>'studentId') jsonb_build_object('id',a->>'studentId','name',a->>'studentName','className',a->>'className',
   'label',coalesce((select p->>'label' from jsonb_array_elements(new.students) p where p->>'id'=a->>'studentId'),'')) s
  from jsonb_array_elements(new.assignments) a
  union all
  select p from jsonb_array_elements(new.students) p where not exists(select 1 from jsonb_array_elements(new.assignments) a where a->>'studentId'=p->>'id')
 ) people;
 return new;
end; $$;
revoke all on function public.reader_roster_sync() from public,anon,authenticated;
create trigger reader_roster_sync before insert or update of assignments,students on public.reader_assignment_sets for each row execute function public.reader_roster_sync();

create function public.reader_roster(p_actor uuid,p_slug text,p_action text default 'read',p_expected uuid default null,
 p_production uuid default null,p_students jsonb default null,p_roles jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.reader_productions%rowtype; saved public.reader_assignment_sets%rowtype; payload jsonb; expanded jsonb; next_version uuid;
begin
 perform 1 from public.reader_admin_state where singleton for update;
 if not exists(select 1 from public.reader_admin_accounts where user_id=p_actor and status='approved') then return jsonb_build_object('error','forbidden'); end if;
 select * into item from public.reader_productions where slug=p_slug for update;
 if not found or item.active_revision is null then return jsonb_build_object('error','not_found'); end if;
 select r.payload into payload from public.reader_revisions r where r.id=item.active_revision;
 select * into saved from public.reader_assignment_sets where production_id=item.id;
 if p_action='read' then
  select coalesce(jsonb_agg(jsonb_build_object('studentId',a->>'studentId','tag',a->>'tag','performance',a->>'performance')),'[]'::jsonb) into expanded from jsonb_array_elements(coalesce(saved.assignments,'[]'::jsonb)) a;
  return jsonb_build_object('title',item.title,'productionVersion',item.management_version,'version',saved.version,
   'students',coalesce(saved.students,'[]'::jsonb),'assignments',expanded,'characters',payload->'script'->'characters');
 end if;
 if p_action<>'save' then return jsonb_build_object('error','invalid_request'); end if;
 if saved.version is distinct from p_expected or item.management_version is distinct from p_production then return jsonb_build_object('error','conflict'); end if;
 if jsonb_typeof(p_students) is distinct from 'array' or jsonb_typeof(p_roles) is distinct from 'array' then return jsonb_build_object('error','validation'); end if;
 if jsonb_array_length(p_students)>5000 or jsonb_array_length(p_roles)>5000 then return jsonb_build_object('error','validation'); end if;
 if exists(select 1 from jsonb_array_elements(p_students) s where jsonb_typeof(s) is distinct from 'object')
 or exists(select 1 from jsonb_array_elements(p_roles) a where jsonb_typeof(a) is distinct from 'object') then return jsonb_build_object('error','validation'); end if;
 if exists(select 1 from jsonb_array_elements(p_students) s where (select count(*) from jsonb_object_keys(s))<>4
  or jsonb_typeof(s->'id') is distinct from 'string' or coalesce(s->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
  or jsonb_typeof(s->'name') is distinct from 'string' or length(btrim(coalesce(s->>'name',''))) not between 1 and 100
  or jsonb_typeof(s->'className') is distinct from 'string' or length(s->>'className')>100
  or jsonb_typeof(s->'label') is distinct from 'string' or length(s->>'label')>60
  or ((s->>'name')||(s->>'className')||(s->>'label')) ~ '[[:cntrl:]]')
 or exists(select 1 from jsonb_array_elements(p_students) s group by s->>'id' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(coalesce(saved.students,'[]'::jsonb)) old where not exists(select 1 from jsonb_array_elements(p_students) s where s->>'id'=old->>'id'))
 or exists(select 1 from jsonb_array_elements(p_roles) a where (select count(*) from jsonb_object_keys(a))<>3
  or jsonb_typeof(a->'studentId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(p_students) s where s->>'id'=a->>'studentId')
  or jsonb_typeof(a->'tag') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(payload->'script'->'characters') c where c->>'tag'=a->>'tag')
  or jsonb_typeof(a->'performance') is distinct from 'string' or coalesce(a->>'performance','') not in ('1부','2부'))
 or exists(select 1 from jsonb_array_elements(p_roles) a group by a->>'performance',a->>'tag' having count(*)>1)
 then return jsonb_build_object('error','validation'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('studentId',a->>'studentId','studentName',s->>'name','className',s->>'className','performance',a->>'performance','tag',a->>'tag')),'[]'::jsonb)
 into expanded from jsonb_array_elements(p_roles) a join jsonb_array_elements(p_students) s on s->>'id'=a->>'studentId';
 next_version:=gen_random_uuid();
 insert into public.reader_assignment_sets(production_id,version,students,assignments) values(item.id,next_version,p_students,expanded)
 on conflict(production_id) do update set version=excluded.version,students=excluded.students,assignments=excluded.assignments;
 return jsonb_build_object('saved',true,'version',next_version);
end; $$;
revoke all on function public.reader_roster(uuid,text,text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reader_roster(uuid,text,text,uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.reader_staff_context(p_actor uuid,p_slug text,p_action text default 'read',
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
 insert into public.reader_assignment_sets(production_id,version,assignments,students) values(item.id,next_version,p_rows,'[]'::jsonb)
 on conflict(production_id) do update set version=excluded.version,assignments=excluded.assignments,
 students=case when jsonb_array_length(excluded.assignments)=0 then '[]'::jsonb else public.reader_assignment_sets.students end;
 return jsonb_build_object('saved',true,'version',next_version);
end; $$;
revoke all on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) to service_role;

