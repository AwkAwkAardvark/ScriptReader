import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import type { Rpc } from '../server/database';
import type { AdminAuthFactory } from '../server/admin-auth';
import { preparePublication } from '../server/publishing';
import type { ProductionList } from '../src/admin/productions';
import { csvFor, syntheticRecords } from '../src/test/fixtures';
import { startHostedDemo } from './dev-hosted';

const owner = '00000000-0000-4000-8000-000000000001';
/** Runs against local synthetic data only; caller supplies an approved owner session. */
export async function checkTeacherRoleFocus(page: Page, rpc: Rpc, origin: string) {
 const records = syntheticRecords.map(r => r.No === '2' ? { ...r, English: '(quietly) The gate is open.' } : r.No === '4' ? { ...r, Role: 'Together', Tag: 'Ro;Mi' } : r.No === '16' ? { ...r, Tag: 'Act1' } : r);
 const payload = preparePublication(csvFor(records), 'Tag,Name\nRo,Rowan\nMi,Mira\nAct1,Action One\nNil1,Empty role', 'No,YouTubeURL\n9,https://youtu.be/abcdefghijk');
 for (const [slug, before, after] of [['focus-first', 1, 0], ['focus-second', 4, 3]] as const) {
  await rpc('reader_publish', { p_slug: slug, p_title: slug, p_payload: payload });
  const list = await rpc('reader_manage_productions', { p_actor: owner, p_action: 'list' }) as ProductionList;
  const production = list.productions.find(p => p.slug === slug)!;
  await rpc('reader_manage_productions', { p_actor: owner, p_action: 'settings', p_slug: slug, p_expected: production.version, p_data: { title: slug, before, after } });
  const context = await rpc('reader_roster', { p_actor: owner, p_slug: slug }) as { version: string|null; productionVersion: string };
  await rpc('reader_roster', { p_actor: owner, p_slug: slug, p_action: 'save', p_expected: context.version, p_production: context.productionVersion,
   p_students: [{ id: 's1', name: '김민준', className: 'EPG', label: '' }, { id: 's2', name: '이서연', className: 'EPI', label: '' }],
   p_roles: [{ studentId: 's1', tag: 'Ro', performance: '1부' }, { studentId: 's2', tag: 'Mi', performance: '2부' }] });
 }
 const requests: string[] = [];
 page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(new URL(request.url()).pathname); });
 await page.route('**/www.youtube.com/**', route => route.abort());
 await page.goto(origin + '/admin/viewer?production=focus-first');
 await page.locator('[data-record="20"]').waitFor();
 const recordsShown = () => page.locator('[data-record]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-record'))));
 const all = await recordsShown();
 const summary = page.locator('.teacher-settings > summary');
 const open = async () => { if (!await page.locator('.teacher-settings').evaluate((node: HTMLDetailsElement) => node.open)) await summary.click(); };
 await open();
 assert.equal(await page.getByLabel('Character', { exact: true }).inputValue(), '');
 const initialRequests = requests.length;
 await page.getByLabel('Character', { exact: true }).selectOption('Ro');
 assert.equal(await page.getByRole('slider', { name: 'Before', exact: true }).inputValue(), '1');
 assert.equal(await page.getByRole('slider', { name: 'After', exact: true }).inputValue(), '0');
 assert.equal(await page.getByLabel('Hide actions & cues').isChecked(), false);
 assert.ok((await recordsShown()).length < all.length);
 assert.ok(await page.locator('[data-record="4"]').evaluate(node => node.classList.contains('highlighted')));
 assert.equal(await page.locator('[data-record="4"] .teacher-cast').count(), 2);
 assert.ok((await page.locator('[data-record="4"]').textContent())?.includes('김민준'));
 assert.ok((await page.locator('[data-record="4"]').textContent())?.includes('이서연'));
 const focused = await recordsShown();
 await page.getByLabel('EPI', { exact: true }).check(); await page.getByRole('radio', { name: '2부', exact: true }).check();
 assert.deepEqual(await recordsShown(), focused);
 assert.equal(await page.locator('[data-record="4"] .teacher-role-selected').textContent(), 'Mira');
 assert.ok(await page.locator('[data-record="2"]').evaluate(node => node.classList.contains('highlighted')));
 await page.getByRole('slider', { name: 'Before', exact: true }).focus(); await page.keyboard.press('Home');
 await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('slider', { name: 'Before', exact: true }).inputValue(), '2');
 await page.getByRole('slider', { name: 'After', exact: true }).fill('3');
 await page.getByLabel('Hide actions & cues').check();
 assert.equal(await page.locator('.script-entry.direction').count(), 0);
 assert.equal(await page.locator('[data-record="2"] .inline-stage-action').textContent(), '(quietly)');
 await page.getByLabel('Character', { exact: true }).selectOption('Mi');
 assert.equal(await page.getByRole('slider', { name: 'Before', exact: true }).inputValue(), '2');
 assert.equal(await page.getByRole('slider', { name: 'After', exact: true }).inputValue(), '3');
 await page.getByLabel('Hide actions & cues').uncheck();
 assert.equal(await page.locator('.teacher-chapters a').count(), 1);
 await page.locator('[data-record="9"] .video-toggle').click(); assert.equal(await page.locator('.song-player iframe').count(), 1);
 await page.getByLabel('Character', { exact: true }).selectOption('Ro'); assert.equal(await page.locator('.song-player iframe').count(), 0);
 await page.getByLabel('Display Korean lines').uncheck(); assert.equal(await page.locator('.teacher-reading-content .translation').count(), 0);
 await page.getByLabel('Character', { exact: true }).selectOption('Nil1'); assert.equal(await page.locator('[data-record]').count(), 0); assert.equal(await page.locator('.teacher-chapters').count(), 0);
 await page.getByLabel('Character', { exact: true }).selectOption('Act1'); assert.equal(await page.locator('[data-record="16"]').count(), 1);
 await page.getByLabel('Hide actions & cues').check(); assert.equal(await page.locator('[data-record]').count(), 0);
 await page.getByLabel('Character', { exact: true }).selectOption(''); assert.deepEqual(await recordsShown(), all);
 assert.equal(requests.length, initialRequests, 'local focus/rehearsal controls must not fetch or use anonymous quotas');
 await page.getByLabel('Production', { exact: true }).selectOption('focus-second');
 await page.locator('.teacher-view[aria-busy="false"] [data-record="20"]').waitFor();
 assert.equal(await page.getByLabel('Character', { exact: true }).inputValue(), '');
 await page.getByLabel('Character', { exact: true }).selectOption('Ro');
 assert.equal(await page.getByRole('slider', { name: 'Before', exact: true }).inputValue(), '4');
 assert.equal(await page.getByRole('slider', { name: 'After', exact: true }).inputValue(), '3');
 assert.equal(await page.getByLabel('Hide actions & cues').isChecked(), false);
 for (const width of [320, 390, 1440]) {
  await page.setViewportSize({ width, height: 900 }); await open();
  await page.getByRole('slider', { name: /Text size/ }).fill('250');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByLabel('Character', { exact: true }).selectOption('Mi');
  const chapter = page.locator('.teacher-chapters a').last(); const href = await chapter.getAttribute('href'); await chapter.click();
  await page.waitForFunction(id => document.activeElement?.id === id, href!.slice(1));
  await open(); await page.getByLabel('Character', { exact: true }).focus(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.teacher-settings').evaluate((node: HTMLDetailsElement) => node.open), false);
 }
 await page.getByRole('button', { name: '한국어', exact: true }).click(); await open();
 assert.equal(await page.getByRole('option', { name: '전체 배역' }).count(), 1);
 await page.getByLabel('배역', { exact: true }).selectOption('Ro');
 assert.equal(await page.getByRole('slider', { name: '앞', exact: true }).getAttribute('max'), '5');
 assert.ok(await page.getByLabel('동작·큐 숨기기').isVisible());
 await page.reload(); await page.locator('[data-record="20"]').waitFor(); await open();
 assert.equal(await page.getByLabel('Character', { exact: true }).inputValue(), '');
 assert.equal(await page.getByRole('slider', { name: /Text size/ }).inputValue(), '100');
 assert.equal(requests.some(path => !path.startsWith('/api/admin/')), false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const auth: AdminAuthFactory = () => ({ user: async () => ({ id: owner, email: 'owner@example.test', name: 'Synthetic owner' }), start: async () => null, exchange: async () => false, signOut: async () => {} });
 const demo = await startHostedDemo(8796, 5186, { adminAuthFactory: auth });
 const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
 try {
  await demo.rpc('reader_admin_bootstrap', { p_user: owner, p_email: 'owner@example.test', p_name: 'Synthetic owner' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await checkTeacherRoleFocus(page, demo.rpc, demo.origin); assert.deepEqual(errors, []);
  console.log('Teacher role focus browser checks passed.');
 } finally { await browser.close(); await demo.close(); }
}
