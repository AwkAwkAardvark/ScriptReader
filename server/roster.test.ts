// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {localDatabase} from './local-database';
import {handleAdminApi} from './admin-api';
import {handleApi} from './api';
import {preparePublication} from './publishing';
import {csvFor,syntheticRecords} from '../src/test/fixtures';
import type {AdminAuthFactory} from './admin-auth';
import type {RosterContext,Roster} from '../src/roster';
let local:Awaited<ReturnType<typeof localDatabase>>;
const owner='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',pending='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://unused.test',SUPABASE_SECRET_KEY:'test',SUPABASE_PUBLISHABLE_KEY:'test',ADMIN_ORIGIN:'https://reader.test',BROWSER_COOKIE_SECRET:'synthetic-cookie-secret-long-enough'};
const auth=(id:string|null):AdminAuthFactory=>()=>({user:async()=>id?{id,email:'synthetic@example.test',name:'Staff'}:null,start:async()=>null,exchange:async()=>false,signOut:async()=>{}});
const roster:Roster={students:[{id:'s1',name:'PRIVATE_STUDENT_FIXTURE',className:'Class A',label:'PRIVATE_LABEL_FIXTURE'},{id:'s2',name:'PRIVATE_STUDENT_FIXTURE',className:'Class A',label:'Blue group'},{id:'s3',name:'김민준',className:'Class B',label:''}],assignments:[{studentId:'s1',performance:'1부',tag:'Ro'},{studentId:'s1',performance:'1부',tag:'Mi'},{studentId:'s2',performance:'2부',tag:'Ro'}]};
const path='productions/workshop/';
async function api(route:string,method='GET',body?:unknown,id:string|null=staff,origin='https://reader.test'){
 return handleAdminApi(new Request('https://reader.test/api/admin/'+route,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,local.rpc,auth(id));
}
const context=async()=>await(await api(path+'roster')).json() as RosterContext;
const body=(c:RosterContext,value:Roster=roster)=>({...value,expected:c.version,productionVersion:c.productionVersion});
beforeAll(async()=>{local=await localDatabase();await local.rpc('reader_admin_bootstrap',{p_user:owner,p_email:'owner@example.test',p_name:'Owner'});
 for(const id of [staff,pending])await local.rpc('reader_admin_access',{p_action:'request',p_actor:id,p_email:'staff@example.test',p_name:'Staff'});
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'admin'});
 await local.rpc('reader_publish',{p_slug:'workshop',p_title:'Workshop',p_payload:preparePublication(csvFor(),'Tag,Name\nRo,Rowan\nMi,Mira')});
},60000);
afterAll(async()=>local?.db.close());
it('requires current approval and same-origin mutations, and returns no full script',async()=>{
 expect((await api(path+'roster','GET',undefined,null)).status).toBe(401);expect((await api(path+'roster','GET',undefined,pending)).status).toBe(403);
 expect((await api(path+'roster','PATCH',{},staff,'https://evil.test')).status).toBe(403);
 const response=await api(path+'roster');expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).not.toHaveProperty('payload');
 expect((await api(path+'roster','POST',{})).status).toBe(405);expect((await api(path+'roster?unexpected=1')).status).toBe(400);
});
it('adds distinct students, saves multiple roles and performances, and reloads persisted values',async()=>{
 const c=await context();expect(c.students).toEqual([]);expect((await api(path+'roster','PATCH',body(c))).status).toBe(200);
 const next=await context();expect(next.students).toEqual(roster.students);expect(next.assignments).toEqual(roster.assignments);expect(next.version).not.toBe(c.version);
 expect((await api(path+'roster','PATCH',body(c))).status).toBe(409);
 const teacher=await(await api(path+'viewer')).json();expect(teacher.assignments[0]).toEqual({studentId:'s1',studentName:'PRIVATE_STUDENT_FIXTURE',className:'Class A',performance:'1부',tag:'Ro'});expect(JSON.stringify(teacher)).not.toContain('PRIVATE_LABEL_FIXTURE');
});
it('propagates name/class changes to all teacher attributions and retains unassigned students and labels',async()=>{
 const c=await context();const next={students:c.students.map(s=>s.id==='s1'?{...s,name:'Renamed student',className:'Updated class'}:s),assignments:c.assignments};
 expect((await api(path+'roster','PATCH',body(c,next))).status).toBe(200);
 const teacher=await(await api(path+'viewer')).json();expect(teacher.assignments.filter((a:any)=>a.studentId==='s1').every((a:any)=>a.studentName==='Renamed student'&&a.className==='Updated class')).toBe(true);
 const current=await context();expect((await api(path+'roster','PATCH',body(current,{students:current.students,assignments:[]}))).status).toBe(200);
 expect((await context()).students).toHaveLength(3);expect((await context()).students[0].label).toBe('PRIVATE_LABEL_FIXTURE');
});
it('rejects duplicate slots, missing references, removed students, unknown fields and oversized requests',async()=>{
 const c=await context();const duplicate={...roster,assignments:[...roster.assignments,{studentId:'s3',tag:'Ro',performance:'1부' as const}]};
 expect((await api(path+'roster','PATCH',body(c,duplicate))).status).toBe(422);
 expect((await api(path+'roster','PATCH',body(c,{students:[],assignments:[]}))).status).toBe(422);
 expect((await api(path+'roster','PATCH',{...body(c),actor:owner})).status).toBe(400);
 expect((await api(path+'roster','PATCH',{...body(c),students:'x'.repeat(5*1024*1024)})).status).toBe(413);
 expect((await context()).version).toBe(c.version);
});
it('serializes concurrent roster saves and rejects stale production context',async()=>{
 const c=await context();const responses=await Promise.all([api(path+'roster','PATCH',body(c)),api(path+'roster','PATCH',body(c))]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 const current=await context();await local.rpc('reader_manage_productions',{p_action:'settings',p_actor:staff,p_slug:'workshop',p_expected:current.productionVersion,p_data:{title:'Workshop revised',before:2,after:1}});
 expect((await api(path+'roster','PATCH',body(current))).status).toBe(409);
});
it('keeps the CSV fallback compatible, preserving unassigned students/labels with a shared version token',async()=>{
 const c=await context();const csv='StudentId,StudentName,Class,Performance,Tag\ns1,CSV student,CSV class,1부,Ro\ns4,New student,Class C,2부,Mi';
 expect((await api(path+'assignments','PATCH',{csv,expected:c.version,productionVersion:c.productionVersion})).status).toBe(200);
 const next=await context();expect(next.students).toHaveLength(4);expect(next.students.find(s=>s.id==='s1')).toEqual({id:'s1',name:'CSV student',className:'CSV class',label:'PRIVATE_LABEL_FIXTURE'});expect(next.students.find(s=>s.id==='s2')).toBeDefined();
 expect((await api(path+'roster','PATCH',body(c))).status).toBe(409);
 expect((await api(path+'assignments','PATCH',{csv,expected:c.version,productionVersion:c.productionVersion})).status).toBe(409);
});
it('does not publish student identities or labels through public metadata, passages or revision payloads',async()=>{
 const request=(suffix:string,data:unknown)=>handleApi(new Request('https://reader.test/api/productions/workshop'+suffix,{method:'POST',headers:{Origin:'https://reader.test','Content-Type':'application/json'},body:JSON.stringify(data)}),env,local.rpc);
 const metaResponse=await request('',{});const meta=await metaResponse.json();const passage=await request('/passages',{character:'Ro',revision:meta.revision,before:2,after:1,includeNonDialogue:true});expect(passage.status).toBe(200);
 const publicText=JSON.stringify(meta)+await passage.text()+JSON.stringify((await local.db.query('select payload from reader_revisions')).rows);
 for(const name of ['CSV student','PRIVATE_LABEL_FIXTURE','Blue group','New student'])expect(publicText).not.toContain(name);
});
it('guards CLI publication and direct database mutation/function permissions',async()=>{
 const removed=preparePublication(csvFor(syntheticRecords.filter(r=>!r.Tag.split(';').includes('Ro'))),'Tag,Name\nMi,Mira');
 await expect(local.rpc('reader_publish',{p_slug:'workshop',p_title:'Unsafe',p_payload:removed})).rejects.toThrow('Update or remove assignments');
 await local.db.exec('set role service_role');try{
  const c=await context();expect(await local.rpc('reader_roster',{p_actor:staff,p_slug:'workshop',p_action:'save',p_expected:c.version,p_production:c.productionVersion,p_students:[],p_roles:[]})).toEqual({error:'validation'});
  expect(await local.rpc('reader_roster',{p_actor:pending,p_slug:'workshop'})).toEqual({error:'forbidden'});
 }finally{await local.db.exec('reset role');}
 for(const role of ['anon','authenticated']){await local.db.exec('set role '+role);try{await expect(local.db.query('select students from reader_assignment_sets')).rejects.toThrow(/permission denied/);await expect(local.rpc('reader_roster',{p_actor:staff,p_slug:'workshop'})).rejects.toThrow(/permission denied/);}finally{await local.db.exec('reset role');}}
});
it('explicit global deletion clears student data and revocation takes effect on subsequent requests',async()=>{
 const c=await context();expect((await api(path+'assignments','PATCH',{clear:true,expected:c.version,productionVersion:c.productionVersion})).status).toBe(200);
 expect((await context()).students).toEqual([]);expect((await context()).assignments).toEqual([]);
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'revoked'});
 expect((await api(path+'roster')).status).toBe(403);expect((await api(path+'roster','PATCH',body(c))).status).toBe(403);
});

it('backfills existing casting by stable ID without merging names or changing versions',async()=>{
 const migration='20261030055215_roster_editor.sql';const prior=await localDatabase({beforeMigration:migration});
 try{
  await prior.rpc('reader_admin_bootstrap',{p_user:owner,p_email:'owner@example.test',p_name:'Owner'});
  await prior.rpc('reader_publish',{p_slug:'before-upgrade',p_title:'Before upgrade',p_payload:preparePublication(csvFor(),'Tag,Name\nRo,Rowan\nMi,Mira')});
  const c=await prior.rpc('reader_staff_context',{p_actor:owner,p_slug:'before-upgrade'}) as RosterContext;
  const rows=[{studentId:'old-a',studentName:'김민준',className:'EPG',performance:'1부',tag:'Ro'},{studentId:'old-a',studentName:'김민준',className:'EPG',performance:'2부',tag:'Ro'},{studentId:'old-b',studentName:'김민준',className:'EPI',performance:'1부',tag:'Mi'}];
  const saved=await prior.rpc('reader_staff_context',{p_actor:owner,p_slug:'before-upgrade',p_action:'save',p_expected:c.version,p_production:c.productionVersion,p_rows:rows}) as {version:string};
  await prior.db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const upgraded=await prior.rpc('reader_roster',{p_actor:owner,p_slug:'before-upgrade'}) as RosterContext;
  expect(upgraded.students).toEqual([{id:'old-a',name:'김민준',className:'EPG',label:''},{id:'old-b',name:'김민준',className:'EPI',label:''}]);
  expect(upgraded.version).toBe(saved.version);expect(upgraded.productionVersion).toBe(c.productionVersion);expect(upgraded.assignments).toHaveLength(3);
  const legacy=await prior.rpc('reader_staff_context',{p_actor:owner,p_slug:'before-upgrade'}) as {assignments:unknown[]};expect(legacy.assignments).toEqual(rows);
 }finally{await prior.db.close();}
},60000);
