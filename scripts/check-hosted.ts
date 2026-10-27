import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { startHostedDemo } from './dev-hosted';
import { publish } from './publish';
import { csvFor } from '../src/test/fixtures';

const out = resolve('.agent-local/previews/milestone-3');
await mkdir(out, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'reader-publish-'));
const demo = await startHostedDemo(8790, 5180);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  // Exercise the same CLI validation/publication path, backed by real local PostgreSQL.
  await writeFile(join(temporary, 'script.csv'), csvFor());
  await writeFile(join(temporary, 'cast.csv'), 'Tag,Name\nRo,Rowan Reed\nMi,Mira Moss');
  await publish(['--slug', 'publisher-check', '--title', 'Publisher check', '--script', join(temporary, 'script.csv'), '--cast', join(temporary, 'cast.csv')], demo.rpc);
  const absent = await demo.rpc('reader_fetch', { p_slug: 'publisher-check', p_browser: '1'.repeat(64), p_ip: '2'.repeat(64), p_new_browser: false }) as { error?: string };
  assert.equal(absent.error, 'not_found');
  await publish(['--slug', 'publisher-check', '--title', 'Publisher check', '--script', join(temporary, 'script.csv'), '--cast', join(temporary, 'cast.csv'), '--publish'], demo.rpc);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; const calls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) console.log('API check:', response.status(), new URL(response.url()).pathname); });
  page.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Synthetic player</p>' }));
  await page.goto(demo.origin + '/p/synthetic-garden');
  await page.waitForFunction(() => !document.querySelector<HTMLSelectElement>('#character')?.disabled || Boolean(document.querySelector('[role=alert]')));
  assert.equal(await page.getByRole('alert').count(), 0, await page.locator('.reader').innerText());
  await page.getByLabel('Character', { exact: true }).selectOption('Ro');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.print-button')?.disabled);
  assert.equal(await page.getByRole('radio', { name: 'Default' }).isChecked(), true);
  assert.equal(await page.locator('h1.production-title').count(), 1);
  assert.equal(await page.locator('.controls .production-title').count(), 0);
  assert.equal(await page.locator('.controls .print-button').count(), 0);
  const initialCalls = calls.length;
  await page.getByRole('radio', { name: '±1', exact: true }).check();
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.print-button')?.disabled);
  assert.equal(calls.length, initialCalls);
  await page.getByRole('radio', { name: '±5', exact: true }).check();
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.print-button')?.disabled);
  assert.equal(calls.length, initialCalls + 1);
  await page.getByRole('checkbox', { name: 'Display Korean lines' }).check();
  await page.screenshot({ path: join(out, 'hosted-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /Play video:/ }).first().click();
  assert.equal(await page.locator('iframe').count(), 1);
  assert.equal(await page.getByRole('link', { name: 'Open on YouTube' }).count(), 1);
  await page.pdf({ path: join(out, 'hosted-print.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.song-player').isVisible(), false);
  assert.equal(await page.locator('.controls').isVisible(), false);
  await page.emulateMedia({ media: null });
  await page.getByRole('button', { name: /Play video:/ }).first().click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.waitForFunction(() => document.querySelector('.settings-summary')?.getAttribute('aria-expanded') === 'false');
    assert.equal((await page.locator('.settings-summary').innerText()).replace(/\s+/g, ' '), 'Workshop Musical 2026: The Paper Garden ☰');
    assert.equal(await page.locator('.settings-summary').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#reader-title').isVisible(), false);
    assert.equal(await page.locator('.production-title').evaluate(e => e.clientWidth), 1);
    await page.screenshot({ path: join(out, `hosted-mobile-${width}.png`), fullPage: true });
  }
  async function openSettings() { const summary = page.locator('.settings-summary'); if (await summary.isVisible() && await summary.getAttribute('aria-expanded') === 'false') await summary.click(); }
  // Ro plus four more characters admitted; the sixth is denied by the actual database.
  for (const tag of ['Mi', 'A1', 'A2', 'A3']) {
    await openSettings();
    await page.getByLabel('Character', { exact: true }).selectOption(tag);
    await page.waitForFunction(() => document.querySelector('.reader')?.getAttribute('aria-busy') === 'false');
    await page.getByText(/characters today/).filter({ hasText: tag === 'A3' ? '5/5' : '' }).waitFor({ state: 'attached' });
  }
  await openSettings();
  await page.getByLabel('Character', { exact: true }).selectOption('A4');
  await page.getByRole('alert').filter({ hasText: 'Daily character allowance reached.' }).waitFor();
  await openSettings();
  await page.getByLabel('Character', { exact: true }).selectOption('Ro');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.print-button')?.disabled);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  const cookies = await page.context().cookies();
  assert.ok(cookies.some(cookie => cookie.name === '__Host-sr-browser' && cookie.httpOnly && cookie.secure));
  await page.reload();
  await page.getByLabel('Character', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-record]').count(), 0);
  await page.getByText('5/5 characters today', { exact: true }).waitFor();
  await page.goto(demo.origin + '/p/publisher-check');
  await page.getByLabel('Character', { exact: true }).selectOption('Ro');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.print-button')?.disabled);
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'browser-results.json'), JSON.stringify({ passed: true, initialCalls, localCacheInstant: true, quotaEnforced: true, publisherValidated: true, pageErrors: errors }, null, 2));
  console.log(`Hosted browser checks passed. Review output: ${out}`);
} finally {
  await browser.close(); await demo.close(); await rm(temporary, { recursive: true, force: true });
}
