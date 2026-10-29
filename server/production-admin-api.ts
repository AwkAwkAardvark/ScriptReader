import { createAdminAuth, type AdminAuthFactory } from './admin-auth';
import type { Environment } from './api';
import { supabaseRpc, type Rpc } from './database';
import { preparePublication, PublicationError, validateProduction } from './publishing';
import { validContextCount } from '../src/context';

export const ADMIN_UPLOAD_LIMIT = 5 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleProductionAdmin(request: Request, env: Environment, rpcOverride?: Rpc, authFactory: AdminAuthFactory = createAdminAuth) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Cookie',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const error = (code: string, status: number) => json({ error: code }, status);
  const url = new URL(request.url);
  const home = url.pathname === '/api/admin/home';
  const collection = url.pathname === '/api/admin/productions';
  const validate = url.pathname === '/api/admin/productions/validate';
  const match = validate ? null : url.pathname.match(/^\/api\/admin\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/publish)?$/);
  const slug = match?.[1];
  const publish = collection && request.method === 'POST' || Boolean(match?.[2]);
  const expectedMethod = home || (match && !publish) ? 'PATCH' : validate || publish ? 'POST' : 'GET';
  if (!home && !collection && !validate && !match) return error('not_found', 404);
  if (url.search) return error('invalid_request', 400);
  if (request.method !== expectedMethod) { headers.set('Allow', expectedMethod);return error('invalid_request', 405); }
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return error('forbidden', 403);
  try {
    const user = await authFactory(request, env, headers).user();
    if (!user) return error('unauthorized', 401);
    const rpc = rpcOverride ?? supabaseRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const membership = await rpc('reader_admin_access', { p_action: 'me', p_actor: user.id }) as { account?: { status: string } };
    if (membership.account?.status !== 'approved') return error('forbidden', 403);
    if (request.method === 'GET') {
      const listing = await rpc('reader_manage_productions', { p_action: 'list', p_actor: user.id }) as { error?: string };
      return listing.error ? error('forbidden', 403) : json(listing);
    }
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return error('invalid_request', 400);
    const reader = request.body?.getReader();if (!reader) return error('invalid_request', 400);
    const chunks: Uint8Array[] = [];let size = 0;
    while (true) { const { done, value } = await reader.read();if (done) break;size += value.length;
      if (size > ADMIN_UPLOAD_LIMIT) { await reader.cancel();return error('too_large', 413); }chunks.push(value); }
    const bytes = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return error('invalid_request', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('invalid_request', 400);
    const allowed = home ? ['slug', 'expected'] : validate || publish ? ['slug', 'title', 'before', 'after', 'expected', 'script', 'cast', 'media'] : ['title', 'before', 'after', 'expected'];
    if (Object.keys(body).some(key => !allowed.includes(key))) return error('invalid_request', 400);
    if (body.expected !== null && (typeof body.expected !== 'string' || !uuid.test(body.expected))) return error('invalid_request', 400);
    if (home) {
      if (body.slug !== null && (typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 80)) return error('invalid_request', 400);
    } else {
      if (typeof body.title !== 'string' || !validContextCount(body.before) || !validContextCount(body.after)) return error('invalid_request', 400);
      try { validateProduction(slug ?? String(body.slug ?? ''), body.title); } catch { return error('invalid_request', 400); }
    }
    let payload;
    if (validate || publish) {
      if (typeof body.script !== 'string' || typeof body.cast !== 'string' || body.media !== undefined && typeof body.media !== 'string') return error('invalid_request', 400);
      try { payload = preparePublication(body.script, body.cast, body.media as string | undefined); }
      catch (value) { return json({ error: 'validation', diagnostics: value instanceof PublicationError ? value.message : 'Invalid CSV files.' }, 422); }
      if (validate) return json({ records: payload.script.records.length, characters: payload.script.characters.length, videos: Object.keys(payload.media).length });
    }
    if (collection && body.expected !== null) return error('invalid_request', 400);
    const result = await rpc('reader_manage_productions', { p_action: home ? 'home' : publish ? 'publish' : 'settings', p_actor: user.id,
      p_slug: home ? body.slug : slug ?? body.slug, p_expected: body.expected,
      p_data: home ? {} : { title: (body.title as string).trim(), before: body.before, after: body.after, ...(payload ? { payload } : {}) } }) as { error?: string };
    return result.error ? error(result.error, result.error === 'conflict' ? 409 : result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 400) : json(result);
  } catch { return error('unavailable', 503); }
}
