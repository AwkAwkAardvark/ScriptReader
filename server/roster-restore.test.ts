// @vitest-environment node
import {beforeAll,afterAll,it,expect} from 'vitest';
import {localDatabase} from './local-database';
import {preparePublication} from './publishing';
import {handleAdminApi} from './admin-api';
import type {AdminAuthFactory} from './admin-auth';
import {rosterBackup} from '../src/roster-backup';
import {csvFor} from '../src/test/fixtures';
import type {RosterContext} from '../src/roster';
let local:Awaited<ReturnType<typeof localDatabase>>;
const owner='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002';
const students=[{id:'s1',name:'김민준',className:'EPG',label:'A'},{id:'s2',name:'이서연',className:'EPI',label:''}];
const context=async()=>await local.rpc('reader_roster',{p_actor:staff,p_slug:'restore-test'}) as RosterContext;
const args=(c:RosterContext)=>({p_actor:owner,p_slug:'restore-test',p_expected:c.version,p_production:c.productionVersion});
const events=async()=>(await local.db.query<any>('select * from reader_private.roster_audit_events order by occurred_at,id')).rows;
beforeAll(async()=>{local=await localDatabase();await local.rpc('reader_admin_bootstrap',{p_user:owner,p_email:'owner@example.test',p_name:'Owner'});await local.rpc('reader_admin_access',{p_actor:staff,p_action:'request',p_email:'staff@example.test',p_name:'Staff'});await local.rpc('reader_admin_access',{p_actor:owner,p_action:'change',p_target:staff,p_role:'admin'});await local.rpc('reader_publish',{p_slug:'restore-test',p_title:'Synthetic',p_payload:preparePublication(csvFor(),'Tag,Name\nRo,Rowan\nMi,Mira')});},60000);
afterAll(async()=>local?.db.close());
it('retains ordinary staff editing but denies every direct bulk alias and NULL action',async()=>{
 const c=await context();expect(await local.rpc('reader_roster',{...args(c),p_actor:staff,p_action:'save',p_students:students,p_roles:[]})).toHaveProperty('saved',true);
 const next=await context(),count=(await events()).length;
 for(const action of ['restore','clear'])expect(await local.rpc('reader_roster',{...args(next),p_actor:staff,p_action:action,p_students:[],p_roles:[]})).toEqual({error:'forbidden'});
 for(const action of ['save','import','clear'])expect(await local.rpc('reader_staff_context',{...args(next),p_actor:staff,p_action:action,p_rows:[]})).toEqual({error:'forbidden'});
 for(const rpc of ['reader_roster','reader_staff_context'])expect(await local.rpc(rpc,{...args(next),p_action:null})).toEqual({error:'invalid_request'});
 expect(await context()).toEqual(next);expect((await events()).length).toBe(count);
});
it('restores a complete snapshot, including removed students, labels and casting, atomically audited',async()=>{
 const c=await context();const value={p_students:[{...students[1],label:'복원'}],p_roles:[{studentId:'s2',tag:'Mi',performance:'2부'}]};
 expect(await local.rpc('reader_roster',{...args(c),p_action:'restore',...value})).toHaveProperty('saved',true);
 const next=await context();expect(next.students).toEqual(value.p_students);expect(next.assignments).toEqual(value.p_roles);const event=(await events()).at(-1);expect(event.action).toBe('restore');expect(event.actor_role).toBe('master');expect(event.before_version).toBe(c.version);expect(event.after_version).toBe(next.version);expect(JSON.stringify(event)).not.toMatch(/김민준|이서연|복원|EPG/);
 expect(await local.rpc('reader_roster',{...args(c),p_action:'restore',...value})).toEqual({error:'conflict'});
});
it('clears retained students with zero roles and serializes competing destructive operations',async()=>{
 let c=await context();await local.rpc('reader_roster',{...args(c),p_actor:staff,p_action:'save',p_students:c.students,p_roles:[]});c=await context();expect(c.students).toHaveLength(1);expect(c.assignments).toEqual([]);const count=(await events()).length;
 const result=await Promise.all([local.rpc('reader_roster',{...args(c),p_action:'clear',p_students:[],p_roles:[]}),local.rpc('reader_roster',{...args(c),p_action:'restore',p_students:students,p_roles:[]})]);expect(result.filter(v=>(v as any).saved)).toHaveLength(1);expect(result.filter(v=>(v as any).error==='conflict')).toHaveLength(1);expect((await events()).length).toBe(count+1);expect((await context()).students).toEqual([]);
});
it('rechecks revocation and rolls back a bulk mutation if audit insertion fails',async()=>{
 const c=await context(),count=(await events()).length;await local.db.exec("alter table reader_private.roster_audit_events add constraint synthetic_bulk_failure check(action<>'restore') not valid");
 try{await expect(local.rpc('reader_roster',{...args(c),p_action:'restore',p_students:students,p_roles:[]})).rejects.toThrow();expect(await context()).toEqual(c);expect((await events()).length).toBe(count);}finally{await local.db.exec('alter table reader_private.roster_audit_events drop constraint synthetic_bulk_failure');}
 await local.rpc('reader_admin_access',{p_actor:owner,p_action:'change',p_target:staff,p_role:'master'});await local.rpc('reader_admin_access',{p_actor:owner,p_action:'change',p_target:staff,p_role:'revoked'});expect(await local.rpc('reader_roster',{...args(c),p_actor:staff,p_action:'restore',p_students:students,p_roles:[]})).toEqual({error:'forbidden'});
});

it('denies a demoted actor even when an earlier HTTP membership check saw master',async()=>{
 // Simulate a membership change between the HTTP check and serialized RPC.
 await local.rpc('reader_admin_access',{p_actor:owner,p_action:'change',p_target:staff,p_role:'master'});
 const c=await context();const count=(await events()).length;
 const rpc=async(name:string,input:Record<string,unknown>)=>name==='reader_admin_access'?{account:{status:'approved',role:'master'}}:local.rpc(name,input);
 const auth:AdminAuthFactory=()=>({user:async()=>({id:owner,email:'synthetic@example.test',name:'Synthetic'}),start:async()=>null,exchange:async()=>false,signOut:async()=>{}});
 await local.rpc('reader_admin_access',{p_actor:staff,p_action:'change',p_target:owner,p_role:'admin'});
 const response=await handleAdminApi(new Request('https://reader.test/api/admin/productions/restore-test/roster/bulk',{method:'POST',headers:{Origin:'https://reader.test','Content-Type':'application/json'},body:JSON.stringify({action:'restore',expected:c.version,productionVersion:c.productionVersion,backup:rosterBackup('restore-test',c)})}),{SUPABASE_URL:'https://unused.test',SUPABASE_SECRET_KEY:'test',BROWSER_COOKIE_SECRET:'synthetic-cookie-secret-long-enough'},rpc,auth);
 expect(response.status).toBe(403);expect((await events()).length).toBe(count);
});
