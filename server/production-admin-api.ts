import { resolveSongLinks, type SongContext, type MediaEdits } from '../src/song-links';
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
  const validate = url.pathname === '/api/admin/productions/validate' && request.method === 'POST';
  const match = validate ? null : url.pathname.match(/^\/api\/admin\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/publish|\/songs)?$/);
  const slug = match?.[1];
  const songRoute = match?.[2] === '/songs';
  const publish = collection && request.method === 'POST' || match?.[2] === '/publish';
  const expectedMethod = songRoute ? (request.method === 'GET' ? 'GET' : 'PATCH') : home || (match && !publish) ? 'PATCH' : validate || publish ? 'POST' : 'GET';
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
    if (request.method === 'GET' && songRoute) {
      const context = await rpc('reader_song_context', { p_slug: slug, p_actor: user.id }) as SongContext;
      return context.error ? error('forbidden', 403) : context.version ? json({songs:context.songs,version:context.version}) : error('not_found',404);
    }
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
    const allowed = songRoute ? ['expected','mediaEdits'] : home ? ['slug', 'expected'] : validate || publish ? ['slug', 'title', 'before', 'after', 'expected', 'script', 'cast', 'media', 'mediaEdits', 'acknowledgeUnmatched'] : ['title', 'before', 'after', 'expected'];
    if (Object.keys(body).some(key => !allowed.includes(key))) return error('invalid_request', 400);
    if (body.expected !== null && (typeof body.expected !== 'string' || !uuid.test(body.expected))) return error('invalid_request', 400);
    const edits = body.mediaEdits ?? {};
    if (!edits || typeof edits !== 'object' || Array.isArray(edits) || Object.values(edits).some(v=>v!==null && typeof v!=='string')) return error('invalid_request',400);
    if (body.acknowledgeUnmatched !== undefined && typeof body.acknowledgeUnmatched !== 'boolean') return error('invalid_request',400);
    if (home) {
      if (body.slug !== null && (typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) || body.slug.length > 80)) return error('invalid_request', 400);
    } else if (!songRoute) {
      if (typeof body.title !== 'string' || !validContextCount(body.before) || !validContextCount(body.after)) return error('invalid_request', 400);
      try { validateProduction(slug ?? String(body.slug ?? ''), body.title); } catch { return error('invalid_request', 400); }
    }
    let payload;
    let context: SongContext | undefined;
    if (validate || publish || songRoute) {
      context = await rpc('reader_song_context', {p_slug:slug ?? body.slug,p_actor:user.id}) as SongContext;
      if(context.error)return error('forbidden',403);
      if(context.version!==body.expected)return error('conflict',409);
    }
    if(songRoute) {
      if(!context?.payload)return error('not_found',404);
      try { payload=resolveSongLinks(context.payload,context.songs,edits as MediaEdits).payload; }
      catch(value){return json({error:'validation',diagnostics:value instanceof PublicationError?value.message:'Invalid song links.'},422);}
      const result=await rpc('reader_publish_checked',{p_slug:slug,p_title:context.title,p_payload:payload,p_expected:body.expected,p_actor:user.id}) as {error?:string};
      return result.error?error(result.error,result.error==='conflict'?409:403):json(result);
    }
    if (validate || publish) {
      if (typeof body.script !== 'string' || typeof body.cast !== 'string' || body.media !== undefined && typeof body.media !== 'string') return error('invalid_request', 400);
      try {
        const resolved=resolveSongLinks(preparePublication(body.script, body.cast, body.media as string | undefined),context?.songs,edits as MediaEdits);
        payload=resolved.payload;
        if(validate)return json({records:payload.script.records.length,characters:payload.script.characters.length,videos:Object.keys(payload.media).length,media:payload.media,songs:resolved.songs,unmatched:resolved.unmatched});
        if(resolved.unmatched.length && body.acknowledgeUnmatched!==true)return json({error:'needs_review',diagnostics:'Review unmatched existing songs before publishing.'},409);
      }
      catch (value) { return json({ error: 'validation', diagnostics: value instanceof PublicationError ? value.message : 'Invalid CSV files.' }, 422); }

    }
    if (collection && body.expected !== null) return error('invalid_request', 400);
    if(publish) {
      const result=await rpc('reader_publish_checked',{p_slug:slug??body.slug,p_title:(body.title as string).trim(),p_payload:payload,p_expected:body.expected,p_actor:user.id,p_before:body.before,p_after:body.after}) as {error?:string};
      return result.error?error(result.error,result.error==='conflict'?409:403):json(result);
    }
    const result = await rpc('reader_manage_productions', { p_action: home ? 'home' : publish ? 'publish' : 'settings', p_actor: user.id,
      p_slug: home ? body.slug : slug ?? body.slug, p_expected: body.expected,
      p_data: home ? {} : { title: (body.title as string).trim(), before: body.before, after: body.after, ...(payload ? { payload } : {}) } }) as { error?: string };
    return result.error ? error(result.error, result.error === 'conflict' ? 409 : result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 400) : json(result);
  } catch { return error('unavailable', 503); }
}
