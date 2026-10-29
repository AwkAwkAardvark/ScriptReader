// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest';
import { localDatabase } from './local-database';
import { csvFor } from '../src/test/fixtures';
import { handleAdminApi } from './admin-api';
import { handleApi } from './api';
import type { AdminAuthFactory } from './admin-auth';
let local: Awaited<ReturnType<typeof localDatabase>>;
const owner = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const pending = '00000000-0000-4000-8000-000000000003';
const env = { SUPABASE_URL: 'https://unused.test', SUPABASE_SECRET_KEY: 'test', SUPABASE_PUBLISHABLE_KEY: 'test', ADMIN_ORIGIN: 'https://reader.test', BROWSER_COOKIE_SECRET: 'test-only-long-cookie-secret-not-production' };
const files = { slug: 'paper-2026', title: 'Paper 2026', before: 2, after: 1, expected: null, script: csvFor(), cast: 'Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four' };
const auth = (id: string | null): AdminAuthFactory => () => ({ user: async () => id ? { id, email: 'synthetic@example.test', name: 'Synthetic' } : null, start: async () => null, exchange: async () => false, signOut: async () => {} });
async function api(path: string, method = 'GET', body?: unknown, id: string | null = staff, origin = 'https://reader.test') {
 return handleAdminApi(new Request('https://reader.test/api/admin/'+path, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, local.rpc, auth(id));
}
const manage = (action: string, more = {}) => local.rpc('reader_manage_productions', { p_action: action, p_actor: staff, ...more }) as Promise<any>;
beforeAll(async () => {
 local = await localDatabase();
 await local.rpc('reader_admin_bootstrap', { p_user: owner, p_email: 'owner@example.test', p_name: 'Owner' });
 for (const id of [staff,pending]) await local.rpc('reader_admin_access',{p_action:'request',p_actor:id,p_email:'staff@example.test',p_name:'Staff'});
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'admin'});
},60000);
afterAll(async () => local?.db.close());
it('allows staff validation and publication but denies signed-out/pending/cross-site clients', async () => {
 expect((await api('productions','GET',undefined,null)).status).toBe(401);
 expect((await api('productions','GET',undefined,pending)).status).toBe(403);
 expect((await api('productions','POST',files,staff,'https://evil.test')).status).toBe(403);
 const valid=await api('productions/validate','POST',files);expect(valid.status).toBe(200);expect(await valid.json()).toHaveProperty('characters',6);
 expect((await api('productions','POST',files)).status).toBe(200);
 expect((await api('productions','POST',files)).status).toBe(409);
 expect((await api('accounts')).status).toBe(403);
});
it('rejects invalid input and oversized requests without changing active content', async () => {
 const before=await manage('list');
 expect((await api('productions/validate','POST',{...files,slug:'invalid-cast',cast:'Tag,Name\nRo,Only'})).status).toBe(422);
 expect((await api('productions','POST',{...files,slug:'next',script:'x'.repeat(5*1024*1024)})).status).toBe(413);
 expect((await api('productions','POST',{...files,slug:'next',before:6})).status).toBe(400);
 expect(await manage('list')).toEqual(before);
});
it('edits settings independently, rejects stale updates, and returns defaults in reader metadata', async () => {
 const {productions:[p]}=await manage('list');
 expect((await api('productions/'+p.slug,'PATCH',{title:'Paper 2026 revised',before:5,after:0,expected:p.version})).status).toBe(200);
 expect((await api('productions/'+p.slug,'PATCH',{title:'Stale',before:1,after:1,expected:p.version})).status).toBe(409);
 const {productions:[next]}=await manage('list');expect(next.revision).toBe(p.revision);expect(next.before).toBe(5);
 const r:any=await local.rpc('reader_fetch',{p_slug:p.slug,p_browser:'a'.repeat(64),p_ip:'b'.repeat(64),p_new_browser:false});expect(r.production.defaults).toEqual({before:5,after:0});
});
it('switches home explicitly while preserving old links and rejects stale home saves',async()=>{
 const {home}=await manage('list');expect(await local.rpc('reader_home',{})).toEqual({destination:'/import'});
 expect((await api('home','PATCH',{slug:'paper-2026',expected:home.version})).status).toBe(200);
 expect(await local.rpc('reader_home',{})).toEqual({destination:'/p/paper-2026'});
 expect((await api('home','PATCH',{slug:null,expected:home.version})).status).toBe(409);
 const next=await manage('list');expect((await api('home','PATCH',{slug:null,expected:next.home.version})).status).toBe(200);
 expect((await manage('list')).productions).toHaveLength(1);
});
it('retains omitted media, supports explicit removal, and serializes competing updates',async()=>{
 const {productions:[p]}=await manage('list');
 expect((await api('productions/'+p.slug+'/publish','POST',{...files,expected:p.version,media:'No,YouTubeURL\n9,https://youtu.be/abcdefghijk'})).status).toBe(200);
 const {productions:[next]}=await manage('list');expect(next.mediaCount).toBe(1);
 const responses=await Promise.all([api('productions/'+p.slug+'/publish','POST',{...files,expected:next.version}),api('productions/'+p.slug+'/publish','POST',{...files,expected:next.version})]);
 expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await manage('list')).productions[0].mediaCount).toBe(1);
 const metadataResponse=await api('productions/'+p.slug+'/songs');const metadata=await metadataResponse.json();expect(metadataResponse.status).toBe(200);expect(metadata.payload).toBeUndefined();expect(metadata.songs.some((s:any)=>s.no===9&&s.video==='abcdefghijk')).toBe(true);
 expect((await api('productions/'+p.slug+'/songs','PATCH',{expected:metadata.version,mediaEdits:{9:null}})).status).toBe(200);
 expect((await api('productions/'+p.slug+'/songs','PATCH',{expected:metadata.version,mediaEdits:{9:'https://youtu.be/abcdefghijk'}})).status).toBe(409);
 expect((await manage('list')).productions[0].mediaCount).toBe(0);
});
it('keeps the anonymous homepage response minimal and all content management server-only',async()=>{
 const response=await handleApi(new Request('https://reader.test/api/home'),env,local.rpc);
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(await response.json()).toEqual({destination:'/import'});
 await local.db.exec('set role service_role');
 try {
  expect((await manage('list')).productions).toHaveLength(1);expect(await local.rpc('reader_home',{})).toEqual({destination:'/import'});
  expect((await api('productions','POST',{...files,slug:'validate'})).status).toBe(200);
  const state=await manage('list');const p=state.productions.find((p:any)=>p.slug==='validate');
  expect((await api('productions/validate','PATCH',{title:p.title,before:3,after:2,expected:p.version})).status).toBe(200);
  expect((await api('home','PATCH',{slug:null,expected:state.home.version})).status).toBe(200);
 }
 finally{await local.db.exec('reset role');}
});
it('enforces current access inside mutations and denies direct browser database access',async()=>{
 await local.rpc('reader_admin_access',{p_action:'change',p_actor:owner,p_target:staff,p_role:'revoked'});
 expect(await manage('list')).toEqual({error:'forbidden'});
 expect((await api('productions')).status).toBe(403);
 for(const role of ['anon','authenticated']){
  await local.db.exec(`set role ${role}`);
  try {await expect(local.rpc('reader_home',{})).rejects.toThrow(/permission denied/);await expect(local.rpc('reader_song_context',{p_slug:'paper-2026'})).rejects.toThrow(/permission denied/);await expect(local.rpc('reader_publish_checked',{p_slug:'bad',p_title:'bad',p_payload:{},p_expected:null})).rejects.toThrow(/permission denied/);await expect(manage('list')).rejects.toThrow(/permission denied/);await expect(local.db.query('select * from reader_site_settings')).rejects.toThrow(/permission denied/);}
  finally{await local.db.exec('reset role');}
 }
});
