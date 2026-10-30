import { validateRoster, type RosterContext } from '../src/roster';
import { createAdminAuth, type AdminAuthFactory } from './admin-auth';
import type { Environment } from './api';
import { supabaseRpc, type Rpc } from './database';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleRosterApi(request:Request,env:Environment,rpcOverride?:Rpc,authFactory:AdminAuthFactory=createAdminAuth){
 const headers=new Headers({'Content-Type':'application/json','Cache-Control':'private, no-store',Pragma:'no-cache',Vary:'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});const error=(code:string,status:number)=>json({error:code},status);
 const url=new URL(request.url);const match=url.pathname.match(/^\/api\/admin\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/roster$/);
 if(!match||match[1].length>80)return error('not_found',404);
 if(!['GET','PATCH'].includes(request.method)){headers.set('Allow','GET, PATCH');return error('invalid_request',405);}
 if(url.search)return error('invalid_request',400);
 if(request.method==='PATCH'&&request.headers.get('Origin')!==url.origin)return error('forbidden',403);
 try{
  const user=await authFactory(request,env,headers).user();if(!user||!uuid.test(user.id))return error('unauthorized',401);
  const rpc=rpcOverride??supabaseRpc(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY);
  const context=await rpc('reader_roster',{p_actor:user.id,p_slug:match[1]}) as RosterContext&{error?:string};
  if(context.error)return error(context.error,context.error==='not_found'?404:403);
  if(request.method==='GET')return json(context);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return error('invalid_request',400);
  const reader=request.body?.getReader();if(!reader)return error('invalid_request',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();return error('too_large',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return error('invalid_request',400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['students','assignments','expected','productionVersion'].includes(key))||body.expected!==null&&(typeof body.expected!=='string'||!uuid.test(body.expected))||typeof body.productionVersion!=='string'||!uuid.test(body.productionVersion))return error('invalid_request',400);
  if(body.expected!==context.version||body.productionVersion!==context.productionVersion)return error('conflict',409);
  const result=validateRoster({students:body.students,assignments:body.assignments},context.characters,context.students);
  if(!result.ok)return json({error:'validation',diagnostics:result.errors},422);
  const saved=await rpc('reader_roster',{p_actor:user.id,p_slug:match[1],p_action:'save',p_expected:body.expected,p_production:body.productionVersion,p_students:result.roster.students,p_roles:result.roster.assignments}) as {error?:string};
  return saved.error?error(saved.error,saved.error==='conflict'?409:saved.error==='validation'?422:saved.error==='not_found'?404:403):json(saved);
 }catch{return error('unavailable',503);}
}
