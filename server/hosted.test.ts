// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localDatabase } from './local-database';
import { preparePublication, youtubeId } from './publishing';
import { passageBundle } from './passages';
import { handleApi } from './api';
import { supabaseRpc, type FetchResult } from './database';
import { unpackView } from '../src/hosted/protocol';
import { filterScript } from '../src/script';
import { buildReadingDocument } from '../src/reading-document';
import { csvFor } from '../src/test/fixtures';

let local: Awaited<ReturnType<typeof localDatabase>>;
let revision: string;
const cast = 'Tag,Name,DividerBefore\nRo,Rowan Reed,\nMi,Mira Moss,Y\nA1,Visitor One,\nA2,Visitor Two,\nA3,Visitor Three,\nA4,Visitor Four,';
const payload = preparePublication(csvFor(), cast, 'No,YouTubeURL\n9,https://youtu.be/abcdefghijk');
const base = { p_slug: 'garden', p_browser: 'a'.repeat(64), p_ip: 'b'.repeat(64), p_new_browser: false, p_now: '2026-10-26T12:00:00Z', p_browser_limit: 1000, p_ip_limit: 10000 };
const fetchDb = (args: Record<string, unknown> = {}) => local.rpc('reader_fetch', { ...base, ...args }) as Promise<FetchResult>;
beforeAll(async () => {
  local = await localDatabase();
  revision = await local.rpc('reader_publish', { p_slug: 'garden', p_title: 'Paper garden', p_payload: payload }) as string;
}, 60000);
afterAll(async () => { await local?.db.close(); });

describe('server selection and publishing', () => {
  it('matches full-revision filtering for every context count, cue mode and character', () => {
    const production = { slug: 'garden', title: 'Garden', revision, characters: payload.script.characters, used: 1, resetAt: '2026-10-27T15:00:00Z' };
    for (const character of ['Ro', 'Mi', 'A1']) for (const includeNonDialogue of [false, true]) {
      for (let before = 0; before <= 5; before++) for (let after = 0; after <= 5; after++) {
        const counts = { before, after, includeNonDialogue };
        const bundle = passageBundle(production, payload, character, counts);
        const expected = buildReadingDocument(payload.script, filterScript(payload.script.records, { character, ...counts }), character, { ...counts, showKorean: true });
        expect(unpackView(bundle, counts, true)).toEqual(expected);
        expect(Object.values(bundle.entries).every(entry => !('source' in entry))).toBe(true);
      }
    }
  });
  it('rejects invalid casts and media, including non-YouTube hosts and non-song rows', () => {
    expect(() => preparePublication(csvFor(), 'Tag,Name\nRo,Rowan')).toThrow();
    expect(() => preparePublication(csvFor(), cast, 'No,YouTubeURL\n2,https://youtu.be/abcdefghijk')).toThrow();
    expect(() => preparePublication(csvFor(), cast, 'No,YouTubeURL\n9,https://evil.example/abcdefghijk')).toThrow();
    expect(() => preparePublication(csvFor(), cast, 'No,YouTubeURL\n9,https://youtu.be/abcdefghijk\n9,https://youtu.be/abcdefghijk')).toThrow();
    expect(youtubeId('https://www.youtube.com/watch?v=abcdefghijk&si=ignored')).toBe('abcdefghijk');
    expect(youtubeId('https://youtube.com.evil.example/watch?v=abcdefghijk')).toBeNull();
    expect(youtubeId('javascript:alert(1)')).toBeNull();
  });
});
describe('database admissions and revisions', () => {
  it('metadata contains no script payload and does not use a character slot', async () => {
    const result = await fetchDb();
    expect(result).not.toHaveProperty('payload');
    expect(result).toHaveProperty('production.used', 0);
    expect(result).toHaveProperty('production.characters', payload.script.characters);
  });
  it('admits five unique characters atomically, permits repeats, rejects the sixth', async () => {
    const results = await Promise.all(['Ro', 'Mi', 'A1', 'A2', 'A3', 'A4'].map(p_character => fetchDb({ p_character, p_revision: revision })));
    expect(results.filter(result => 'payload' in result)).toHaveLength(5);
    expect(results.filter(result => 'error' in result && result.error === 'quota')).toHaveLength(1);
    expect(await fetchDb({ p_character: 'Ro', p_revision: revision })).toHaveProperty('production.used', 5);
  });
  it('resets at midnight Korea time, with independent allowances per production', async () => {
    expect(await fetchDb({ p_character: 'A4', p_revision: revision, p_now: '2026-10-26T15:00:00Z' })).toHaveProperty('production.used', 1);
    const other = await local.rpc('reader_publish', { p_slug: 'other', p_title: 'Another garden', p_payload: payload });
    expect(await fetchDb({ p_slug: 'other', p_character: 'A4', p_revision: other })).toHaveProperty('production.used', 1);
  });
  it('uses browser and IP throttles independently and limits newly issued identities', async () => {
    const args = { p_browser: 'c'.repeat(64), p_ip: 'd'.repeat(64), p_browser_limit: 1 };
    expect(await fetchDb(args)).toHaveProperty('production');
    expect(await fetchDb(args)).toHaveProperty('error', 'rate');
    expect(await fetchDb({ ...args, p_browser: 'e'.repeat(64), p_ip_limit: 1 })).toHaveProperty('error', 'rate');
    const fresh = { p_ip: 'f'.repeat(64), p_new_browser: true, p_identity_limit: 1 };
    await fetchDb({ ...fresh, p_browser: '1'.repeat(64) });
    expect(await fetchDb({ ...fresh, p_browser: '2'.repeat(64) })).toHaveProperty('error', 'rate');
  });
  it('rejects invalid/missing productions and stale revisions without admitting a new tag', async () => {
    expect(await fetchDb({ p_slug: 'missing' })).toHaveProperty('error', 'not_found');
    expect(await fetchDb({ p_character: 'invalid', p_revision: revision })).toHaveProperty('error', 'invalid_request');
    const next = await local.rpc('reader_publish', { p_slug: 'garden', p_title: 'Garden revised', p_payload: payload });
    expect(next).not.toBe(revision);
    expect(await fetchDb({ p_character: 'Ro', p_revision: revision })).toHaveProperty('error', 'revision_changed');
    const rows = await local.db.query('select count(*)::int as n from reader_revisions');
    expect(rows.rows[0]).toHaveProperty('n', 3);
  });
  it('rolls back a failed publication without replacing its active revision', async () => {
    const before = await fetchDb();
    await expect(local.rpc('reader_publish', { p_slug: 'garden', p_title: 'Broken', p_payload: {} })).rejects.toThrow();
    await expect(local.rpc('reader_publish', { p_slug: 'garden', p_title: 'Broken after upsert', p_payload: { ...payload, script: { ...payload.script, records: [] } } })).rejects.toThrow();
    expect(await fetchDb()).toEqual(before);
  });
  it('denies anonymous table/function access and explicitly enables RLS', async () => {
    const rls = await local.db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname like 'reader_%' and relkind = 'r'");
    expect(rls.rows).toHaveLength(6); expect(rls.rows.every(row => row.relrowsecurity)).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      await local.db.exec(`set role ${role}`);
      try {
        await expect(local.db.query('select * from reader_revisions')).rejects.toThrow('permission denied');
        await expect(local.db.query("select reader_fetch('garden', 'x', 'y', false)")).rejects.toThrow('permission denied');
        await expect(local.db.query("select reader_publish('bad', 'bad', '{}'::jsonb)")).rejects.toThrow('permission denied');
      } finally { await local.db.exec('reset role'); }
    }
    await local.db.exec('set role service_role');
    try { expect(await fetchDb()).toHaveProperty('production'); } finally { await local.db.exec('reset role'); }
  });
  it('cleans expired quota/rate rows', async () => {
    await fetchDb({ p_now: '2026-10-30T12:00:00Z' });
    expect((await local.db.query("select count(*)::int as n from reader_browser_days where day < '2026-10-29'" )).rows[0]).toHaveProperty('n', 0);
    expect((await local.db.query("select count(*)::int as n from reader_rates where window_start < '2026-10-28T12:00:00Z'" )).rows[0]).toHaveProperty('n', 0);
  });
});
describe('HTTP boundary', () => {
  const env = { SUPABASE_URL: 'https://unused.invalid', SUPABASE_SECRET_KEY: 'NEVER-SEND-TO-BROWSER', BROWSER_COOKIE_SECRET: 'test-signing-secret-with-at-least-32-chars' };
  const request = (path = '', body: unknown = {}, headers: Record<string, string> = {}) => new Request(`https://reader.example/api/productions/garden${path}`, { method: 'POST', headers: { Origin: 'https://reader.example', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  it('sets a secure signed cookie and serves only metadata or the selected view', async () => {
    const meta = await handleApi(request(), env, local.rpc);
    expect(meta.status).toBe(200);
    const production = await meta.json();
    const cookie = meta.headers.get('Set-Cookie')!;
    expect(cookie).toContain('Secure; HttpOnly; SameSite=Lax');
    const body = { revision: production.revision, character: 'Ro', before: 2, after: 1, includeNonDialogue: false };
    const view = await handleApi(request('/passages', body, { Cookie: cookie.split(';')[0] }), env, local.rpc);
    const bundle = await view.json();
    expect(view.status).toBe(200); expect(Object.keys(bundle.views)).toHaveLength(12);
    expect(JSON.stringify(bundle)).not.toContain(env.SUPABASE_SECRET_KEY);
    expect(JSON.stringify(bundle)).not.toContain('Notes');
    expect(view.headers.get('Cache-Control')).toBe('no-store');
    expect(view.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(view.headers.get('X-Frame-Options')).toBe('DENY');
    expect(view.headers.has('Set-Cookie')).toBe(false);
  });
  it('rejects cross-origin, malformed, oversized, and out-of-range requests before the database', async () => {
    const rpc = vi.fn();
    expect((await handleApi(request('', {}, { Origin: 'https://elsewhere.example' }), env, rpc)).status).toBe(403);
    expect((await handleApi(request('/passages', { before: -1 }), env, rpc)).status).toBe(400);
    expect((await handleApi(request('', { huge: 'x'.repeat(5000) }), env, rpc)).status).toBe(413);
    const valid = { revision, character: 'Ro', before: 2, after: 1, includeNonDialogue: false };
    for (const side of ['before', 'after']) for (const count of [-1, 6, 10, 1.5, '5', null]) {
      expect((await handleApi(request('/passages', { ...valid, [side]: count }), env, rpc)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: 'not_found' });
    expect((await handleApi(request('/passages', { ...valid, before: 5, after: 0 }), env, rpc)).status).toBe(404);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('does not trust a tampered cookie and suppresses internal errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: 'not_found' });
    const response = await handleApi(request('', {}, { Cookie: '__Host-sr-browser=forged' }), env, rpc);
    expect(response.headers.has('Set-Cookie')).toBe(true);
    expect(rpc.mock.calls[0][1].p_new_browser).toBe(true);
    rpc.mockRejectedValue(new Error('PRIVATE DATA'));
    const failed = await handleApi(request(), env, rpc);
    expect(failed.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(await failed.text()).not.toContain('PRIVATE DATA');
  });
  it('uses new secret API keys without treating them as JWTs', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await supabaseRpc('https://test.supabase.co', 'sb_secret_private')('reader_fetch', {});
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ apikey: 'sb_secret_private', 'Content-Type': 'application/json' });
    fetch.mockRestore();
  });
});
