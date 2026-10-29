import { csvFor } from '../src/test/fixtures';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startHostedDemo } from './dev-hosted';
import type { AdminAuthFactory } from '../server/admin-auth';

// Local-only identity provider fixture. Production entrypoints never install this factory.
const people = {
  owner: { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test', name: 'Workshop owner' },
  staff: { id: '00000000-0000-4000-8000-000000000002', email: 'staff@example.test', name: 'Workshop staff' },
};
const auth: AdminAuthFactory = (request, _env, headers) => ({
  user: async () => {
    const selected = request.headers.get('Cookie')?.match(/(?:^|;\s*)admin-fixture=(owner|staff)(?:;|$)/)?.[1];
    return selected ? people[selected as keyof typeof people] : null;
  },
  start: async () => new URL('/api/admin/auth/callback?code=owner', request.url).href,
  exchange: async code => {
    if (!(code in people)) return false;
    headers.append('Set-Cookie', `admin-fixture=${code}; HttpOnly; SameSite=Lax; Path=/`);return true;
  },
  signOut: async () => { headers.append('Set-Cookie', 'admin-fixture=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'); },
});
const out = resolve('.agent-local/previews/admin');await mkdir(out, { recursive: true });
const demo = await startHostedDemo(8792, 5182, { adminAuthFactory: auth });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  await demo.rpc('reader_admin_bootstrap', { p_user: people.owner.id, p_email: people.owner.email, p_name: people.owner.name });
  const owner = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const staff = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors: string[] = [];owner.on('pageerror', e => errors.push(e.message));staff.on('pageerror', e => errors.push(e.message));
  await owner.goto(demo.origin + '/admin');
  assert.equal((await owner.request.get(demo.origin + '/api/admin/accounts')).status(), 401);
  await owner.getByRole('button', { name: 'Continue with Google' }).click();
  await owner.getByRole('link', { name: 'Access Management', exact: true }).click();
  await owner.getByRole('heading', { name: 'Access Management', exact: true }).waitFor();
  await staff.goto(demo.origin + '/api/admin/auth/callback?code=staff');
  await staff.getByRole('button', { name: 'Request access', exact: true }).click();
  await staff.getByText('Awaiting approval', { exact: true }).waitFor();
  assert.equal((await staff.request.get(demo.origin + '/api/admin/accounts')).status(), 403);
  await owner.reload();
  let staffRow = owner.locator('.admin-account').filter({ hasText: people.staff.email });
  await staffRow.getByRole('button', { name: 'Grant access' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await staffRow.locator('.admin-badge').filter({ hasText: /^Admin$/ }).waitFor();
  await staff.reload();await staff.getByRole('button', { name: 'Sign out' }).waitFor();
  assert.equal(await staff.getByRole('heading', { name: 'Access Management', exact: true }).count(), 0);
  await staff.getByRole('link',{name:'Scripts',exact:true}).click();
  // Approved staff can publish, but cannot manage accounts. All files are fictional.
  await staff.getByRole('button', { name: 'New production', exact: true }).click();
  await staff.getByLabel('Reader title', { exact: true }).fill('Workshop 2027');
  await staff.getByRole('group',{name:'Default context',exact:true}).getByRole('slider',{name:'Before',exact:true}).fill('5');
  await staff.getByRole('group',{name:'Default context',exact:true}).getByRole('slider',{name:'After',exact:true}).fill('0');
  const sampleDownload=staff.waitForEvent('download');
  await staff.getByRole('button',{name:'Download example',exact:true}).first().click();
  assert.equal((await sampleDownload).suggestedFilename(),'script-example.csv');
  await staff.getByLabel('Script CSV', { exact: true }).setInputFiles({name:'script.csv',mimeType:'text/csv',buffer:Buffer.from(csvFor())});
  await staff.getByLabel('Cast CSV', { exact: true }).setInputFiles({name:'cast.csv',mimeType:'text/csv',buffer:Buffer.from('Tag,Name\nRo,Rowan\nMi,Mira\nA1,One\nA2,Two\nA3,Three\nA4,Four')});
  await staff.getByRole('button', {name:'Validate and preview',exact:true}).click();
  await staff.getByRole('heading', {name:'Validation passed',exact:true}).waitFor();
  assert.ok(await staff.locator('.production-preview .script-entry').count()>0);
  for(const width of [320,390,1440]) {
    await staff.setViewportSize({width,height:1000});
    assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await staff.screenshot({path:join(out,`production-preview-${width}.png`),fullPage:true});
  }
  await staff.getByRole('button',{name:'한국어',exact:true}).click();
  await staff.getByRole('heading',{name:'검사 완료',exact:true}).waitFor();
  await staff.setViewportSize({width:390,height:1000});
  await staff.screenshot({path:join(out,'production-preview-ko.png'),fullPage:true});
  await staff.getByRole('button',{name:'ENG',exact:true}).click();
  await staff.getByRole('button',{name:'Publish',exact:true}).click();
  await staff.getByRole('dialog').getByRole('button',{name:'Publish',exact:true}).click();
  await staff.getByLabel('Choose a production',{exact:true}).locator('option[value=workshop-2027]').waitFor({state:'attached'});
  await staff.getByLabel('Choose a production',{exact:true}).selectOption('workshop-2027');
  await staff.getByRole('link',{name:'Open student reader',exact:true}).waitFor();
  await staff.getByLabel('Student homepage',{exact:true}).selectOption('workshop-2027');
  await Promise.all([staff.waitForResponse(r=>r.url().endsWith('/api/admin/home')&&r.request().method()==='PATCH'),staff.getByRole('button',{name:'Save homepage',exact:true}).click()]);
  assert.deepEqual(await (await staff.request.get(demo.origin+'/api/home')).json(),{destination:'/p/workshop-2027'});
  const reader=await browser.newPage();
  await reader.goto(demo.origin+'/p/workshop-2027');
  await reader.getByLabel('Character',{exact:true}).selectOption('Ro');
  await reader.locator('.script-entry').first().waitFor();
  assert.equal(await reader.getByLabel('Before',{exact:true}).inputValue(),'5');
  assert.equal(await reader.getByLabel('After',{exact:true}).inputValue(),'0');
  await reader.getByLabel('Before',{exact:true}).fill('3');
  await reader.getByLabel('Character',{exact:true}).selectOption('Mi');
  assert.equal(await reader.getByLabel('Before',{exact:true}).inputValue(),'3');
  await reader.close();
  await staff.getByLabel('Choose a production',{exact:true}).selectOption('workshop-2027');
  await staff.getByRole('heading',{name:'Workshop 2027',exact:true}).waitFor();
  await staff.waitForFunction(()=>!document.querySelector<HTMLFieldSetElement>('.production-editor fieldset')?.disabled);
  assert.ok(staff.url().includes('production=workshop-2027'));
  assert.equal(await staff.locator('.upload-card').getAttribute('open'),null);
  await staff.locator('.upload-card > summary').click();
  assert.equal(await staff.locator('.csv-example[open]').count(),0);
  assert.ok(await staff.getByLabel('Script CSV',{exact:true}).isVisible());
  await staff.goto(demo.origin+'/admin/songs?production=workshop-2027');
  await staff.locator('.songs-card').waitFor({state:'attached'});
  assert.equal(await staff.locator('.songs-card').getAttribute('open'),null);
  await staff.locator('.songs-card > summary').click();
  await staff.getByLabel('YouTube URL: 9',{exact:true}).fill('https://youtu.be/abcdefghijk');
  await staff.getByRole('button',{name:'Save song links',exact:true}).click();
  await staff.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await staff.getByText('Saved.',{exact:true}).waitFor();
  await staff.reload();await staff.locator('.songs-card').waitFor({state:'attached'});
  if(!await staff.locator('.songs-card').evaluate(e=>e.hasAttribute('open')))await staff.locator('.songs-card > summary').click();
  assert.equal(await staff.getByLabel('YouTube URL: 9',{exact:true}).inputValue(),'https://youtu.be/abcdefghijk');
  assert.ok(await staff.getByRole('heading',{name:'A little time to wonder',exact:true}).isVisible());
  assert.ok(await staff.getByText('Line 9',{exact:true}).isVisible());
  assert.equal(await staff.getByRole('link',{name:'Open current video',exact:true}).count(),1);
  const unavailable=staff.getByRole('button',{name:'Open current video',exact:true});assert.equal(await unavailable.count(),2);assert.ok(await unavailable.first().isDisabled());

  for(const width of [320,390,1440]){await staff.setViewportSize({width,height:1000});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await staff.screenshot({path:join(out,`songs-${width}.png`),fullPage:true});}
  const songMetadata=await (await staff.request.get(demo.origin+'/api/admin/productions/workshop-2027/songs')).json();
  assert.equal(songMetadata.songs.length,3);assert.equal(songMetadata.payload,undefined);
  await staff.goto(demo.origin+'/admin/scripts?production=workshop-2027');
  await staff.getByLabel('Reader title',{exact:true}).waitFor();
  assert.equal(await staff.locator('.upload-card').getAttribute('open'),null);
  assert.equal(await staff.getByLabel('Link identifier',{exact:true}).count(),0);
  await staff.getByLabel('Reader title',{exact:true}).fill('Workshop 2027 revised');
  for(const width of [320,390,1440]){await staff.setViewportSize({width,height:1000});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await staff.screenshot({path:join(out,`script-actions-${width}.png`),fullPage:true});}
  await staff.getByRole('button',{name:'Save production settings',exact:true}).click();
  await staff.getByLabel('Choose a production',{exact:true}).locator('option').filter({hasText:'Workshop 2027 revised'}).waitFor({state:'attached'});
  await staff.getByLabel('Student homepage',{exact:true}).selectOption('');
  await Promise.all([staff.waitForResponse(r=>r.url().endsWith('/api/admin/home')&&r.request().method()==='PATCH'),staff.getByRole('button',{name:'Save homepage',exact:true}).click()]);
  await staff.getByRole('button',{name:'Save homepage',exact:true}).waitFor();
  await staff.waitForFunction(()=>document.querySelector<HTMLButtonElement>('#student-home + button')?.disabled===true);
  assert.deepEqual(await (await staff.request.get(demo.origin+'/api/home')).json(),{destination:'/import'});
  await staffRow.getByRole('combobox').selectOption('master');
  await staffRow.getByRole('button', { name: 'Save access' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await staffRow.locator('.admin-badge').filter({ hasText: /^Master$/ }).waitFor();
  await staff.reload();await staff.getByRole('link',{name:'Access Management',exact:true}).click();await staff.getByRole('heading', { name: 'Access Management', exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await owner.setViewportSize({ width, height: 1000 });
    assert.ok(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await owner.screenshot({ path: join(out, `master-${width}.png`), fullPage: true });
  }
  const self = owner.locator('.admin-account').filter({ hasText: people.owner.email });
  await self.getByRole('combobox').selectOption('admin');await self.getByRole('button', { name: 'Save access' }).click();
  assert.ok(await owner.getByRole('dialog').getByText('This will change your own access.').isVisible());
  await owner.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await owner.waitForFunction(() => !document.querySelector('.admin-account-group'));
  await staff.reload();
  let oldOwner = staff.locator('.admin-account').filter({ hasText: people.owner.email });
  await oldOwner.getByRole('button', { name: 'Revoke', exact: true }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await oldOwner.getByText('Access revoked', { exact: true }).waitFor();
  assert.equal((await owner.request.get(demo.origin + '/api/admin/accounts')).status(), 403);
  await owner.reload();await owner.getByRole('button', { name: 'Request access again' }).click();
  await owner.getByText('Awaiting approval', { exact: true }).waitFor();
  await staff.reload();oldOwner = staff.locator('.admin-account').filter({ hasText: people.owner.email });
  await oldOwner.getByRole('button', { name: 'Grant access' }).waitFor();
  const last = staff.locator('.admin-account').filter({ hasText: people.staff.email });
  assert.ok(await last.getByRole('button', { name: 'Revoke', exact: true }).isDisabled());
  await staff.getByRole('button', { name: '한국어' }).click();
  await staff.getByRole('heading', { name: '권한 관리' }).waitFor();
  await staff.screenshot({ path: join(out, 'master-ko-390.png'), fullPage: true });
  await staff.goto(demo.origin+'/admin?lang=ko');
  await staff.getByRole('button', { name: '로그아웃' }).click();
  await staff.getByRole('button', { name: 'Google로 로그인' }).waitFor();
  assert.equal((await staff.request.get(demo.origin + '/api/admin/accounts')).status(), 401);
  assert.deepEqual(errors, []);
  console.log('Admin browser checks passed: publishing/preview, defaults, homepage, settings, login, requests, approval, handover, revocation/re-request, last-master protection, Korean, mobile/desktop and logout.');
} finally { await browser.close();await demo.close(); }
