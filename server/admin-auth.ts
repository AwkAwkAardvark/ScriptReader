import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import type { AdminIdentity } from '../src/admin/protocol';
import type { Environment } from './api';

export interface AdminAuth {
  user(): Promise<AdminIdentity | null>;
  start(): Promise<string | null>;
  exchange(code: string): Promise<boolean>;
  signOut(): Promise<void>;
}
export type AdminAuthFactory = (request: Request, env: Environment, headers: Headers) => AdminAuth;

/** Fixed production callback; loopback HTTP is only for local development. */
export function adminOrigin(request: Request, env: Environment): string {
  const url = new URL(request.url);
  if (env.ADMIN_ORIGIN) {
    const configured = new URL(env.ADMIN_ORIGIN);
    if (configured.origin !== env.ADMIN_ORIGIN || configured.protocol !== 'https:' || configured.origin !== url.origin) throw new Error('Invalid admin origin');
    return configured.origin;
  }
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
  throw new Error('Admin origin is not configured');
}

export const createAdminAuth: AdminAuthFactory = (request, env, headers) => {
  const origin = adminOrigin(request, env);
  const secure = new URL(origin).protocol === 'https:';
  if (!env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_URL.startsWith('https://')) throw new Error('Authentication unavailable');
  const cookieName = secure ? '__Host-sr-admin-auth' : 'sr-admin-auth';
  const cookies = new Map(parseCookieHeader(request.headers.get('Cookie') ?? '').map(cookie => [cookie.name, cookie.value ?? '']));
  const writes = new Map<string, string>();
  const write = (name: string, value: string, options: Parameters<typeof serializeCookieHeader>[2] = {}) => {
    cookies.set(name, value);
    // Normal writes are browser-session cookies, including refreshed/chunked sessions.
    // Keep expiration only for deletion. SDK defaults must not turn these persistent.
    const sessionOptions: CookieOptions = { ...options, httpOnly: true, secure, sameSite: 'lax' as const, path: '/', domain: undefined, maxAge: undefined, expires: undefined };
    if (!value) sessionOptions.maxAge = 0;
    writes.set(name, serializeCookieHeader(name, value, sessionOptions));
    headers.delete('Set-Cookie');
    for (const cookie of writes.values()) headers.append('Set-Cookie', cookie);
  };
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { name: cookieName, httpOnly: true, secure, sameSite: 'lax', path: '/' },
    cookies: {
      encode: 'tokens-only',
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values, cacheHeaders) => {
        for (const [name, value] of Object.entries(cacheHeaders)) headers.set(name, value);
        for (const cookie of values) write(cookie.name, cookie.value, cookie.options);
      },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  const user = async (): Promise<AdminIdentity | null> => {
    const { data, error } = await client.auth.getUser();
    const current = data.user;
    if (error || !current || !current.email || !current.email_confirmed_at || !current.identities?.some(identity => identity.provider === 'google')) return null;
    // Display metadata is untrusted text; it never determines identity or permissions.
    const display = current.user_metadata?.full_name;
    return { id: current.id, email: current.email.slice(0, 320), name: (typeof display === 'string' && display.trim() ? display : current.email).slice(0, 200) };
  };
  return {
    user,
    start: async () => {
      // Avoid sending the user into a provider flow that has not been enabled yet.
      const settings = await fetch(new URL('/auth/v1/settings', env.SUPABASE_URL), {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY! }, signal: AbortSignal.timeout(15000),
      });
      if (!settings.ok || (await settings.json() as { external?: { google?: boolean } }).external?.google !== true) return null;
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: origin + '/api/admin/auth/callback', scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true,
      } });
      return error ? null : data.url;
    },
    exchange: async code => {
      if (!cookies.get(cookieName + '-code-verifier')) return false;
      const { error } = await client.auth.exchangeCodeForSession(code);
      return !error && Boolean(await user());
    },
    signOut: async () => {
      try { await client.auth.signOut({ scope: 'local' }); }
      finally {
        for (const name of cookies.keys()) if (name === cookieName || name.startsWith(cookieName + '.')) write(name, '');
        write(cookieName + '-code-verifier', '');
      }
    },
  };
};
