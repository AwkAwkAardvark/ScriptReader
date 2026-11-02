import {handleQuotaAdmin} from './quota-admin-api';
import {handleRosterBulk} from './roster-bulk-api';
import { handleRosterApi } from './roster-api';
import { handleTeacherApi } from './teacher-api';
import { handleProductionAdmin } from './production-admin-api';
import type { AdminAccount, AdminError } from '../src/admin/protocol';
import type { Environment } from './api';
import { supabaseRpc, type Rpc } from './database';
import { createAdminAuth, type AdminAuthFactory } from './admin-auth';

const statuses: Record<AdminError, number> = { unauthorized: 401, forbidden: 403, invalid_request: 400,
  not_found: 404, last_master: 409, master_limit: 409, unavailable: 503, auth_not_ready: 503 };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type AccessResult = { account?: AdminAccount | null; accounts?: AdminAccount[]; error?: AdminError };

export async function handleAdminApi(request: Request, env: Environment, rpcOverride?: Rpc, authFactory: AdminAuthFactory = createAdminAuth): Promise<Response> {
  if (/^\/api\/admin\/quotas(?:\/|$)/.test(new URL(request.url).pathname)) return handleQuotaAdmin(request,env,rpcOverride,authFactory);
  if (/^\/api\/admin\/productions\/[^/]+\/roster\/bulk(?:\/|$)/.test(new URL(request.url).pathname)) return handleRosterBulk(request, env, rpcOverride, authFactory);
  if (/^\/api\/admin\/productions\/[^/]+\/roster(?:\/|$)/.test(new URL(request.url).pathname)) return handleRosterApi(request, env, rpcOverride, authFactory);
  if (/^\/api\/admin\/productions\/[^/]+\/(viewer|assignments)(?:\/|$)/.test(new URL(request.url).pathname)) return handleTeacherApi(request, env, rpcOverride, authFactory);
  if (/^\/api\/admin\/(productions(?:\/|$)|home$)/.test(new URL(request.url).pathname)) return handleProductionAdmin(request, env, rpcOverride, authFactory);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    Pragma: 'no-cache', Vary: 'Cookie', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", 'X-Frame-Options': 'DENY' });
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  const problem = (error: AdminError) => json({ error }, statuses[error]);
  const redirect = (success: boolean) => { headers.set('Location', success ? '/admin' : '/admin?auth=failed');return new Response(null, { status: 303, headers }); };
  const url = new URL(request.url);
  const path = url.pathname;
  const callback = path === '/api/admin/auth/callback';
  const me = path === '/api/admin/me';
  const accounts = path === '/api/admin/accounts';
  const nameTarget=path.match(/^\/api\/admin\/accounts\/([a-f0-9-]+)\/display-name$/i)?.[1];
  const target = nameTarget??path.match(/^\/api\/admin\/accounts\/([a-f0-9-]+)$/i)?.[1];
  const allowed = callback || me || accounts || target || ['/api/admin/auth/start', '/api/admin/auth/logout', '/api/admin/requests'].includes(path);
  if (!allowed) return problem('not_found');
  const expected = callback || me || accounts ? 'GET' : target ? 'PATCH' : 'POST';
  if (request.method !== expected) { headers.set('Allow', expected);return json({ error: 'invalid_request' }, 405); }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return problem('forbidden');
  if (url.search && (!callback || [...url.searchParams.keys()].some(key => !['code', 'error', 'error_code', 'error_description'].includes(key)))) return callback ? redirect(false) : problem('invalid_request');
  try {
    const configured = Boolean(env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_URL && (env.ADMIN_ORIGIN || ['localhost', '127.0.0.1'].includes(url.hostname)));
    if (!configured) return me ? json({ configured: false, user: null, account: null }) : callback ? redirect(false) : problem('auth_not_ready');
    const auth = authFactory(request, env, headers);
    if (callback) {
      const codes = url.searchParams.getAll('code');
      return redirect(codes.length === 1 && codes[0].length <= 2048 && !url.searchParams.has('error') && await auth.exchange(codes[0]));
    }
    if (path === '/api/admin/auth/start') {
      const login = await auth.start();
      return login ? json({ url: login }) : problem('auth_not_ready');
    }
    if (path === '/api/admin/auth/logout') { await auth.signOut();return json({ signedOut: true }); }
    const user = await auth.user();
    if (!user || !uuid.test(user.id)) return me ? json({ configured: true, user: null, account: null }) : problem('unauthorized');
    const rpc = rpcOverride ?? supabaseRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const action = me ? 'me' : accounts ? 'list' : target ? 'change' : 'request';
    let role: string | null = null;let displayName:string|null=null;
    if (target) {
      if (!uuid.test(target) || !request.headers.get('Content-Type')?.startsWith('application/json')) return problem('invalid_request');
      const reader = request.body?.getReader();
      if (!reader) return problem('invalid_request');
      const chunks: Uint8Array[] = [];let length = 0;
      while (true) { const { value, done } = await reader.read();if (done) break;length += value.length;
        if (length > 4096) { await reader.cancel();return json({ error: 'invalid_request' }, 413); }chunks.push(value); }
      const bytes = new Uint8Array(length);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
      let body: unknown;try { body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { return problem('invalid_request'); }
      if(nameTarget){
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!('name' in body)||body.name!==null&&(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||/[\u0000-\u001f\u007f-\u009f]/.test(body.name)))return problem('invalid_request');
        displayName=body.name===null?null:(body.name as string).trim();
      }else {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('role' in body) || !['admin', 'master', 'revoked'].includes(String(body.role))) return problem('invalid_request');
      role = String(body.role);
      }
    }
    const result = await (nameTarget?rpc('reader_admin_display_name',{p_actor:user.id,p_target:target,p_name:displayName}):rpc('reader_admin_access', { p_action: action, p_actor: user.id, p_email: user.email, p_name: user.name,
      p_target: target ?? null, p_role: role })) as AccessResult;
    if (result.error) return problem(result.error in statuses ? result.error : 'unavailable');
    if (me) return json({ configured: true, user:{...user,name:result.account?.name??user.name}, account: result.account ?? null });
    return json(result);
  } catch { return callback ? redirect(false) : problem('unavailable'); }
}
