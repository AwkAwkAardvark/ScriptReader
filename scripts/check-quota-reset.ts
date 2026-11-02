import assert from 'node:assert/strict';
import type {Page} from 'playwright';
/** Local synthetic browser fixture only. The caller supplies an already authenticated master page. */
export async function checkQuotaReset(page:Page,origin:string){
 let day='2026-11-02';let outcome='ok';const posted:{expectedDay:string;operationId:string}[]=[];
 const handler=async(route:import('playwright').Route)=>{if(route.request().method()==='POST'){posted.push(route.request().postDataJSON());if(outcome==='lost'){outcome='ok';await route.abort('failed');return;}if(outcome==='rollover'){await route.fulfill({status:409,json:{error:'day_changed'}});return;}await route.fulfill({json:{day,count:3,operationId:posted.at(-1)!.operationId}});}else await route.fulfill({json:{day,count:3}});};
 await page.route('**/api/admin/quotas/**',handler);
 try{
  for(const [locale,width] of [['en',1440],['ko',320]] as const){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/admin/accounts'+(locale==='ko'?'?lang=ko':''));const ko=locale==='ko';const panel=page.locator('.reader-allowances');await panel.waitFor();assert.equal(await panel.getAttribute('open'),null);
   const summary=panel.locator('summary');await summary.focus();await page.keyboard.press('Enter');await panel.getByText(day+' (KST) · '+(ko?'기록 3개':'3 allowance records'),{exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await panel.getByRole('button',{name:ko?'초기화 검토':'Review reset',exact:true}).click();const modal=panel.getByRole('dialog',{name:ko?'학생 열람 제한 초기화':'Reset reader allowances'});assert.ok(await modal.isVisible());assert.ok(await modal.getByRole('button',{name:ko?'취소':'Cancel',exact:true}).evaluate(node=>node===document.activeElement));assert.match(await modal.innerText(),ko?/모든 공연과 모든 브라우저/:/all productions and all browsers/);
   await page.keyboard.press('Escape');assert.equal(await modal.isVisible(),false);assert.equal(posted.length,0);
  }
  await page.setViewportSize({width:390,height:900});await page.goto(origin+'/admin/accounts');const panel=page.locator('.reader-allowances');await panel.locator('summary').click();await panel.getByRole('button',{name:'Review reset',exact:true}).click();outcome='lost';await panel.getByRole('dialog').getByRole('button',{name:'Reset all allowances',exact:true}).click();await panel.getByRole('alert').filter({hasText:'Unable to confirm the result'}).waitFor();const first=posted[0];await panel.getByRole('dialog').getByRole('button',{name:'Reset all allowances',exact:true}).click();await panel.getByRole('status').filter({hasText:'Reset 3 allowance records'}).waitFor();assert.deepEqual(posted[1],first);
  await panel.getByRole('button',{name:'Refresh',exact:true}).click();await panel.getByRole('button',{name:'Review reset',exact:true}).click();outcome='rollover';await panel.getByRole('dialog').getByRole('button',{name:'Reset all allowances',exact:true}).click();await panel.getByRole('alert').filter({hasText:'The Korean date changed'}).waitFor();assert.ok(await panel.getByRole('button',{name:'Review reset',exact:true}).isDisabled());day='2026-11-03';outcome='ok';await panel.getByRole('button',{name:'Refresh',exact:true}).click();await panel.getByText(day+' (KST) · 3 allowance records',{exact:true}).waitFor();await panel.getByRole('button',{name:'Review reset',exact:true}).click();await panel.getByRole('dialog').getByRole('button',{name:'Reset all allowances',exact:true}).click();await panel.getByRole('status').filter({hasText:'2026-11-03'}).waitFor();assert.equal(posted.at(-1)!.expectedDay,day);assert.notEqual(posted.at(-1)!.operationId,posted.at(-2)!.operationId);
 }finally{await page.unroute('**/api/admin/quotas/**',handler);}
}
