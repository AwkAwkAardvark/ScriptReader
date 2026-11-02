-- Metadata-only change history: never copy names, classes, labels or request bodies.
-- This schema is not exposed by the Data API. No public/browser grants or policies.
create schema reader_private;
revoke all on schema reader_private from public, anon, authenticated;
grant usage on schema reader_private to service_role;
create table reader_private.roster_audit_events (
 id uuid primary key default gen_random_uuid(),
 occurred_at timestamptz not null default clock_timestamp(),
 production_id uuid not null,
 actor_id uuid not null,
 actor_role text not null check(actor_role in ('admin','master')),
 action text not null check(action in ('roster_save','csv_import','restore','clear')),
 before_version uuid,
 after_version uuid not null,
 casting_changes jsonb not null check(jsonb_typeof(casting_changes)='array'),
 student_changes jsonb not null check(jsonb_typeof(student_changes)='array')
);
-- No identity/production foreign keys: clearing data or later removing an account
-- must not cascade-delete attribution. Only the provider owner can alter history.
alter table reader_private.roster_audit_events enable row level security;
revoke all on reader_private.roster_audit_events from public, anon, authenticated, service_role;
grant select, insert on reader_private.roster_audit_events to service_role;
create index roster_audit_production_time on reader_private.roster_audit_events(production_id,occurred_at,id);

-- Called only after a successful write, in the same transaction and lock scope.
-- Before data comes from the locked snapshot in the RPC, after data from storage
-- (including the roster-sync trigger). Neither snapshot is retained in the event.
create function reader_private.append_roster_audit(p_actor uuid,p_production uuid,p_action text,
 p_before_version uuid,p_before_students jsonb,p_before_assignments jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare saved public.reader_assignment_sets%rowtype; role_name text; slots jsonb; people jsonb;
begin
 select role into role_name from public.reader_admin_accounts where user_id=p_actor and status='approved';
 if role_name is null then raise exception 'Unapproved roster actor' using errcode='42501'; end if;
 select * into strict saved from public.reader_assignment_sets where production_id=p_production;
 with before_slots as (
  select a->>'performance' performance,a->>'tag' tag,a->>'studentId' student_id
  from jsonb_array_elements(coalesce(p_before_assignments,'[]'::jsonb)) a
 ), after_slots as (
  select a->>'performance' performance,a->>'tag' tag,a->>'studentId' student_id
  from jsonb_array_elements(saved.assignments) a
 )
 select coalesce(jsonb_agg(jsonb_build_object('performance',coalesce(b.performance,a.performance),
  'tag',coalesce(b.tag,a.tag),'beforeStudentId',b.student_id,'afterStudentId',a.student_id)
  order by coalesce(b.performance,a.performance),coalesce(b.tag,a.tag)),'[]'::jsonb) into slots
 from before_slots b full join after_slots a using(performance,tag)
 where b.student_id is distinct from a.student_id;
 with before_people as (
  select s->>'id' id,s from jsonb_array_elements(coalesce(p_before_students,'[]'::jsonb)) s
 ), after_people as (
  select s->>'id' id,s from jsonb_array_elements(saved.students) s
 ), changes as (
  select coalesce(b.id,a.id) id,case when b.id is null then 'added' when a.id is null then 'deleted' else 'updated' end kind,
   (select jsonb_agg(f order by f) from unnest(array['name','className','label']) f
    where b.id is null or a.id is null or b.s->f is distinct from a.s->f) fields
  from before_people b full join after_people a using(id) where b.s is distinct from a.s
 )
 select coalesce(jsonb_agg(jsonb_build_object('studentId',id,'change',kind,'fields',fields) order by id),'[]'::jsonb)
 into people from changes;
 insert into reader_private.roster_audit_events(production_id,actor_id,actor_role,action,before_version,after_version,casting_changes,student_changes)
 values(p_production,p_actor,role_name,p_action,p_before_version,saved.version,slots,people);
end; $$;
revoke all on function reader_private.append_roster_audit(uuid,uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function reader_private.append_roster_audit(uuid,uuid,text,uuid,jsonb,jsonb) to service_role;

create or replace function public.reader_roster(p_actor uuid,p_slug text,p_action text default 'read',p_expected uuid default null,
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
 if p_action is null or p_action<>'save' then return jsonb_build_object('error','invalid_request'); end if;
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
 perform reader_private.append_roster_audit(p_actor,item.id,'roster_save',saved.version,saved.students,saved.assignments);
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
 if p_action not in ('save','import','clear') or p_action is null then return jsonb_build_object('error','invalid_request'); end if;
 if saved.version is distinct from p_expected or item.management_version is distinct from p_production then return jsonb_build_object('error','conflict'); end if;
 if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then return jsonb_build_object('error','invalid_request'); end if;
 if p_action='clear' and jsonb_array_length(p_rows)<>0 then return jsonb_build_object('error','invalid_request'); end if;
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
 perform reader_private.append_roster_audit(p_actor,item.id,case when jsonb_array_length(p_rows)=0 then 'clear' else 'csv_import' end,saved.version,saved.students,saved.assignments);
 return jsonb_build_object('saved',true,'version',next_version);
end; $$;
revoke all on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reader_staff_context(uuid,text,text,uuid,uuid,jsonb) to service_role;

