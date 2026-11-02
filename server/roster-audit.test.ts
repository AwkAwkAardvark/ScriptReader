// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { localDatabase } from './local-database';
import { handleAdminApi } from './admin-api';
import type { AdminAuthFactory } from './admin-auth';
import { preparePublication } from './publishing';
import { csvFor } from '../src/test/fixtures';
import type { RosterContext, Roster } from '../src/roster';

let local: Awaited<ReturnType<typeof localDatabase>>;
const master = '00000000-0000-4000-8000-000000000001';
const admin = '00000000-0000-4000-8000-000000000002';
const pending = '00000000-0000-4000-8000-000000000003';
const env = { SUPABASE_URL: 'https://unused.test', SUPABASE_SECRET_KEY: 'test', SUPABASE_PUBLISHABLE_KEY: 'test', ADMIN_ORIGIN: 'https://reader.test', BROWSER_COOKIE_SECRET: 'synthetic-cookie-secret-long-enough' };
const auth = (id: string | null): AdminAuthFactory => () => ({ user: async () => id ? { id, email: 'synthetic@example.test', name: 'Staff' } : null, start: async () => null, exchange: async () => false, signOut: async () => {} });
const student = (id: string, name = 'SYNTHETIC_NAME_VALUE') => ({ id, name, className: 'SYNTHETIC_CLASS_VALUE', label: 'SYNTHETIC_LABEL_VALUE' });
const role = (studentId: string, tag = 'Ro', performance = '1부') => ({ studentId, tag, performance });
async function api(suffix: string, body?: unknown, id: string | null = admin, origin = 'https://reader.test') {
 return handleAdminApi(new Request('https://reader.test/api/admin/productions/audit-test/' + suffix, { method: body === undefined ? 'GET' : 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, local.rpc, auth(id));
}
const context = async () => await (await api('roster')).json() as RosterContext;
const events = async () => (await local.db.query<any>('select * from reader_private.roster_audit_events order by occurred_at,id')).rows;
const patch = (c: RosterContext, value: Roster) => ({ students: value.students, assignments: value.assignments, expected: c.version, productionVersion: c.productionVersion });
const save = async (value: Roster, id = admin) => api('roster', patch(await context(), value), id);
beforeAll(async () => {
 local = await localDatabase();
 await local.rpc('reader_admin_bootstrap', { p_user: master, p_email: 'owner@example.test', p_name: 'Owner' });
 for (const id of [admin, pending]) await local.rpc('reader_admin_access', { p_action: 'request', p_actor: id, p_email: 'staff@example.test', p_name: 'Staff' });
 await local.rpc('reader_admin_access', { p_action: 'change', p_actor: master, p_target: admin, p_role: 'admin' });
 await local.rpc('reader_publish', { p_slug: 'audit-test', p_title: 'Synthetic audit test', p_payload: preparePublication(csvFor(), 'Tag,Name\nRo,Rowan\nMi,Mira') });
}, 60000);
afterAll(async () => local?.db.close());

it('atomically audits first roster save with verified actor, role, versions and identifiers only', async () => {
 const before = await context();
 expect((await api('roster', patch(before, { students: [student('s1'), student('s2')], assignments: [role('s1'), role('s2', 'Mi', '2부')] as Roster['assignments'] }))).status).toBe(200);
 const after = await context(); const [event] = await events();
 expect(event).toMatchObject({ actor_id: admin, actor_role: 'admin', action: 'roster_save', before_version: null, after_version: after.version });
 expect(event.production_id).toBe((await local.db.query<any>("select id from reader_productions where slug='audit-test'")).rows[0].id);
 expect(Number.isFinite(Date.parse(event.occurred_at))).toBe(true);
 expect(event.casting_changes).toEqual([{ performance: '1부', tag: 'Ro', beforeStudentId: null, afterStudentId: 's1' }, { performance: '2부', tag: 'Mi', beforeStudentId: null, afterStudentId: 's2' }]);
 expect(event.student_changes).toEqual(['s1', 's2'].map(studentId => ({ studentId, change: 'added', fields: ['className', 'label', 'name'] })));
 expect(JSON.stringify(event)).not.toMatch(/SYNTHETIC_(?:NAME|CLASS|LABEL)_VALUE|example\.test|cookie|token/i);
});

it('records slot replacements/removals and only changed student field names', async () => {
 const before = await context();
 const students = before.students.map(s => s.id === 's1' ? { ...s, name: 'OTHER_PRIVATE_NAME', label: 'OTHER_PRIVATE_LABEL' } : s);
 expect((await api('roster', patch(before, { students, assignments: [role('s2')] as Roster['assignments'] }))).status).toBe(200);
 const event = (await events()).at(-1);
 expect(event.before_version).toBe(before.version);
 expect(event.casting_changes).toEqual([{ performance: '1부', tag: 'Ro', beforeStudentId: 's1', afterStudentId: 's2' }, { performance: '2부', tag: 'Mi', beforeStudentId: 's2', afterStudentId: null }]);
 expect(event.student_changes).toEqual([{ studentId: 's1', change: 'updated', fields: ['label', 'name'] }]);
 expect(JSON.stringify(event)).not.toMatch(/OTHER_PRIVATE/);
});

it('audits successful unchanged saves but not reads, previews, denied or stale requests', async () => {
 const c = await context(); const count = (await events()).length;
 const csv = 'StudentId,StudentName,Class,Performance,Tag\ns1,SYNTHETIC_IMPORT_NAME,Class B,1부,Ro';
 // Validation is POST rather than publication, and must not create an event.
 const response = await handleAdminApi(new Request('https://reader.test/api/admin/productions/audit-test/assignments/validate', { method: 'POST', headers: { Origin: env.ADMIN_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, expected: c.version, productionVersion: c.productionVersion }) }), env, local.rpc, auth(master));
 expect(response.status).toBe(200);
 expect((await api('roster', patch(c, c), null)).status).toBe(401);
 expect((await api('roster', patch(c, c), pending)).status).toBe(403);
 expect((await api('roster', patch(c, c), admin, 'https://evil.test')).status).toBe(403);
 for (const attribution of [{ actor: master }, { p_actor: master }, { actorRole: 'master' }]) expect((await api('roster', { ...patch(c, c), ...attribution })).status).toBe(400);
 expect((await events()).length).toBe(count);
 expect((await api('roster', patch(c, c))).status).toBe(200);
 expect((await api('roster', patch(c, c))).status).toBe(409);
 const event = (await events()).at(-1);
 expect(event.casting_changes).toEqual([]); expect(event.student_changes).toEqual([]);
 expect((await events()).length).toBe(count + 1);
});

it('audits CSV import from final synchronized storage, retaining optional labels and omitted students', async () => {
 const c = await context();
 const csv = 'StudentId,StudentName,Class,Performance,Tag\ns1,SYNTHETIC_IMPORT_NAME,Class B,2부,Ro\ns3,SYNTHETIC_NEW_NAME,Class C,1부,Mi';
 expect((await api('assignments', { csv, expected: c.version, productionVersion: c.productionVersion }, master)).status).toBe(200);
 const event = (await events()).at(-1); expect(event.action).toBe('csv_import');
 expect(event.student_changes).toEqual([{ studentId: 's1', change: 'updated', fields: ['className', 'name'] }, { studentId: 's3', change: 'added', fields: ['className', 'label', 'name'] }]);
 expect(event.actor_id).toBe(master); expect((await context()).students).toHaveLength(3);
 expect(JSON.stringify(event)).not.toMatch(/SYNTHETIC_IMPORT_NAME|SYNTHETIC_NEW_NAME|Class B|Class C/);
 const count = (await events()).length;
 expect((await api('assignments', { csv, expected: c.version, productionVersion: c.productionVersion, actor: master }, master)).status).toBe(400);
 expect((await events()).length).toBe(count);
});

it('rolls back the roster mutation when audit insertion fails', async () => {
 const before = await context(); const count = (await events()).length;
 await local.db.exec("alter table reader_private.roster_audit_events add constraint synthetic_audit_failure check(action='clear') not valid");
 try {
  expect((await save({ students: before.students.map(s => ({ ...s, name: 'UNCOMMITTED_NAME' })), assignments: [] })).status).toBe(503);
  expect(await context()).toEqual(before); expect((await events()).length).toBe(count);
 } finally { await local.db.exec('alter table reader_private.roster_audit_events drop constraint synthetic_audit_failure'); }
});

it('keeps normal saves non-destructive, and audits explicit and legacy clearing without erasing history', async () => {
 let c = await context(); const count = (await events()).length;
 expect((await save({ students: [], assignments: [] })).status).toBe(422);
 expect((await events()).length).toBe(count);
 expect((await api('assignments', { clear: true, expected: c.version, productionVersion: c.productionVersion }, master)).status).toBe(200);
 let event = (await events()).at(-1); expect(event).toMatchObject({ actor_id: master, actor_role: 'master', action: 'clear', before_version: c.version });
 expect(event.student_changes.map((s: any) => s.studentId)).toEqual(['s1', 's2', 's3']);
 expect(event.student_changes.every((s: any) => s.change === 'deleted')).toBe(true);
 expect((await context()).students).toEqual([]); expect((await events()).length).toBe(count + 1);
 expect((await save({ students: [student('legacy')], assignments: [] })).status).toBe(200);
 c = await context();
 expect(await local.rpc('reader_staff_context', { p_actor: master, p_slug: 'audit-test', p_action: 'save', p_expected: c.version, p_production: c.productionVersion, p_rows: [] })).toHaveProperty('saved', true);
 event = (await events()).at(-1); expect(event.action).toBe('clear');
 expect(event.student_changes).toEqual([{ studentId: 'legacy', change: 'deleted', fields: ['className', 'label', 'name'] }]);
});

it('denies browser roles access to audit data and helper, and denies application history edits', async () => {
 for (const role of ['anon', 'authenticated']) {
  await local.db.exec('set role ' + role);
  try {
   await expect(local.db.query('select * from reader_private.roster_audit_events')).rejects.toThrow(/permission denied/);
   await expect(local.db.query("select reader_private.append_roster_audit($1,$2,'clear',null,'[]','[]')", [admin, master])).rejects.toThrow(/permission denied/);
   await expect(local.db.query("insert into reader_private.roster_audit_events default values")).rejects.toThrow(/permission denied/);
  } finally { await local.db.exec('reset role'); }
 }
 await local.db.exec('set role service_role');
 try {
  for (const query of ["update reader_private.roster_audit_events set action='clear'", 'delete from reader_private.roster_audit_events', 'truncate reader_private.roster_audit_events']) await expect(local.db.exec(query)).rejects.toThrow(/permission denied/);
  expect((await save({ students: [student('service-id')], assignments: [] })).status).toBe(200);
 } finally { await local.db.exec('reset role'); }
});

it('checks current membership and snapshots current actor role under the shared lock', async () => {
 const c = await context(); const count = (await events()).length;
 await local.rpc('reader_admin_access', { p_action: 'change', p_actor: master, p_target: admin, p_role: 'revoked' });
 expect((await api('roster', patch(c, c))).status).toBe(403);
 expect((await events()).length).toBe(count);
 await local.rpc('reader_admin_access', { p_action: 'change', p_actor: master, p_target: admin, p_role: 'master' });
 expect((await save({ students: c.students, assignments: c.assignments })).status).toBe(200);
 expect((await events()).at(-1).actor_role).toBe('master');
});

it('emits exactly one event for competing saves and rejects invalid RPC actions without audit', async () => {
 const c = await context(); const count = (await events()).length;
 const input = patch(c, c);
 expect((await Promise.all([api('roster', input), api('roster', input)])).map(r => r.status).sort()).toEqual([200, 409]);
 expect((await events()).length).toBe(count + 1);
 const current = await context();
 const args = { p_actor: master, p_slug: 'audit-test', p_expected: current.version, p_production: current.productionVersion };
 expect(await local.rpc('reader_roster', { ...args, p_action: null, p_students: current.students, p_roles: current.assignments })).toEqual({ error: 'invalid_request' });
 expect(await local.rpc('reader_staff_context', { ...args, p_action: 'clear', p_rows: [{ studentId: 'service-id' }] })).toEqual({ error: 'invalid_request' });
 expect((await events()).length).toBe(count + 1);
});

it('audits 5,000 changed slots/students without storing personal values or full snapshots', async () => {
 // Measure only the added audit cost; pre-existing upload validation/roster-sync
 // is unchanged. Seeding avoids conflating that baseline with this helper.
 const id = (await local.db.query<any>("select id from reader_productions where slug='audit-test'")).rows[0].id;
 const c = await context();
 const students = Array.from({ length: 5000 }, (_, i) => student('scale-' + i));
 const assignments = students.map((s, i) => ({ studentId: s.id, studentName: s.name, className: s.className, performance: '1부', tag: 'Synthetic' + i }));
 // Production-local snapshot bound is 5,000; benchmark data never leaves PGlite.
 await local.db.query('update reader_assignment_sets set students=$1,assignments=$2,version=gen_random_uuid() where production_id=$3', [JSON.stringify(students), JSON.stringify(assignments), id]);
 const start = performance.now();
 await local.db.query("select reader_private.append_roster_audit($1,$2,'restore',$3,$4,$5)", [master, id, c.version, JSON.stringify(c.students), JSON.stringify(c.assignments)]);
 const durationMs = performance.now() - start;
 const event = (await events()).at(-1);
 expect(event.casting_changes).toHaveLength(5000); expect(event.student_changes).toHaveLength(5001);
 expect(event.student_changes.filter((s: any) => s.change === 'added')).toHaveLength(5000);
 expect(event.student_changes.filter((s: any) => s.change === 'deleted')).toHaveLength(1);
 const json = JSON.stringify(event);
 expect(json).not.toMatch(/SYNTHETIC_(?:NAME|CLASS|LABEL)_VALUE|studentName|className":"/);
 expect(Buffer.byteLength(json)).toBeLessThan(2 * 1024 * 1024);
 expect(durationMs).toBeGreaterThan(0);
 // These figures are kept in local test output, not public responses or bundles.
 const size = await local.db.query<any>('select pg_column_size(e) bytes from reader_private.roster_audit_events e where id=$1', [event.id]);
 console.info('Synthetic 5000-entry audit overhead', { durationMs: Math.round(durationMs), jsonBytes: Buffer.byteLength(json), rowBytes: size.rows[0].bytes });
}, 60000);


it('upgrades existing rosters without inventing history, copying personal values or changing versions', async () => {
 const migration = '20261102080633_roster_audit.sql';
 const prior = await localDatabase({ beforeMigration: migration });
 try {
  await prior.rpc('reader_admin_bootstrap', { p_user: master, p_email: 'owner@example.test', p_name: 'Owner' });
  await prior.rpc('reader_publish', { p_slug: 'existing', p_title: 'Existing synthetic', p_payload: preparePublication(csvFor(), 'Tag,Name\nRo,Rowan\nMi,Mira') });
  const c = await prior.rpc('reader_roster', { p_actor: master, p_slug: 'existing' }) as RosterContext;
  await prior.rpc('reader_roster', { p_actor: master, p_slug: 'existing', p_action: 'save', p_expected: c.version, p_production: c.productionVersion, p_students: [student('existing')], p_roles: [role('existing')] });
  const before = await prior.rpc('reader_roster', { p_actor: master, p_slug: 'existing' });
  await prior.db.exec(await readFile('supabase/migrations/' + migration, 'utf8'));
  expect(await prior.rpc('reader_roster', { p_actor: master, p_slug: 'existing' })).toEqual(before);
  expect((await prior.db.query('select * from reader_private.roster_audit_events')).rows).toEqual([]);
 } finally { await prior.db.close(); }
}, 60000);
