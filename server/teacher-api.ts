import { parseAssignments } from '../src/assignments';
import type { TeacherContext } from '../src/admin/teacher';
import { createAdminAuth, type AdminAuthFactory } from './admin-auth';
import type { Environment } from './api';
import { supabaseRpc, type Rpc } from './database';
const limit = 5 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function handleTeacherApi(request: Request, env: Environment, rpcOverride?: Rpc, authFactory: AdminAuthFactory = createAdminAuth) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Cookie',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const problem = (error: string, status: number) => json({ error }, status);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/admin\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(viewer|assignments)(\/validate)?$/);
  if (!match || match[1].length > 80 || match[2] === 'viewer' && match[3]) return problem('not_found', 404);
  const validation = Boolean(match[3]);
  const method = match[2] === 'viewer' ? 'GET' : validation ? 'POST' : request.method === 'GET' ? 'GET' : 'PATCH';
  if (request.method !== method) { headers.set('Allow', method); return problem('invalid_request', 405); }
  if (url.search) return problem('invalid_request', 400);
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) return problem('forbidden', 403);
  try {
    const user = await authFactory(request, env, headers).user();
    if (!user || !uuid.test(user.id)) return problem('unauthorized', 401);
    const rpc = rpcOverride ?? supabaseRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const result = await rpc('reader_staff_context', { p_actor: user.id, p_slug: match[1] }) as TeacherContext & { error?: string };
    if (result.error) return problem(result.error, result.error === 'not_found' ? 404 : 403);
    if (method === 'GET') {
      if (match[2] === 'viewer') return json(result);
      // Upload validation needs the roster, not a copy of the full script.
      const { payload: _payload, ...context } = result;
      return json(context);
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return problem('invalid_request', 400);
    const reader = request.body?.getReader();
    if (!reader) return problem('invalid_request', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); return problem('too_large', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return problem('invalid_request', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['csv', 'clear', 'expected', 'productionVersion'].includes(key))
      || body.expected !== null && (typeof body.expected !== 'string' || !uuid.test(body.expected))
      || typeof body.productionVersion !== 'string' || !uuid.test(body.productionVersion)
      || body.clear !== undefined && body.clear !== true || body.clear === true && (body.csv !== undefined || validation)
      || body.clear !== true && typeof body.csv !== 'string') return problem('invalid_request', 400);
    if (result.version !== body.expected || result.productionVersion !== body.productionVersion) return problem('conflict', 409);
    const parsed = body.clear === true ? { ok: true as const, assignments: [], warnings: [] } : parseAssignments(body.csv, result.characters);
    if (!parsed.ok) return json({ error: 'validation', diagnostics: parsed.errors }, 422);
    if (validation) return json({ assignments: parsed.assignments, warnings: parsed.warnings });
    const saved = await rpc('reader_staff_context', { p_action: body.clear === true ? 'clear' : 'import', p_actor: user.id, p_slug: match[1], p_expected: body.expected,
      p_production: body.productionVersion, p_rows: parsed.assignments }) as { error?: string };
    return saved.error ? problem(saved.error, saved.error === 'conflict' ? 409 : saved.error === 'validation' ? 422 : saved.error === 'not_found' ? 404 : 403) : json(saved);
  } catch { return problem('unavailable', 503); }
}
