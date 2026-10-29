// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminAuth, adminOrigin } from './admin-auth';

const env = { SUPABASE_URL: 'https://project.example.test', SUPABASE_SECRET_KEY: 'server-not-used-by-auth',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key', BROWSER_COOKIE_SECRET: 'test-cookie-secret-not-for-production', ADMIN_ORIGIN: 'https://reader.test' };
const id = '00000000-0000-4000-8000-000000000001';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'staff@example.test',
  email_confirmed_at: '2026-10-29T00:00:00Z', created_at: '2026-10-29T00:00:00Z', app_metadata: { provider: 'google' },
  user_metadata: { full_name: '<script>Not markup</script>', role: 'master' }, identities: [{ id: 'google-identity', provider: 'google', user_id: id }] };
const jwt = (expires: number) => [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify({ sub: id, exp: expires, iat: expires - 3600, iss: env.SUPABASE_URL + '/auth/v1', aud: 'authenticated' })), 'synthetic-signature'].join('.');
const session = (expires = Math.floor(Date.now() / 1000) + 3600) => ({ access_token: jwt(expires), refresh_token: 'synthetic-refresh-token',
  token_type: 'bearer', expires_in: 3600, expires_at: expires, user });
const makeRequest = (cookie = '') => new Request('https://reader.test/api/admin/me', { headers: { Cookie: cookie } });
const cookieHeader = (headers: Headers) => headers.getSetCookie().filter(value => !value.includes('Max-Age=0')).map(value => value.split(';')[0]).join('; ');
const stub = (options: { google?: boolean; validCode?: boolean; validUser?: boolean; refreshed?: boolean } = {}) => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    if (url.pathname.endsWith('/settings')) return Response.json({ external: { google: options.google ?? true } });
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'pkce') {
        const body = JSON.parse(String(init?.body));
        expect(body.code_verifier).toBeTruthy();
        if (options.validCode === false) return Response.json({ error: 'invalid_grant', msg: 'Expired or replayed code' }, { status: 400 });
        return Response.json(session(options.refreshed ? Math.floor(Date.now() / 1000) - 10 : undefined));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') return Response.json(session());
    }
    if (url.pathname.endsWith('/user')) return options.validUser === false
      ? Response.json({ msg: 'Invalid token', code: 'bad_jwt' }, { status: 401 }) : Response.json(user);
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    throw Error('Unexpected authentication endpoint');
  });
  vi.stubGlobal('fetch', fetcher);return fetcher;
};
afterEach(() => vi.unstubAllGlobals());

async function login() {
  const start = new Headers();await createAdminAuth(makeRequest(), env, start).start();
  const finish = new Headers();
  expect(await createAdminAuth(makeRequest(cookieHeader(start)), env, finish).exchange('synthetic-code')).toBe(true);
  return finish;
}

describe('server-only Google OAuth', () => {
  it('starts a PKCE flow with a fixed callback and HttpOnly session verifier cookie', async () => {
    stub();const headers = new Headers();const auth = createAdminAuth(makeRequest(), env, headers);
    const url = new URL((await auth.start())!);
    expect(url.origin).toBe(env.SUPABASE_URL);expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(env.ADMIN_ORIGIN + '/api/admin/auth/callback');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    for (const cookie of headers.getSetCookie()) {
      expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toMatch(/Max-Age|Expires|Domain=/i);
    }
    expect(headers.get('Cache-Control')).toContain('no-store');
  });
  it('does not start a provider that is not configured', async () => {
    stub({ google: false });const headers = new Headers();
    expect(await createAdminAuth(makeRequest(), env, headers).start()).toBeNull();expect(headers.getSetCookie()).toHaveLength(0);
  });
  it('exchanges a browser-bound code, verifies the user remotely and ignores metadata roles', async () => {
    const fetcher = stub();const headers = await login();const result = await createAdminAuth(makeRequest(cookieHeader(headers)), env, new Headers()).user();
    expect(result).toEqual({ id, email: user.email, name: user.user_metadata.full_name });
    expect(result).not.toHaveProperty('role');expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/user'))).toHaveLength(2);
    for (const cookie of headers.getSetCookie().filter(value => !value.includes('Max-Age=0'))) {
      expect(cookie).toContain('HttpOnly');expect(cookie).not.toMatch(/Max-Age|Expires/i);
    }
  });
  it('rejects a missing verifier and an invalid or replayed code', async () => {
    const fetcher = stub({ validCode: false });
    expect(await createAdminAuth(makeRequest(), env, new Headers()).exchange('stolen-code')).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    const headers = new Headers();await createAdminAuth(makeRequest(), env, headers).start();
    expect(await createAdminAuth(makeRequest(cookieHeader(headers)), env, new Headers()).exchange('replayed-code')).toBe(false);
  });
  it('rejects forged session credentials when the Auth server rejects the user', async () => {
    stub();const headers = await login();stub({ validUser: false });
    expect(await createAdminAuth(makeRequest(cookieHeader(headers)), env, new Headers()).user()).toBeNull();
  });
  it('requires a confirmed Google identity even with an otherwise valid session', async () => {
    stub();const headers = await login();
    for (const changed of [{ ...user, identities: [] }, { ...user, email_confirmed_at: null }]) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(changed)));
      expect(await createAdminAuth(makeRequest(cookieHeader(headers)), env, new Headers()).user()).toBeNull();
    }
  });
  it('refreshes expired sessions while keeping their cookies nonpersistent', async () => {
    const fetcher = stub();const refreshed = new Headers();
    const expired = 'base64-' + Buffer.from(JSON.stringify(session(Math.floor(Date.now() / 1000) - 10))).toString('base64url');
    expect(await createAdminAuth(makeRequest('__Host-sr-admin-auth=' + expired), env, refreshed).user()).toHaveProperty('id', id);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('grant_type=refresh_token'))).toBe(true);
    expect(refreshed.getSetCookie().filter(value => !value.includes('Max-Age=0')).length).toBeGreaterThan(0);
    for (const cookie of refreshed.getSetCookie().filter(value => !value.includes('Max-Age=0'))) expect(cookie).not.toMatch(/Max-Age|Expires/i);
  });
  it('signs out the local session and clears only admin cookies', async () => {
    const fetcher = stub();const headers = await login();const removed = new Headers();
    await createAdminAuth(makeRequest(cookieHeader(headers) + '; __Host-sr-browser=student-cookie'), env, removed).signOut();
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/logout?scope=local'))).toBe(true);
    expect(removed.getSetCookie().some(cookie => cookie.includes('__Host-sr-admin-auth=;') && cookie.includes('Max-Age=0'))).toBe(true);
    expect(removed.getSetCookie().some(cookie => cookie.includes('__Host-sr-browser'))).toBe(false);
  });
  it('rejects mismatched/non-HTTPS production origins but supports loopback development', () => {
    expect(() => adminOrigin(new Request('https://attacker.test/api/admin/me'), env)).toThrow();
    expect(() => adminOrigin(makeRequest(), { ...env, ADMIN_ORIGIN: 'http://reader.test' })).toThrow();
    expect(() => adminOrigin(makeRequest(), { ...env, ADMIN_ORIGIN: undefined })).toThrow();
    expect(adminOrigin(new Request('http://localhost:5180/api/admin/me'), { ...env, ADMIN_ORIGIN: undefined })).toBe('http://localhost:5180');
  });
});
