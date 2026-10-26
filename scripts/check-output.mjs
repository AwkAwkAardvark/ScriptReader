import { chromium } from 'playwright';
import { mkdir, copyFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Run after build:demo. All content in this check is fictional and generated here.
const out = resolve('.agent-local/previews/milestone-2');
await mkdir(out, { recursive: true });
const isolated = await mkdtemp(join(tmpdir(), 'script-reader-offline-'));
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const csv = rows => ['No,Scene,Role,English,Korean,Type,Notes,Tag,Optional', ...rows.map(row => row.map(quote).join(','))].join('\n');
const short = [
  [1, 1, '', 'The paper garden', '종이 정원', 'Title', '', '', ''],
  [2, 1, 'Rowan', 'The gate is open. Shall we take a look?', '문이 열려 있어요.', 'Line', '', 'Ro', ''],
  [3, 1, '', '(A paper bird lands beside the bench.)', '(종이 새가 벤치 옆에 내려앉는다.)', 'StageDirection', '', '', ''],
  [4, 1, 'Mira', 'Someone has left us a message.', '누군가 메시지를 남겼어요.', 'Line', '', 'Mi', ''],
  [5, 1, '', 'A little time to wonder', '잠시 생각할 시간', 'Song', '', '', ''],
  [6, 1, 'Rowan', 'We can follow the lanterns home.', '등불을 따라 집으로 갈 수 있어요.', 'Line', '', 'Ro', ''],
];
const buttonName = /^(Print \/ Save PDF|인쇄 \/ PDF 저장)$/;
async function load(page, rows) {
  await page.getByLabel(/^(Script file|대본 파일)$/).setInputFiles({ name: 'synthetic-script.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(rows)) });
  await page.getByLabel(/^(Cast file|배역 목록 파일)$/).setInputFiles({ name: 'synthetic-cast.csv', mimeType: 'text/csv', buffer: Buffer.from('Tag,Name\nRo,Rowan Reed\nMi,Mira Moss\nUn,Unused') });
  await page.getByLabel(/^(Character|배역)$/).selectOption('Ro');
  const summary = page.locator('.settings-summary');
  if (await summary.isVisible() && await summary.getAttribute('aria-expanded') === 'false') await summary.click();
  await page.getByRole('radio', { name: '±3', exact: true }).check();
  await page.waitForFunction(() => !document.querySelector('.print-button').disabled);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL ?? 'http://127.0.0.1:4174/import');
  assert.equal(await page.getByRole('button', { name: buttonName }).isDisabled(), true);
  await load(page, short);
  await page.getByRole('checkbox', { name: 'Display Korean lines' }).check();
  const order = await page.locator('[data-record]').evaluateAll(elements => elements.map(element => element.dataset.record));
  assert.deepEqual(order, ['2', '3', '4', '5', '6']);
  await page.screenshot({ path: join(out, 'desktop.png'), fullPage: true });
  await page.pdf({ path: join(out, 'staff-sample-bilingual.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'print' });
  assert.deepEqual(await page.locator('[data-record]').evaluateAll(elements => elements.map(element => element.dataset.record)), order);
  const styles = await page.locator('[data-record="2"] p').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: style.fontSize, color: style.color, weight: style.fontWeight, italic: style.fontStyle };
  }));
  assert.equal(styles[0].font.includes('ScriptReaderPrint'), true);
  assert.ok(Math.abs(parseFloat(styles[0].size) - 11 * 96 / 72) < .02);
  assert.equal(styles[0].color, 'rgb(17, 17, 17)');
  assert.equal(styles[1].size, '12px');
  assert.equal(styles[1].weight, '300');
  assert.equal(styles[1].italic, 'italic');
  assert.equal(await page.locator('.controls').isVisible(), false);
  await page.emulateMedia({ media: 'screen' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(out, `mobile-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ media: null });
  await page.getByRole('button', { name: '한국어' }).click();
  await page.pdf({ path: join(out, 'staff-sample-korean-interface.pdf'), preferCSSPageSize: true });
  const long = [[1, 1, '', 'Pagination exercise', '', 'Title', '', '', '']];
  for (let i = 0; i < 65; i++) long.push([i + 2, 1, 'Rowan', `ENTRY${String(i).padStart(3, '0')} A paper lantern lights the garden path. We follow the ticking through the workshop, past the fountain and up the stairs. ENDROW${String(i).padStart(3, '0')}`, `연습 문장 ${i}. 종이 등불을 따라 정원 길을 걸어요.`, 'Line', '', 'Ro', '']);
  long.push([67, 2, '', 'Oversized entry', '', 'Title', '', '', '']);
  long.push([68, 2, 'Rowan', Array.from({ length: 130 }, (_, i) => `TALL${String(i).padStart(3, '0')} The paper clock keeps ticking.`).join('\n'), '마지막 한국어 문장입니다.', 'Line', '', 'Ro', '']);
  long.push([69, 2, 'Rowan', 'FINAL_SENTINEL The lantern is safely home.', '', 'Line', '', 'Ro', '']);
  await load(page, long);
  await page.pdf({ path: join(out, 'pagination-stress.pdf'), preferCSSPageSize: true });
  assert.equal(await page.locator('.passage-window.print-split').count(), 2);
  assert.equal(await page.locator('.script-entry.print-split').count(), 1);
  const settings = page.locator('.settings-summary');
  if (await settings.isVisible() && await settings.getAttribute('aria-expanded') === 'false') await settings.click();
  await page.getByLabel('배역', { exact: true }).selectOption('Un');
  assert.equal(await page.getByRole('button', { name: buttonName }).isDisabled(), true);

  // Copy only the HTML: no neighbouring build assets, internet, or development server.
  const demoPath = join(isolated, 'ScriptReader-demo.html');
  await copyFile(resolve('.agent-local/demo/ScriptReader-demo.html'), demoPath);
  const context = await browser.newContext({ offline: true });
  const demo = await context.newPage();
  const network = [];
  demo.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  demo.on('pageerror', error => errors.push(error.message));
  await demo.goto(pathToFileURL(demoPath).href);
  await load(demo, short);
  await demo.getByRole('checkbox', { name: 'Display Korean lines' }).check();
  assert.equal(await demo.locator('[data-record="2"]').count(), 1);
  await demo.pdf({ path: join(out, 'offline-demo.pdf'), preferCSSPageSize: true });
  assert.deepEqual(network, []);
  assert.deepEqual(errors, []);
  assert.equal(await demo.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await demo.reload();
  assert.equal(await demo.locator('[data-record]').count(), 0);
  await writeFile(join(out, 'browser-results.json'), JSON.stringify({ offlineHttpRequests: network, pageErrors: errors,
    offlineReloadClearsScript: true, widths: [1440, 390, 320], printStyles: styles, syntheticPdfReview: 'Use check-pdf.py to inspect text and pagination.' }, null, 2));
  console.log(`Browser checks passed. Synthetic review output: ${out}`);
} finally {
  await browser.close();
  await rm(isolated, { recursive: true, force: true });
}
