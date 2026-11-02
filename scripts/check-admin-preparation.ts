import type {Page} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {Rpc} from '../server/database';
import {preparePublication} from '../server/publishing';
import {csvFor} from '../src/test/fixtures';
/** Local, fictional browser acceptance; never installed by a production entrypoint. */
export async function checkAdminPreparation(page:Page,rpc:Rpc,origin:string,master:Page){
 await rpc('reader_publish',{p_slug:'guard-check',p_title:'Guard check',p_payload:preparePublication(csvFor(),'Tag,Name\nRo,Rowan\nMi,Mira')});
 const ready=async()=>{await page.getByLabel('Reader title',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.production-editor input')?.matches(':enabled'));};
 const scripts=async()=>{await page.goto(origin+'/admin/scripts?production=synthetic-garden');await ready();};
 const menu=async()=>{const toggle=page.getByRole('button',{name:'Navigation',exact:true});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();};
 const dialog=()=>page.getByRole('dialog',{name:'Unsaved changes',exact:true});
 const keep=async()=>{await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();};
 await scripts();const original=await page.getByLabel('Reader title',{exact:true}).inputValue();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.getByLabel('Reader title',{exact:true}).fill('Prepared title');
  await page.getByLabel('Choose a production',{exact:true}).selectOption('guard-check');await dialog().waitFor();assert.equal(await page.getByLabel('Choose a production',{exact:true}).inputValue(),'synthetic-garden');assert.ok(await dialog().getByRole('button',{name:'Keep editing',exact:true}).evaluate(e=>document.activeElement===e));await page.keyboard.press('Escape');assert.equal(await page.getByLabel('Reader title',{exact:true}).inputValue(),'Prepared title');
  await page.getByRole('button',{name:'New production',exact:true}).click();await keep();await page.getByRole('button',{name:'Refresh list',exact:true}).click();await keep();
  await menu();await page.getByRole('link',{name:'Songs',exact:true}).click();await dialog().waitFor();await keep();assert.ok(page.url().includes('/admin/scripts'));
  await page.getByLabel('Reader title',{exact:true}).fill(original);
 }
 // A new-tab comparison reader does not discard the prepared page.
 await page.getByLabel('Reader title',{exact:true}).fill('Prepared title');const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Open student reader',exact:true}).filter({has:page.locator('svg')}).click();await(await popup).close();assert.equal(await dialog().count(),0);
 // Reload invokes the browser's own warning; cancellation retains the draft.
 let nativeWarnings=0;page.once('dialog',async prompt=>{nativeWarnings++;assert.equal(prompt.type(),'beforeunload');await prompt.dismiss();});await page.reload().catch(()=>{});assert.equal(nativeWarnings,1);assert.equal(await page.getByLabel('Reader title',{exact:true}).inputValue(),'Prepared title');
 // Confirmed internal navigation gets one custom prompt and no second native prompt.
 await menu();await page.getByRole('link',{name:'Songs',exact:true}).click();await dialog().waitFor();const unexpected=async(prompt:import('playwright').Dialog)=>{nativeWarnings++;await prompt.dismiss();};page.on('dialog',unexpected);
 await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await page.waitForURL('**/admin/songs?production=synthetic-garden');page.off('dialog',unexpected);assert.equal(nativeWarnings,1);
 await page.locator('.songs-card').waitFor({state:'attached'});await page.locator('.songs-card > summary').click();await page.getByLabel('YouTube URL: 9',{exact:true}).fill('https://www.youtube.com/watch?v=abcdefghijk');assert.ok(await page.getByRole('button',{name:'Save song links',exact:true}).isDisabled());
 await page.getByLabel('Choose a production',{exact:true}).selectOption('guard-check');await page.locator('.songs-card').waitFor({state:'attached'});await page.getByLabel('Choose a production',{exact:true}).selectOption('synthetic-garden');await page.locator('.songs-card').waitFor({state:'attached'});if(!await page.locator('.songs-card').evaluate(e=>e.hasAttribute('open')))await page.locator('.songs-card > summary').click();
 await page.getByLabel('YouTube URL: 9',{exact:true}).fill('https://youtu.be/lmnopqrstuv');await page.getByLabel('Choose a production',{exact:true}).selectOption('guard-check');await dialog().waitFor();await keep();assert.equal(await page.getByLabel('YouTube URL: 9',{exact:true}).inputValue(),'https://youtu.be/lmnopqrstuv');await page.locator('.song-links-editor fieldset').first().getByRole('button',{name:'Undo change',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Save song links',exact:true}).isDisabled());
 // Staff retain normal editing/export, but legacy CSV routes lead to Roster.
 await checkRosterRecovery(page,master,origin);
 await page.goto(origin+'/admin?lang=en');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await page.setViewportSize({width:390,height:900});
 console.log('Preparation and recovery passed: discard guards, role-gated bulk tools, committed export, CSV import, zero-role clear and complete JSON restore.');
}
async function checkRosterRecovery(staff:Page,master:Page,origin:string){
 const url=origin+'/api/admin/productions/guard-check/roster';
 const current=await(await master.request.get(url)).json();
 const students=[{id:'guard-a',name:'김민준',className:'EPG',label:'A'},{id:'guard-b',name:'김민준',className:'EPI',label:'B'},{id:'guard-c',name:'박지우',className:'',label:'Unassigned'}];
 const assignments=[{studentId:'guard-a',tag:'Ro',performance:'1부'},{studentId:'guard-b',tag:'Ro',performance:'2부'}];
 assert.equal((await master.request.patch(url,{headers:{Origin:origin},data:{students,assignments,expected:current.version,productionVersion:current.productionVersion}})).status(),200);
 await staff.goto(origin+'/admin/assignments?production=guard-check&lang=ko');await staff.waitForURL('**/admin/roster?production=guard-check&lang=ko');await staff.locator('.roster-cast-button').first().waitFor();
 assert.equal(await staff.locator('.roster-file-input').count(),0);assert.equal(await staff.locator('.roster-cleanup').count(),0);assert.equal(await staff.locator('#staff-navigation a[href*="/assignments"]').count(),0);
 await staff.getByRole('button',{name:'Rowan · 1부: 김민준 · EPG · A',exact:true}).click();await staff.getByRole('button',{name:'정보 수정: 김민준 · 1부 Rowan',exact:true}).click();await staff.getByLabel('이름',{exact:true}).fill('미저장 이름');await staff.getByRole('button',{name:'반영',exact:true}).click();await staff.getByRole('button',{name:'닫기',exact:true}).click();
 await staff.locator('.roster-transfer > summary').click();const download=staff.waitForEvent('download');await staff.getByRole('button',{name:'JSON 백업 다운로드',exact:true}).click();const backup=JSON.parse(await readFile((await(await download).path())!,'utf8'));
 assert.deepEqual(Object.keys(backup).sort(),['type','version','productionSlug','exportedAt','students','assignments'].sort());assert.deepEqual(backup.students,students);assert.equal(backup.assignments.length,2);assert.ok(await staff.getByRole('button',{name:'Rowan · 1부: 미저장 이름 · EPG · A',exact:true}).isVisible());await staff.getByRole('button',{name:'실행 취소',exact:true}).click();
 const committed=await(await staff.request.get(url)).json();
 for(const action of ['restore','clear','csv_import']){assert.equal((await staff.request.post(url+'/bulk',{headers:{Origin:origin},data:{action,expected:committed.version,productionVersion:committed.productionVersion}})).status(),403);}
 assert.equal((await staff.request.patch(origin+'/api/admin/productions/guard-check/assignments',{headers:{Origin:origin},data:{clear:true,expected:committed.version,productionVersion:committed.productionVersion}})).status(),403);
 await master.goto(origin+'/admin/roster?production=guard-check&lang=ko');await master.locator('.roster-cast-button').first().waitFor();await master.locator('.roster-transfer > summary').click();
 const input=master.getByLabel('배역 파일 (CSV / JSON)',{exact:true});await input.setInputFiles({name:'empty.csv',mimeType:'text/csv',buffer:Buffer.from('')});await master.getByLabel('공연 선택',{exact:true}).selectOption('synthetic-garden');const warning=master.getByRole('dialog',{name:'저장하지 않은 변경',exact:true});await warning.waitFor();assert.equal(await master.getByLabel('공연 선택',{exact:true}).inputValue(),'guard-check');await master.keyboard.press('Escape');
 const csv='StudentId,StudentName,Class,Performance,Tag\nnew-a,이서연,EPG,1부,Ro\nnew-b,이서연,EPI,2부,Mi';await input.setInputFiles({name:'casting.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await master.getByRole('button',{name:'검증 및 미리보기',exact:true}).click();await master.getByRole('heading',{name:'교체 미리보기',exact:true}).waitFor();await master.getByText('배정 확인',{exact:true}).click();assert.ok(await master.getByRole('region',{name:'배정 미리보기',exact:true}).isVisible());assert.ok((await master.locator('.roster-transfer-preview').innerText()).includes('서로 다른 학생인지 확인'));
 for(const width of [320,390,1440]){await master.setViewportSize({width,height:950});assert.ok(await master.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await master.getByRole('button',{name:'배정 가져오기',exact:true}).click();await Promise.all([master.waitForResponse(r=>r.url()===url&&r.request().method()==='GET'),master.getByRole('dialog',{name:'배정 가져오기',exact:true}).getByRole('button',{name:'배정 가져오기',exact:true}).click()]);await master.locator('.roster-cast-button').first().waitFor();
 assert.equal(await master.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false);
 let snapshot=await(await master.request.get(url)).json();assert.equal(snapshot.students.length,5);assert.equal(snapshot.assignments.length,2);
 // Zero casting links must not hide the complete cleanup action.
 assert.equal((await master.request.patch(url,{headers:{Origin:origin},data:{students:snapshot.students,assignments:[],expected:snapshot.version,productionVersion:snapshot.productionVersion}})).status(),200);
 await master.goto(origin+'/admin/roster?production=guard-check');await master.locator('.roster-cast-button').first().waitFor();await master.locator('.roster-cleanup > summary').click();assert.ok(await master.locator('.roster-cleanup').getByRole('button',{name:'Download JSON backup',exact:true}).isEnabled());await master.getByRole('button',{name:'Review complete removal',exact:true}).click();
 // Download is offered, not required before confirming.
 await Promise.all([master.waitForResponse(r=>r.url()===url&&r.request().method()==='GET'),master.getByRole('dialog',{name:'Clear entire roster',exact:true}).getByRole('button',{name:'Clear entire roster',exact:true}).click()]);snapshot=await(await master.request.get(url)).json();assert.deepEqual(snapshot.students,[]);assert.deepEqual(snapshot.assignments,[]);
 await master.locator('.roster-transfer > summary').click();await master.getByLabel('Roster file (CSV / JSON)',{exact:true}).setInputFiles({name:'roster.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await master.getByRole('button',{name:'Validate and preview',exact:true}).click();await master.getByRole('heading',{name:'Replacement preview',exact:true}).waitFor();await master.getByRole('button',{name:'Restore complete roster',exact:true}).click();await Promise.all([master.waitForResponse(r=>r.url()===url&&r.request().method()==='GET'),master.getByRole('dialog',{name:'Restore complete roster',exact:true}).getByRole('button',{name:'Restore complete roster',exact:true}).click()]);
 snapshot=await(await master.request.get(url)).json();assert.deepEqual(snapshot.students,backup.students);assert.deepEqual(snapshot.assignments.sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),backup.assignments.sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 await master.goto(origin+'/admin/accounts');await master.getByRole('heading',{name:'Access Management',exact:true}).waitFor();
}
