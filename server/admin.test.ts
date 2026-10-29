// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { localDatabase } from './local-database';
import { handleAdminApi } from './admin-api';
import type { AdminAuthFactory } from './admin-auth';
import type { AdminAccount } from '../src/admin/protocol';

let local: Awaited<ReturnType<typeof localDatabase>>;
const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const env = { SUPABASE_URL: 'https://project.example.test', SUPABASE_SECRET_KEY: 'local-only', SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
  BROWSER_COOKIE_SECRET: 'test-only-cookie-secret-not-for-production', ADMIN_ORIGIN: 'https://reader.test' };
const identity = (id: string) => ({ id, email: `person${ids.indexOf(id)}@example.test`, name: 'Example person' });
const db = (action: string, actor: string, more: Record<string, unknown> = {}) => local.rpc('reader_admin_access', {
  p_action: action, p_actor: actor, p_email: identity(actor).email, p_name: identity(actor).name, ...more,
}) as Promise<{ error?: string; account?: AdminAccount; accounts?: AdminAccount[] }>;
const factory = (id: string | null): AdminAuthFactory => () => ({ user: async () => id ? identity(id) : null,
  start: async () => 'https://project.example.test/auth/v1/authorize?provider=google', exchange: async code => code === 'valid', signOut: async () => {} });
const request = (path: string, method = 'GET', body?: unknown, origin = 'https://reader.test') => new Request('https://reader.test/api/admin/' + path, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeAll(async () => { local = await localDatabase(); }, 60000);
afterAll(async () => { await local?.db.close(); });

describe('membership storage', () => {
  it('does not promote the first sign-in or request and bootstraps only once', async () => {
    expect(await db('me', ids[0])).toEqual({ account: null });
    expect((await db('request', ids[0])).account).toMatchObject({ role: 'admin', status: 'pending' });
    expect(await db('list', ids[0])).toEqual({ error: 'forbidden' });
    const bootstrap = { p_user: ids[0], p_email: 'owner@example.test', p_name: 'Owner' };
    expect(await local.rpc('reader_admin_bootstrap', bootstrap)).toHaveProperty('account.role', 'master');
    expect(await local.rpc('reader_admin_bootstrap', { ...bootstrap, p_user: ids[1] })).toEqual({ error: 'already_bootstrapped' });
  });
  it('keeps requests idempotent and denies pending users/staff any access-management power', async () => {
    const first = await db('request', ids[1]);const again = await db('request', ids[1]);
    expect(again.account?.requested_at).toBe(first.account?.requested_at);
    expect(await db('change', ids[1], { p_target: ids[1], p_role: 'master' })).toEqual({ error: 'forbidden' });
    await db('change', ids[0], { p_target: ids[1], p_role: 'admin' });
    expect(await db('list', ids[1])).toEqual({ error: 'forbidden' });
    expect(await db('change', ids[1], { p_target: ids[0], p_role: 'revoked' })).toEqual({ error: 'forbidden' });
  });
  it('preserves the last master and caps concurrent promotions at three', async () => {
    expect(await db('change', ids[0], { p_target: ids[0], p_role: 'revoked' })).toEqual({ error: 'last_master' });
    expect(await db('change', ids[0], { p_target: ids[0], p_role: 'admin' })).toEqual({ error: 'last_master' });
    for (const id of ids.slice(2, 5)) await db('request', id);
    const result = await Promise.all(ids.slice(2, 5).map(p_target => db('change', ids[0], { p_target, p_role: 'master' })));
    expect(result.filter(r => r.account?.role === 'master')).toHaveLength(2);
    expect(result.filter(r => r.error === 'master_limit')).toHaveLength(1);
  });
  it('allows equal-master handover and removes predecessor privileges immediately', async () => {
    const successor = ids[2];
    expect(await db('list', successor)).toHaveProperty('accounts');
    expect((await db('change', successor, { p_target: ids[0], p_role: 'revoked' })).account?.status).toBe('revoked');
    expect(await db('list', ids[0])).toEqual({ error: 'forbidden' });
    const requested = await db('request', ids[0]);
    expect(requested.account).toMatchObject({ status: 'pending', role: 'admin' });
    expect(await db('list', ids[0])).toEqual({ error: 'forbidden' });
    expect((await db('change', successor, { p_target: ids[0], p_role: 'admin' })).account?.status).toBe('approved');
    expect(await db('list', ids[0])).toEqual({ error: 'forbidden' });
  });
  it('cannot remove the last master through concurrent self-demotions', async () => {
    const result = await Promise.all([ids[2], ids[3]].map(actor => db('change', actor, { p_target: actor, p_role: 'admin' })));
    expect(result.filter(r => r.error === 'last_master')).toHaveLength(1);
    expect((await local.db.query<{ n: number }>("select count(*)::int n from reader_admin_accounts where role='master' and status='approved'" )).rows[0].n).toBe(1);
  });
  it('does not allow browser roles to read tables or call membership/bootstrap functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await local.db.exec(`set role ${role}`);
      try {
        await expect(local.db.query('select * from public.reader_admin_accounts')).rejects.toThrow(/permission denied/);
        await expect(db('list', ids[0])).rejects.toThrow(/permission denied/);
        await expect(local.rpc('reader_admin_bootstrap', { p_user: ids[5], p_email: 'test@example.test', p_name: 'test' })).rejects.toThrow(/permission denied/);
      } finally { await local.db.exec('reset role'); }
    }
  });
});

describe('protected admin API', () => {
  it('has a non-sensitive signed-out/setup state and keeps responses uncacheable', async () => {
    const response = await handleAdminApi(request('me'), env, local.rpc, factory(null));
    expect(await response.json()).toEqual({ configured: true, user: null, account: null });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const setup = await handleAdminApi(request('me'), { ...env, SUPABASE_PUBLISHABLE_KEY: undefined }, local.rpc);
    expect(await setup.json()).toEqual({ configured: false, user: null, account: null });
  });
  it('rejects signed-out and ordinary staff account-directory requests', async () => {
    expect((await handleAdminApi(request('accounts'), env, local.rpc, factory(null))).status).toBe(401);
    expect((await handleAdminApi(request('accounts'), env, local.rpc, factory(ids[1]))).status).toBe(403);
  });
  it('binds requests to authenticated identity, never to a submitted actor or role', async () => {
    const response = await handleAdminApi(request('requests', 'POST', { actor: ids[2], role: 'master' }), env, local.rpc, factory(ids[6]));
    expect(await response.json()).toHaveProperty('account.user_id', ids[6]);
    expect(await db('me', ids[6])).toHaveProperty('account.role', 'admin');
    expect(await db('me', ids[6])).toHaveProperty('account.status', 'pending');
  });
  it('checks current membership for existing sessions on every operation', async () => {
    const master = (await local.db.query<{ user_id: string }>("select user_id from reader_admin_accounts where role='master'" )).rows[0].user_id;
    const auth = factory(ids[1]);
    await db('change', master, { p_target: ids[1], p_role: 'master' });
    expect((await handleAdminApi(request('accounts'), env, local.rpc, auth)).status).toBe(200);
    await db('change', master, { p_target: ids[1], p_role: 'revoked' });
    expect((await handleAdminApi(request('accounts'), env, local.rpc, auth)).status).toBe(403);
  });
  it('rejects cross-site mutations, unsupported methods, invalid payloads and bootstrap routes', async () => {
    expect((await handleAdminApi(request('requests', 'POST', {}, 'https://other.test'), env, local.rpc, factory(ids[1]))).status).toBe(403);
    expect((await handleAdminApi(request('requests', 'GET'), env, local.rpc, factory(ids[1]))).status).toBe(405);
    expect((await handleAdminApi(request('bootstrap', 'POST'), env, local.rpc, factory(ids[1]))).status).toBe(404);
    const master = (await local.db.query<{ user_id: string }>("select user_id from reader_admin_accounts where role='master'" )).rows[0].user_id;
    expect((await handleAdminApi(request('accounts/' + ids[1], 'PATCH', { role: 'admin', user_id: master }), env, local.rpc, factory(master))).status).toBe(400);
    const large = await handleAdminApi(request('accounts/' + ids[1], 'PATCH', { role: 'x'.repeat(5000) }), env, local.rpc, factory(master));
    expect(large.status).toBe(413);
  });
  it('uses fixed callback destinations and does not echo provider errors', async () => {
    const call = (query: string) => handleAdminApi(request('auth/callback' + query), env, local.rpc, factory(ids[1]));
    expect((await call('?code=valid')).headers.get('Location')).toBe('/admin');
    for (const query of ['?code=bad', '?code=valid&next=https://other.test', '?code=valid&code=valid', '?error=denied&error_description=private']) {
      const response = await call(query);expect(response.headers.get('Location')).toBe('/admin?auth=failed');expect(await response.text()).not.toContain('private');
    }
  });
  it('does not include upstream diagnostics in failure responses', async () => {
    const response = await handleAdminApi(request('me'), env, async () => { throw Error('private database payload'); }, factory(ids[1]));
    expect(response.status).toBe(503);expect(await response.text()).toBe('{"error":"unavailable"}');
  });
});
