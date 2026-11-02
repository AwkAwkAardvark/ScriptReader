import {parseAssignments,type Assignment} from '../src/assignments';
import {parseRosterBackup,rosterChanges,rosterFromCsv} from '../src/roster-backup';
import {validateRoster,type Roster,type RosterContext} from '../src/roster';
import {createAdminAuth,type AdminAuthFactory} from './admin-auth';
import type {Environment} from './api';
import {supabaseRpc,type Rpc} from './database';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleRosterBulk(request:Request,env:Environment,rpcOverride?:Rpc,authFactory:AdminAuthFactory=createAdminAuth){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'private, no-store',Pragma:'no-cache',Vary:'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});const error=(code:string,status:number)=>json({error:code},status);
 const url=new URL(request.url);const match=url.pathname.match(/^\/api\/admin\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/roster\/bulk(\/validate)?$/);
 if(!match||match[1].length>80)return error('not_found',404);if(request.method!=='POST'){headers.set('Allow','POST');return error('invalid_request',405);}if(url.search)return error('invalid_request',400);if(request.headers.get('Origin')!==url.origin)return error('forbidden',403);
 try{
  const user=await authFactory(request,env,headers).user();if(!user||!uuid.test(user.id))return error('unauthorized',401);
  const rpc=rpcOverride??supabaseRpc(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY);
  const membership=await rpc('reader_admin_access',{p_actor:user.id,p_action:'me'}) as {account?:{role:string;status:string}};
  if(membership.account?.status!=='approved'||membership.account.role!=='master')return error('forbidden',403);
  const context=await rpc('reader_roster',{p_actor:user.id,p_slug:match[1]}) as RosterContext&{error?:string};if(context.error)return error(context.error,context.error==='not_found'?404:403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return error('invalid_request',400);
  const reader=request.body?.getReader();if(!reader)return error('invalid_request',400);const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();return error('too_large',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return error('invalid_request',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||!['restore','csv_import','clear'].includes(body.action)||body.expected!==null&&(typeof body.expected!=='string'||!uuid.test(body.expected))||typeof body.productionVersion!=='string'||!uuid.test(body.productionVersion))return error('invalid_request',400);
  const allowed=['action','expected','productionVersion',...(body.action==='restore'?['backup']:body.action==='csv_import'?['csv']:[])];if(Object.keys(body).some(key=>!allowed.includes(key)))return error('invalid_request',400);
  if(body.expected!==context.version||body.productionVersion!==context.productionVersion)return error('conflict',409);
  let roster:Roster;let rows:Assignment[]=[];let warnings:unknown[]=[];
  if(body.action==='restore'){const result=parseRosterBackup(body.backup,match[1],context.characters);if(!result.ok)return json({error:'validation',diagnostics:result.errors},422);roster=result.roster;}
  else if(body.action==='csv_import'){
   if(typeof body.csv!=='string')return error('invalid_request',400);const parsed=parseAssignments(body.csv,context.characters);if(!parsed.ok)return json({error:'validation',diagnostics:parsed.errors},422);rows=parsed.assignments;warnings=parsed.warnings;
   const result=validateRoster(rosterFromCsv(context,rows),context.characters);if(!result.ok)return json({error:'validation',diagnostics:result.errors},422);roster=result.roster;
  }else roster={students:[],assignments:[]};
  const changes=rosterChanges(context,roster);if(match[2])return json({action:body.action,roster,changes,warnings});
  // Both RPCs must recheck master membership inside their serialized mutation transaction.
  const result=await (body.action==='csv_import'?rpc('reader_staff_context',{p_action:'import',p_actor:user.id,p_slug:match[1],p_expected:body.expected,p_production:body.productionVersion,p_rows:rows}):rpc('reader_roster',{p_action:body.action,p_actor:user.id,p_slug:match[1],p_expected:body.expected,p_production:body.productionVersion,p_students:roster.students,p_roles:roster.assignments})) as {error?:string};
  return result.error?error(result.error,result.error==='conflict'?409:result.error==='validation'?422:result.error==='not_found'?404:result.error==='invalid_request'?400:403):json(result);
 }catch{return error('unavailable',503);}
}
