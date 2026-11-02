import type {Page} from 'playwright';
import assert from 'node:assert/strict';
import type {Rpc} from '../server/database';
import {preparePublication} from '../server/publishing';
import {csvFor} from '../src/test/fixtures';
/** Local, fictional browser acceptance; never installed by a production entrypoint. */
export async function checkAdminPreparation(page:Page,rpc:Rpc,origin:string){
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
 // Empty import files are preparation too, with a localized safe default action.
 await page.goto(origin+'/admin/assignments?production=guard-check&lang=ko');await page.getByLabel('배역 배정 CSV',{exact:true}).setInputFiles({name:'empty.csv',mimeType:'text/csv',buffer:Buffer.from('')});
 await page.getByLabel('공연 선택',{exact:true}).selectOption('synthetic-garden');const korean=page.getByRole('dialog',{name:'저장하지 않은 변경',exact:true});await korean.waitFor();assert.equal(await page.getByLabel('공연 선택',{exact:true}).inputValue(),'guard-check');assert.ok(await korean.getByRole('button',{name:'계속 편집',exact:true}).evaluate(e=>document.activeElement===e));await page.keyboard.press('Escape');
 await page.getByLabel('배역 배정 CSV',{exact:true}).setInputFiles({name:'assignments.csv',mimeType:'text/csv',buffer:Buffer.from('StudentId,StudentName,Class,Performance,Tag\nguard-student,김민준,EPG,1부,Ro')});await page.getByRole('button',{name:'검증 및 미리보기',exact:true}).click();await page.getByRole('heading',{name:'배정 미리보기',exact:true}).waitFor();await page.getByRole('button',{name:'배정 저장',exact:true}).click();await page.getByRole('dialog',{name:'전체 학생 배정을 교체할까요?',exact:true}).getByRole('button',{name:'확인',exact:true}).click();await page.getByText('저장했습니다.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false);
 await page.goto(origin+'/admin?lang=en');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await page.setViewportSize({width:390,height:900});
 console.log('Preparation guards passed: production/new/refresh/links, native reload cancellation, no double prompt, equivalent song URLs/Undo, Korean empty import and saved import cleanup.');
}
