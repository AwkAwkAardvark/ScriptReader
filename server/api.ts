import { validContextCount } from '../src/context';
import type { ApiProblem, Counts } from '../src/hosted/protocol';
import { passageBundle } from './passages';
import { supabaseRpc, type FetchArgs, type FetchResult, type Rpc } from './database';

export type Environment = {
  SUPABASE_URL: string; SUPABASE_SECRET_KEY: string; BROWSER_COOKIE_SECRET: string;
  SUPABASE_PUBLISHABLE_KEY?: string; ADMIN_ORIGIN?: string;
  BROWSER_REQUESTS_PER_MINUTE?: string; IP_REQUESTS_PER_MINUTE?: string; NEW_IDENTITIES_PER_MINUTE?: string;
};
const encoder = new TextEncoder();
const cookieName = '__Host-sr-browser';
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function constantEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function identity(request: Request, secret: string) {
  const cookie = request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const parts = cookie?.split('.');
  if (parts?.length === 2 && /^[a-f0-9-]{36}$/.test(parts[0]) && constantEqual(parts[1], await hmac(secret, `cookie:${parts[0]}`))) {
    return { id: parts[0], isNew: false, cookie: null };
  }
  const id = crypto.randomUUID();
  return { id, isNew: true, cookie: `${cookieName}=${id}.${await hmac(secret, `cookie:${id}`)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=15552000` };
}
const limit = (value: string | undefined, fallback: number) => value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : fallback;
const statusFor = { not_found: 404, invalid_request: 400, quota: 429, rate: 429, revision_changed: 409, unavailable: 503 };
export async function handleApi(request: Request, env: Environment, rpcOverride?: Rpc): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', Vary: 'Cookie' });
  const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  const problem = (error: ApiProblem['error']) => respond({ error }, statusFor[error]);
  try {
    if (!env.BROWSER_COOKIE_SECRET || env.BROWSER_COOKIE_SECRET.length < 32) return problem('unavailable');
    const url = new URL(request.url);
    if (url.pathname === '/api/home') {
      if (request.method !== 'GET' || url.search) return problem('invalid_request');
      const rpc = rpcOverride ?? supabaseRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
      return respond(await rpc('reader_home', {}));
    }
    const route = url.pathname.match(/^\/api\/productions\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/passages)?$/);
    if (!route || route[1].length > 80) return problem('not_found');
    if (request.method !== 'POST') return respond({ error: 'invalid_request' }, 405);
    // Same-origin requests only. This complements server permissions, not caller identity.
    if (request.headers.get('Origin') !== url.origin) return respond({ error: 'invalid_request' }, 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return problem('invalid_request');
    const reader = request.body?.getReader();
    if (!reader) return problem('invalid_request');
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); return respond({ error: 'invalid_request' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return problem('invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return problem('invalid_request');
    let counts: Counts | undefined;
    if (route[2]) {
      if (typeof body.character !== 'string' || body.character.length < 1 || body.character.length > 200 ||
        typeof body.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(body.revision) ||
        typeof body.includeNonDialogue !== 'boolean' ||
        ![body.before, body.after].every(validContextCount)) return problem('invalid_request');
      counts = { before: body.before as number, after: body.after as number, includeNonDialogue: body.includeNonDialogue };
    }
    const browser = await identity(request, env.BROWSER_COOKIE_SECRET);
    if (browser.cookie) headers.set('Set-Cookie', browser.cookie);
    // CF-Connecting-IP is supplied by Cloudflare in production; never trust forwarded client IDs.
    const args: FetchArgs = { p_slug: route[1], p_browser: await hmac(env.BROWSER_COOKIE_SECRET, `browser:${browser.id}`),
      p_ip: await hmac(env.BROWSER_COOKIE_SECRET, `ip:${request.headers.get('CF-Connecting-IP') ?? 'local'}`),
      p_new_browser: browser.isNew, p_character: counts ? body.character as string : null,
      p_revision: counts ? body.revision as string : null,
      p_browser_limit: limit(env.BROWSER_REQUESTS_PER_MINUTE, 60), p_ip_limit: limit(env.IP_REQUESTS_PER_MINUTE, 1200),
      p_identity_limit: limit(env.NEW_IDENTITIES_PER_MINUTE, 120) };
    const rpc = rpcOverride ?? supabaseRpc(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const result = await rpc('reader_fetch', args) as FetchResult;
    if ('error' in result) {
      if (result.retryAfter) headers.set('Retry-After', String(result.retryAfter));
      return respond(result, statusFor[result.error]);
    }
    if (!counts) return respond(result.production);
    if (!result.payload) return problem('unavailable');
    return respond(passageBundle(result.production, result.payload, body.character as string, counts));
  } catch {
    // Database diagnostics and payloads must not enter public responses or request logs.
    return problem('unavailable');
  }
}
