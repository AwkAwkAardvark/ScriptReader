import type {Environment} from './api';
import {createAdminAuth,type AdminAuthFactory} from './admin-auth';
import {supabaseRpc,type Rpc} from './database';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleQuotaAdmin(request:Request,env:Environment,rpcOverride?:Rpc,authFactory:AdminAuthFactory=createAdminAuth){
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',Pragma:'no-cache',Vary:'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});const error=(code:string,status:number)=>json({error:code},status);
 const url=new URL(request.url);const action=url.pathname==='/api/admin/quotas/today'?'today':url.pathname==='/api/admin/quotas/reset'?'reset':null;
 if(!action)return error('not_found',404);const method=action==='today'?'GET':'POST';if(request.method!==method){headers.set('Allow',method);return error('invalid_request',405);}if(url.search)return error('invalid_request',400);if(action==='reset'&&request.headers.get('Origin')!==url.origin)return error('forbidden',403);
 try{
  const user=await authFactory(request,env,headers).user();if(!user||!uuid.test(user.id))return error('unauthorized',401);
  const rpc=rpcOverride??supabaseRpc(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY);
  let body:{expectedDay:string;operationId:string}|undefined;
  if(action==='reset'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return error('invalid_request',400);
   const reader=request.body?.getReader();if(!reader)return error('invalid_request',400);let length=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();return error('invalid_request',413);}chunks.push(value);}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return error('invalid_request',400);}
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||typeof input.expectedDay!=='string'||!/^\d{4}-\d\d-\d\d$/.test(input.expectedDay)||Number(input.expectedDay.slice(0,4))===0||!Number.isFinite(Date.parse(input.expectedDay))||new Date(input.expectedDay).toISOString().slice(0,10)!==input.expectedDay||typeof input.operationId!=='string'||!uuid.test(input.operationId))return error('invalid_request',400);body=input;
  }
  const result=await rpc('reader_quota_admin',{p_actor:user.id,p_action:action,...(body?{p_expected_day:body.expectedDay,p_operation:body.operationId}:{})}) as {error?:string;day:string;count:number;operationId?:string};
  if(result.error)return error(['forbidden','invalid_request','day_changed'].includes(result.error)?result.error:'unavailable',result.error==='forbidden'?403:result.error==='invalid_request'?400:result.error==='day_changed'?409:503);
  return json({day:result.day,count:result.count,...(action==='reset'?{operationId:result.operationId}:{})});
 }catch{return error('unavailable',503);}
}
