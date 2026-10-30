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
  // Private rehearsal workflow: synthetic assignments only, separate from script revisions.
  await staff.goto(demo.origin+'/admin/assignments?production=workshop-2027');
  await staff.getByText('CSV format',{exact:true}).click();
  const csvExample=staff.getByLabel('Assignment CSV example',{exact:true});
  await csvExample.waitFor();
  assert.ok((await csvExample.innerText()).includes('김민준'));
  for(const width of [320,390,1440]) {
    await staff.setViewportSize({width,height:1000});
    assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===320) assert.ok(await csvExample.evaluate(e=>e.scrollWidth>e.clientWidth));
    await csvExample.focus();
    await staff.screenshot({path:join(out,`assignment-example-${width}.png`),fullPage:true});
  }
  await staff.setViewportSize({width:390,height:1000});
  await staff.getByRole('button',{name:'한국어',exact:true}).click();
  await staff.getByLabel('배역 배정 CSV 예시',{exact:true}).waitFor();
  assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await staff.getByRole('button',{name:'ENG',exact:true}).click();
  const assignmentCsv='StudentId,StudentName,Class,Performance,Tag\ns1,PRIVATE_STUDENT_FIXTURE,Class A,1부,Ro\ns1,PRIVATE_STUDENT_FIXTURE,Class A,2부,Ro\ns2,Example Student Two,Class B,2부,Mi';
  await staff.getByLabel('Assignment CSV',{exact:true}).setInputFiles({name:'assignments.csv',mimeType:'text/csv',buffer:Buffer.from(assignmentCsv)});
  await staff.getByRole('button',{name:'Validate and preview',exact:true}).click();
  await staff.getByRole('heading',{name:'Assignment preview',exact:true}).waitFor();
  await staff.getByRole('button',{name:'Save assignments',exact:true}).click();
  await staff.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await staff.getByText('Saved.',{exact:true}).waitFor();
  await staff.getByRole('link',{name:'Open teacher viewer',exact:true}).click();
  await staff.locator('.teacher-view .script-entry').first().waitFor();
  assert.equal(await staff.locator('.teacher-settings').getAttribute('open'),null);
  assert.equal(await staff.locator('.teacher-settings .teacher-menu-bars > span').count(),3);
  const iconOffset=await staff.locator('.teacher-settings > summary').evaluate(el=>{const outer=el.getBoundingClientRect(),icon=el.querySelector('.menu-icon')!.getBoundingClientRect();return {x:icon.x+icon.width/2-outer.x-outer.width/2,y:icon.y+icon.height/2-outer.y-outer.height/2};});
  assert.ok(Math.abs(iconOffset.x)<=.5&&Math.abs(iconOffset.y)<=.5);
  assert.equal(await staff.locator('.teacher-settings > summary').getAttribute('aria-label'),'Workshop 2027 revised · Both — Reading settings');
  assert.equal(await staff.locator('.teacher-view .script-entry.highlighted').count(),0);
  const recordCount=await staff.locator('.teacher-view [data-record]').count();
  assert.equal(recordCount,17); // three scene headings are outside data-record entries
  await staff.locator('.teacher-settings > summary').click();
  const readingFont=await staff.locator('.teacher-view .script-entry[data-record=\"2\"] .entry-text > p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  const toolsFont=await staff.locator('.teacher-settings > summary').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  const fixedReadingFonts=await staff.locator('.teacher-reading-content').evaluate(root=>Object.fromEntries(['.entry-name','.teacher-cast','.translation','.scene-heading','.teacher-column-key'].map(selector=>[selector,getComputedStyle(root.querySelector(selector)!).fontSize])));
  await staff.getByRole('slider',{name:'Text size',exact:false}).fill('200');
  assert.equal(await staff.locator('.teacher-view .script-entry[data-record=\"2\"] .entry-text > p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),readingFont*2);
  assert.equal(await staff.locator('.teacher-settings > summary').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),toolsFont);
  assert.deepEqual(await staff.locator('.teacher-reading-content').evaluate(root=>Object.fromEntries(['.entry-name','.teacher-cast','.translation','.scene-heading','.teacher-column-key'].map(selector=>[selector,getComputedStyle(root.querySelector(selector)!).fontSize]))),fixedReadingFonts);
  await staff.getByRole('button',{name:'Reset size',exact:true}).click();
  await staff.getByRole('checkbox',{name:'Class A',exact:true}).check();
  assert.ok(await staff.locator('.teacher-view .script-entry[data-record="2"]').evaluate(e=>e.classList.contains('highlighted')));
  await staff.getByRole('checkbox',{name:'Class B',exact:true}).check();
  await staff.getByRole('radio',{name:'1부',exact:true}).check();
  assert.ok(await staff.locator('.teacher-view .script-entry[data-record="4"]').evaluate(e=>!e.classList.contains('highlighted')));
  assert.equal(await staff.locator('.teacher-view [data-record]').count(),recordCount);
  await staff.locator('.teacher-settings > summary').click();
  for(const width of [320,390,1440]) {await staff.setViewportSize({width,height:1000});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await staff.screenshot({path:join(out,`teacher-${width}.png`),fullPage:true});}
  await staff.setViewportSize({width:390,height:700});
  await staff.evaluate(()=>window.scrollTo(0,800));await staff.waitForTimeout(100);
  const viewerBar=await staff.locator('.teacher-settings').boundingBox();assert.ok(viewerBar&&viewerBar.y>=0&&viewerBar.y<=10&&viewerBar.height<=64);
  const anchorTop=await staff.locator('.teacher-view [data-record="10"]').evaluate(e=>e.getBoundingClientRect().top);
  await staff.locator('.teacher-settings > summary').click();
  await staff.screenshot({path:join(out,'teacher-floating-expanded-390.png')});
  assert.ok(Math.abs(await staff.locator('.teacher-view [data-record="10"]').evaluate(e=>e.getBoundingClientRect().top)-anchorTop)<2);
  await staff.getByRole('radio',{name:'2부',exact:true}).check();assert.ok(await staff.evaluate(()=>window.scrollY>200));
  await staff.keyboard.press('Escape');assert.equal(await staff.locator('.teacher-settings').getAttribute('open'),null);
  await staff.screenshot({path:join(out,'teacher-floating-390.png')});
  await staff.evaluate(()=>window.scrollTo(0,0));
  await staff.getByRole('button',{name:'한국어',exact:true}).click();
  await staff.getByRole('heading',{name:'교사용 대본',exact:true}).waitFor();
  await staff.screenshot({path:join(out,'teacher-ko.png'),fullPage:true});
  const privateResponse=await staff.request.get(demo.origin+'/api/admin/productions/workshop-2027/viewer');
  assert.equal(privateResponse.headers()['cache-control'],'private, no-store');
  const anonymous=await browser.newPage();
  assert.equal((await anonymous.request.get(demo.origin+'/api/admin/productions/workshop-2027/viewer')).status(),401);
  await anonymous.goto(demo.origin+'/p/workshop-2027');
  await anonymous.getByLabel('Character',{exact:true}).selectOption('Ro');
  await anonymous.locator('.script-entry').first().waitFor();
  assert.ok(!(await anonymous.locator('body').innerText()).includes('PRIVATE_STUDENT_FIXTURE'));
  await anonymous.close();
  // Actual roster editor against the local database; production data is never used.
  await staff.goto(demo.origin+'/admin/roster?production=workshop-2027');
  await staff.getByRole('button',{name:'Rowan · 1부: PRIVATE_STUDENT_FIXTURE · Class A',exact:true}).click();
  await staff.getByRole('button',{name:'Edit details: PRIVATE_STUDENT_FIXTURE · 1부 Rowan, 2부 Rowan',exact:true}).click();
  await staff.getByLabel('Name',{exact:true}).fill('김민준');await staff.getByLabel('Class',{exact:true}).fill('EPG');
  await staff.getByRole('button',{name:'Update student',exact:true}).click();await staff.getByRole('button',{name:'Close',exact:true}).click();
  await staff.getByRole('button',{name:'Mira · 1부: Unassigned',exact:true}).click();
  await staff.getByRole('button',{name:'김민준 · EPG · 1부 Rowan, 2부 Rowan',exact:true}).click();
  assert.equal(await staff.locator('.roster-cast-button.roster-multi-role').count(),3);
  await staff.getByRole('button',{name:'Add student',exact:true}).click();
  await staff.getByLabel('Name',{exact:true}).fill('김민준');await staff.getByLabel('Class',{exact:true}).fill('EPI');
  await staff.getByRole('button',{name:'Update student',exact:true}).click();
  const beforeSave=await (await staff.request.get(demo.origin+'/api/admin/productions/workshop-2027/roster')).json();
  assert.equal(beforeSave.students.length,2);assert.equal(beforeSave.students[0].name,'PRIVATE_STUDENT_FIXTURE');
  await staff.getByRole('button',{name:'Review changes',exact:true}).click();
  await staff.screenshot({path:join(out,'roster-editor-review-390.png')});
  await staff.getByRole('button',{name:'Save changes',exact:true}).click();await staff.getByText('Saved.',{exact:true}).waitFor();
  await staff.reload();await staff.getByRole('button',{name:'Mira · 1부: 김민준 · EPG',exact:true}).waitFor();
  const savedRoster=await (await staff.request.get(demo.origin+'/api/admin/productions/workshop-2027/roster')).json();
  assert.equal(savedRoster.students.length,3);assert.equal(savedRoster.assignments.length,4);
  assert.equal(savedRoster.students.find((s:any)=>s.id==='s1').name,'김민준');
  for(const width of [320,390,1440]){
    await staff.setViewportSize({width,height:1000});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await staff.screenshot({path:join(out,`roster-editor-${width}.png`),fullPage:true});
  }
  await staff.setViewportSize({width:390,height:900});
  await staff.getByRole('button',{name:'Rowan · 1부: 김민준 · EPG',exact:true}).click();
  assert.equal(await staff.getByRole('dialog').locator('.roster-name-marker').count(),2);
  await staff.screenshot({path:join(out,'roster-editor-picker-390.png')});
  await staff.getByRole('button',{name:'Clear assignment',exact:true}).click();
  await staff.getByRole('button',{name:'Undo',exact:true}).click();
  await staff.getByRole('button',{name:'한국어',exact:true}).click();
  await staff.getByRole('heading',{name:'배역 편집',exact:true}).waitFor();
  await staff.screenshot({path:join(out,'roster-editor-ko-390.png'),fullPage:true});
  await staff.getByRole('button',{name:'ENG',exact:true}).click();
  await staff.getByRole('button',{name:'Mira · 1부: 김민준 · EPG',exact:true}).click();
  await staff.getByRole('button',{name:'Clear assignment',exact:true}).click();
  await demo.rpc('reader_roster',{p_actor:people.staff.id,p_slug:'workshop-2027',p_action:'save',p_expected:savedRoster.version,p_production:savedRoster.productionVersion,p_students:savedRoster.students,p_roles:savedRoster.assignments});
  await staff.getByRole('button',{name:'Review changes',exact:true}).click();await staff.getByRole('button',{name:'Save changes',exact:true}).click();
  await staff.getByText('Someone else updated this roster. Load the latest version before saving.',{exact:true}).waitFor();
  assert.ok(await staff.getByRole('button',{name:'Mira · 1부: Unassigned',exact:true}).isVisible());
  staff.once('dialog',dialog=>dialog.accept());await staff.getByRole('button',{name:'Load latest roster',exact:true}).click();
  await staff.getByRole('button',{name:'Mira · 1부: 김민준 · EPG',exact:true}).waitFor();
  await staff.goto(demo.origin+'/admin/viewer?production=workshop-2027');
  await staff.locator('.teacher-view .script-entry').first().waitFor();
  assert.ok((await staff.locator('.teacher-view').innerText()).includes('김민준'));
  assert.equal(await staff.locator('.teacher-view .roster-multi-role').count(),0);
  assert.equal(await staff.locator('.teacher-view .script-entry.highlighted').count(),0);
  await staff.goto(demo.origin+'/admin/assignments?production=workshop-2027');
  await staff.getByText('Delete assignments',{exact:true}).click();
  await staff.getByRole('button',{name:'Delete all assignments',exact:true}).click();
  await staff.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  await staff.getByText('Saved.',{exact:true}).waitFor();
  assert.equal((await (await staff.request.get(demo.origin+'/api/admin/productions/workshop-2027/assignments')).json()).assignments.length,0);
  await staff.getByRole('link',{name:'Try roster preview',exact:true}).click();
  await staff.getByRole('heading',{name:'Roster',exact:true}).waitFor();
  assert.equal(await staff.locator('.roster-cast-button.roster-multi-role').count(),2);
  assert.ok(await staff.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(251, 239, 223)'));
  const writes:string[]=[];const recordWrites=(request:import('playwright').Request)=>{if(request.url().includes('/api/admin/')&&['POST','PATCH','DELETE'].includes(request.method()))writes.push(request.url());};
  staff.on('request',recordWrites);
  for(const width of [320,390,1440]) {
    await staff.setViewportSize({width,height:1000});
    assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width<760) {
      const menu=staff.getByRole('button',{name:'Navigation',exact:true});await menu.click();
      await staff.locator('#roster-navigation a').first().focus();await staff.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
    } else assert.ok(await staff.locator('.roster-sidebar').isVisible());
    await staff.screenshot({path:join(out,`roster-preview-${width}.png`),fullPage:true});
  }
  await staff.setViewportSize({width:390,height:1000});
  await staff.getByRole('button',{name:'Guard One · 1부: 김민준 · EPG',exact:true}).click();
  await staff.getByRole('dialog').getByRole('button',{name:'김민준 · EPI · 2부 Guard One',exact:true}).waitFor();
  assert.equal(await staff.getByRole('dialog').locator('.roster-name-marker').count(),4);
  assert.equal(await staff.getByRole('dialog').locator('.roster-multi-role').count(),1);
  assert.equal(await staff.getByText('Matching names stay separate. Check the class and current roles.',{exact:true}).count(),0);
  await staff.screenshot({path:join(out,'roster-duplicate-picker-390.png')});
  await staff.getByRole('dialog').getByRole('button',{name:'김민준 · EPI · 2부 Guard One',exact:true}).click();
  await staff.getByRole('button',{name:'Review changes',exact:true}).click();
  await staff.getByRole('button',{name:'Apply to sample',exact:true}).click();
  await staff.getByText('Sample updated.',{exact:true}).waitFor();
  assert.deepEqual(writes,[]);staff.off('request',recordWrites);
  await staff.getByRole('button',{name:'한국어',exact:true}).click();
  await staff.getByRole('heading',{name:'배역 편집',exact:true}).waitFor();
  await staff.screenshot({path:join(out,'roster-preview-ko-390.png'),fullPage:true});
  await staff.goto(demo.origin+'/admin/assignments?production=workshop-2027');
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
