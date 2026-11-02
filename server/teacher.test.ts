// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest';
import { localDatabase } from './local-database';
import { preparePublication } from './publishing';
import { csvFor, syntheticRecords } from '../src/test/fixtures';
import { handleAdminApi } from './admin-api';
import { handleApi } from './api';
import type { AdminAuthFactory } from './admin-auth';
import type { TeacherContext } from '../src/admin/teacher';
let local: Awaited<ReturnType<typeof localDatabase>>;
const owner = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const pending = '00000000-0000-4000-8000-000000000003';
const env = { SUPABASE_URL:'https://unused.test',SUPABASE_SECRET_KEY:'test',SUPABASE_PUBLISHABLE_KEY:'test',ADMIN_ORIGIN:'https://reader.test',BROWSER_COOKIE_SECRET:'test-only-long-cookie-secret-not-production' };
const auth = (id: string | null): AdminAuthFactory => () => ({user:async()=>id?{id,email:'synthetic@example.test',name:'Synthetic'}:null,start:async()=>null,exchange:async()=>false,signOut:async()=>{}});
const path = 'productions/workshop/';
const csv = 'StudentId,StudentName,Class,Performance,Tag\ns1,PRIVATE_STUDENT_FIXTURE,Class A,1부,Ro\ns1,PRIVATE_STUDENT_FIXTURE,Class A,2부,Ro';
const cast = 'Tag,Name\nRo,Rowan\nMi,Mira';
const payload = preparePublication(csvFor(),cast);
async function api(route: string, method='GET', body?: unknown, id: string|null=(method==='GET'?staff:owner), origin='https://reader.test') {
 return handleAdminApi(new Request('https://reader.test/api/admin/'+route,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,local.rpc,auth(id));
}
async function context() { return await (await api(path+'viewer')).json() as TeacherContext; }
const input = (c:TeacherContext, changes={}) => ({expected:c.version,productionVersion:c.productionVersion,csv,...changes});
beforeAll(async()=>{
 local=await localDatabase();
 await local.rpc('reader_admin_bootstrap',{p_user:owner,p_email:'owner@example.test',p_name:'Owner'});
 for(const id of [staff,pending])await local.rpc('reader_admin_access',{p_action:'request',p_actor:id,p_email:'synthetic@example.test',p_name:'Synthetic'});
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'admin'});
 await local.rpc('reader_publish',{p_slug:'workshop',p_title:'Workshop',p_payload:payload});
},60000);
afterAll(async()=>local?.db.close());
it('denies private endpoints to signed-out and unapproved clients; rejects cross-site mutations',async()=>{
 for(const route of ['viewer','assignments','assignments/validate'])for(const id of [null,pending])expect((await api(path+route,route.endsWith('validate')?'POST':'GET',undefined,id)).status).toBe(id?403:401);
 expect((await api(path+'assignments','PATCH',{},staff,'https://evil.test')).status).toBe(403);
 const r=await api(path+'viewer');expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect((await api(path+'viewer','POST',{})).status).toBe(405);
 expect((await api(path+'viewer?unexpected=1')).status).toBe(400);
 expect((await api('productions/missing/viewer')).status).toBe(404);
});
it('previews without saving, revalidates on save, bounds uploads and strips full script from assignment context',async()=>{
 const c=await context();expect(c.version).toBeNull();
 expect((await api(path+'assignments/validate','POST',input(c))).status).toBe(200);
 expect((await context()).assignments).toEqual([]);
 expect((await api(path+'assignments','PATCH',input(c,{csv:csv+'\ns2,Other,B,1부,Ro'}))).status).toBe(422);
 expect((await api(path+'assignments','PATCH',input(c,{csv:'x'.repeat(5*1024*1024)}))).status).toBe(413);
 expect((await api(path+'assignments','PATCH',{...input(c),p_actor:owner})).status).toBe(400);
 expect((await (await api(path+'assignments')).json()).payload).toBeUndefined();
 expect((await api(path+'assignments','PATCH',input(c))).status).toBe(200);
 expect((await context()).assignments).toHaveLength(2);
 expect((await api(path+'assignments','PATCH',input(c))).status).toBe(409);
});
it('serializes competing replacements and rejects validation against changed script metadata',async()=>{
 const c=await context();
 const responses=await Promise.all([api(path+'assignments','PATCH',input(c)),api(path+'assignments','PATCH',input(c))]);
 expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 const next=await context();
 await local.rpc('reader_manage_productions',{p_actor:staff,p_action:'settings',p_slug:'workshop',p_expected:next.productionVersion,p_data:{title:'Workshop revised',before:2,after:1}});
 expect((await api(path+'assignments/validate','POST',input(next))).status).toBe(409);
});
it('keeps public metadata, passages, song metadata and immutable revisions free of student data',async()=>{
 const publicRequest=(suffix:string,body:unknown)=>handleApi(new Request('https://reader.test/api/productions/workshop'+suffix,{method:'POST',headers:{Origin:'https://reader.test','Content-Type':'application/json'},body:JSON.stringify(body)}),env,local.rpc);
 const metadata=await publicRequest('',{});expect(metadata.status).toBe(200);expect(await metadata.clone().text()).not.toContain('PRIVATE_STUDENT_FIXTURE');
 const meta=await metadata.json();
 const passages=await publicRequest('/passages',{character:'Ro',revision:meta.revision,before:2,after:1,includeNonDialogue:true});
 expect(passages.status).toBe(200); expect(await passages.text()).not.toContain('PRIVATE_STUDENT_FIXTURE');
 expect(await (await api(path+'songs')).text()).not.toContain('PRIVATE_STUDENT_FIXTURE');
 const revisions=await local.db.query('select payload from public.reader_revisions');expect(JSON.stringify(revisions.rows)).not.toContain('PRIVATE_STUDENT_FIXTURE');
});
it('blocks tag removal in browser validation and direct CLI publication without changing active revision',async()=>{
 const c=await context();
 const removed=preparePublication(csvFor(syntheticRecords.filter(r=>!r.Tag.split(';').includes('Ro'))),'Tag,Name\nMi,Mira');
 const revision=(await local.db.query('select active_revision from reader_productions')).rows;
 await expect(local.rpc('reader_publish',{p_slug:'workshop',p_title:'Unsafe',p_payload:removed})).rejects.toThrow('Update or remove assignments');
 expect((await local.db.query('select active_revision from reader_productions')).rows).toEqual(revision);
 expect((await api('productions/validate','POST',{slug:'workshop',title:'Workshop',before:2,after:1,expected:c.productionVersion,script:csvFor(syntheticRecords.filter(r=>!r.Tag.split(';').includes('Ro'))),cast:'Tag,Name\nMi,Mira'})).status).toBe(422);
});
it('requires current membership inside database operations and prevents direct browser roles reading or writing',async()=>{
 await local.db.exec('set role service_role');
 try {
  expect((await local.rpc('reader_staff_context',{p_actor:pending,p_slug:'workshop'}))).toEqual({error:'forbidden'});
  const c=await context();expect(c.assignments).toHaveLength(2);
  expect(await local.rpc('reader_staff_context',{p_actor:owner,p_slug:'workshop',p_action:'save',p_expected:c.version,p_production:c.productionVersion,p_rows:[{studentId:'s',studentName:'Bad',className:'A',performance:'1부',tag:'Unknown'}]})).toEqual({error:'validation'});
 }finally{await local.db.exec('reset role');}
 for(const role of ['anon','authenticated']){
  await local.db.exec('set role '+role);
  try {
   await expect(local.db.query('select * from reader_assignment_sets')).rejects.toThrow(/permission denied/);
   await expect(local.rpc('reader_staff_context',{p_actor:staff,p_slug:'workshop'})).rejects.toThrow(/permission denied/);
   await expect(local.db.exec("update reader_assignment_sets set assignments='[]'::jsonb")).rejects.toThrow(/permission denied/);
  }finally{await local.db.exec('reset role');}
 }
});
it('deletes without assignment history, preserves script, and revokes access on subsequent requests',async()=>{
 const c=await context();
 expect((await api(path+'assignments','PATCH',{expected:c.version,productionVersion:c.productionVersion,clear:true})).status).toBe(200);
 expect((await context()).assignments).toEqual([]);
 const stored=await local.db.query('select assignments from reader_assignment_sets');expect(stored.rows).toEqual([{assignments:[]}]);
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'revoked'});
 expect((await api(path+'viewer')).status).toBe(403);
 expect((await api(path+'assignments','PATCH',input(c),staff)).status).toBe(403);
});
