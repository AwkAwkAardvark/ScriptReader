// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {handleAdminApi} from './admin-api';
import {rosterBackup} from '../src/roster-backup';
import type {RosterContext} from '../src/roster';
import type {AdminAuthFactory} from './admin-auth';
const owner='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002';
const version='11111111-1111-4111-8111-111111111111',production='22222222-2222-4222-8222-222222222222';
const context:RosterContext={title:'Rehearsal',version,productionVersion:production,characters:[{tag:'Gua1',label:'Guard One'}],students:[{id:'s1',name:'김민준',className:'EPG',label:'A'},{id:'s2',name:'김민준',className:'EPI',label:'Unassigned'}],assignments:[{studentId:'s1',tag:'Gua1',performance:'1부'}]};
const env={SUPABASE_URL:'https://unused.test',SUPABASE_SECRET_KEY:'fixture',BROWSER_COOKIE_SECRET:'synthetic-cookie-secret-long-enough'};
const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>name==='reader_admin_access'?{account:{status:'approved',role:args.p_actor===owner?'master':'admin'}}:args.p_action&&args.p_action!=='read'?{saved:true,version}:structuredClone(context));
const auth=(id:string|null):AdminAuthFactory=>()=>({user:async()=>id?{id,email:'fixture@example.test',name:'Fixture'}:null,start:async()=>null,exchange:async()=>false,signOut:async()=>{}});
async function request(suffix:string,body:unknown,id:string|null=owner,origin='https://reader.test',method='POST'){return handleAdminApi(new Request('https://reader.test/api/admin/productions/rehearsal/'+suffix,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),env,rpc,auth(id));}
const input=(action:string,extra={})=>({action,expected:version,productionVersion:production,...extra});
beforeEach(()=>vi.clearAllMocks());
it('previews full replacement including unassigned/label removals and never writes during validation',async()=>{
 const backup=rosterBackup('rehearsal',{students:[context.students[0]],assignments:[]});const response=await request('roster/bulk/validate',input('restore',{backup}));expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.json()).toMatchObject({changes:{students:1,assignments:0,removedStudents:1,removedAssignments:1}});expect(rpc.mock.calls.some(([,args])=>args.p_action==='restore')).toBe(false);
});
it('keeps export reads available to staff but denies every new and legacy bulk mutation/validation',async()=>{
 expect((await request('roster',undefined,staff,'https://reader.test','GET')).status).toBe(200);
 for(const suffix of ['roster/bulk','roster/bulk/validate','assignments','assignments/validate'])expect((await request(suffix,input('clear'),staff)).status).toBe(suffix==='assignments'?405:403);
 expect((await request('roster/bulk',input('clear'),null)).status).toBe(401);expect((await request('roster/bulk',input('clear'),owner,'https://foreign.test')).status).toBe(403);
 expect((await request('assignments',{clear:true,expected:version,productionVersion:production},staff,'https://reader.test','PATCH')).status).toBe(403);
});
it('validates production identity/current versions/strict schema and size before a write',async()=>{
 const backup=rosterBackup('elsewhere',context);expect((await request('roster/bulk',input('restore',{backup}))).status).toBe(422);expect((await request('roster/bulk',{...input('clear'),expected:null})).status).toBe(409);expect((await request('roster/bulk',{...input('clear'),role:'master'})).status).toBe(400);expect((await request('roster/bulk',input('clear',{backup:{}}))).status).toBe(400);expect((await request('roster/bulk',input('csv_import',{csv:'x'.repeat(5*1024*1024)}))).status).toBe(413);expect(rpc.mock.calls.some(([,args])=>['restore','clear','import'].includes(String(args.p_action)))).toBe(false);
});
it('delegates accepted restore/clear and CSV to transactionally checked audited RPC actions',async()=>{
 const backup=rosterBackup('rehearsal',context);expect((await request('roster/bulk',input('restore',{backup}))).status).toBe(200);expect(rpc).toHaveBeenCalledWith('reader_roster',expect.objectContaining({p_actor:owner,p_action:'restore',p_expected:version,p_production:production,p_students:context.students,p_roles:context.assignments}));
 expect((await request('roster/bulk',input('clear'))).status).toBe(200);expect(rpc).toHaveBeenCalledWith('reader_roster',expect.objectContaining({p_action:'clear',p_students:[],p_roles:[]}));
 const csv='StudentId,StudentName,Class,Performance,Tag\ns1,박지우,EI6,2부,Gua1';expect((await request('roster/bulk/validate',input('csv_import',{csv}))).status).toBe(200);const result=await request('roster/bulk',input('csv_import',{csv}));expect(result.status).toBe(200);expect(rpc).toHaveBeenCalledWith('reader_staff_context',expect.objectContaining({p_action:'import',p_rows:[{studentId:'s1',studentName:'박지우',className:'EI6',performance:'2부',tag:'Gua1'}]}));
});
