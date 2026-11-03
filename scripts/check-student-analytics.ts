import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {csvFor} from '../src/test/fixtures';
import {preparePublication} from '../server/publishing';
import {passageBundle} from '../server/passages';

// Offline deterministic fixtures only: no provider script or real site API is contacted.
const canonical='https://ebenezer-script-reader.pages.dev';
const preview='https://review.ebenezer-script-reader.pages.dev';
const beacon='https://static.cloudflareinsights.com/beacon.min.js';
const endpoint='https://cloudflareinsights.com/cdn-cgi/rum';
const dist=resolve('dist');
const index=await readFile(resolve(dist,'index.html'));
const headers=Object.fromEntries((await readFile(resolve(dist,'_headers'),'utf8')).split('\n').filter(line=>/^\s+[^:]+:/.test(line)).map(line=>{const separator=line.indexOf(':');return [line.slice(0,separator).trim(),line.slice(separator+1).trim()];}));
const payload=preparePublication(csvFor(),'Tag,Name\nRo,Rowan Reed\nMi,Mira Moss');
const production={slug:'synthetic',title:'Synthetic analytics reader',revision:'00000000-0000-4000-8000-000000000001',characters:payload.script.characters,used:0,resetAt:'2099-01-01T15:00:00Z',defaults:{before:2,after:1}};
const mime:Record<string,string>={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const context=await browser.newContext();const page=await context.newPage();
const scripts:string[]=[];const reports:string[]=[];const unexpected:string[]=[];const errors:string[]=[];let blockBeacon=false;
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.protocol==='file:'){await route.continue();return;}
 if(url.href===beacon){scripts.push(request.frame().url());if(blockBeacon){await route.abort('blockedbyclient');return;}
  await route.fulfill({contentType:'text/javascript',body:`window.__analyticsProbeLoads=(window.__analyticsProbeLoads||0)+1; const report=()=>fetch('${endpoint}',{method:'POST',mode:'no-cors',credentials:'omit',body:JSON.stringify({path:location.pathname})});if(document.readyState==='complete')report();else addEventListener('load',report,{once:true});`});return;
 }
 if(url.href===endpoint){assert.equal(request.method(),'POST');reports.push(request.postData()??'');await route.fulfill({status:204});return;}
 if(![canonical,preview,'http://localhost:5173'].includes(url.origin)){unexpected.push(url.origin+url.pathname);await route.abort();return;}
 if(url.pathname==='/api/admin/me'){await route.fulfill({json:{configured:true,user:null,account:null}});return;}
 if(url.pathname==='/api/home'){await route.fulfill({json:{destination:'/import'}});return;}
 if(url.pathname==='/api/productions/synthetic'){await route.fulfill({json:production});return;}
 if(url.pathname==='/api/productions/synthetic/passages'){const body=request.postDataJSON();await route.fulfill({json:passageBundle({...production,used:1},payload,body.character,body)});return;}
 const file=resolve(dist,'.'+decodeURIComponent(url.pathname));
 if(url.pathname.startsWith('/assets/')&&file.startsWith(dist+sep)){await route.fulfill({headers,contentType:mime[extname(file)]??'application/octet-stream',body:await readFile(file)});return;}
 await route.fulfill({headers,contentType:'text/html',body:index});
});
try{
 // Built CSP must allow both the external script and reporting POST, not merely DOM insertion.
 const response=await page.goto(canonical+'/p/synthetic');assert.equal(response?.headers()['content-security-policy'],headers['Content-Security-Policy']);
 await page.getByLabel('Character',{exact:true}).selectOption('Ro');await page.getByText('The gate is open. Shall we take a look?',{exact:true}).waitFor();
 await page.waitForFunction(()=>((window as unknown as {__analyticsProbeLoads?:number}).__analyticsProbeLoads??0)===1);
 for(let n=0;reports.length===0&&n<60;n++)await page.waitForTimeout(25);
 assert.equal(scripts.length,1);assert.equal(reports.length,1);assert.equal(JSON.parse(reports[0]).path,'/p/synthetic');
 const configuration=await page.locator('script[data-cf-beacon]').getAttribute('data-cf-beacon');assert.deepEqual(JSON.parse(configuration!),{token:'c1a873d849c44a0fb147d5279cb72e9b',spa:false});
 await page.getByLabel('Character',{exact:true}).selectOption('Mi');await page.getByText('Someone has left us a message.',{exact:true}).waitFor();
 await page.getByRole('slider',{name:'Before',exact:true}).fill('3');await page.getByRole('button',{name:'한국어',exact:true}).click();await page.getByRole('button',{name:'ENG',exact:true}).click();
 assert.equal(await page.locator('script[data-cf-beacon]').count(),1);assert.equal(scripts.length,1);
 // Private routes are full document navigations, never SPA views underneath an active beacon.
 await page.evaluate(()=>window.location.assign('/admin'));await page.waitForURL(canonical+'/admin');await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();assert.equal(await page.locator('script[data-cf-beacon]').count(),0);assert.equal(scripts.length,1);
 const excluded=['/admin/viewer','/admin/roster','/admin/accounts','/admin/scripts','/admin/songs','/admin/assignments','/import','/','/unknown'];
 for(const path of excluded){await page.goto(canonical+path);await page.waitForLoadState('networkidle');assert.equal(await page.locator('script[data-cf-beacon]').count(),0,path);assert.equal(scripts.length,1,path);}
 for(const origin of [preview,'http://localhost:5173']){await page.goto(origin+'/p/synthetic');await page.getByLabel('Character',{exact:true}).waitFor();assert.equal(await page.locator('script[data-cf-beacon]').count(),0);assert.equal(scripts.length,1);}
 // A real same-origin admin referrer must not be carried into a student analytics visit.
 await page.goto(canonical+'/admin/viewer');await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
 await page.evaluate(()=>{const link=document.createElement('a');link.href='/p/synthetic';document.body.append(link);link.click();});await page.waitForURL(canonical+'/p/synthetic');await page.getByLabel('Character',{exact:true}).waitFor();assert.match(await page.evaluate(()=>document.referrer),/\/admin\/viewer$/);assert.equal(scripts.length,1);assert.equal(await page.locator('script[data-cf-beacon]').count(),0);
 await page.goto(pathToFileURL(resolve('.agent-local/demo/ScriptReader-demo.html')).href);await page.getByRole('button',{name:'Open Script',exact:true}).waitFor();assert.equal(scripts.length,1);assert.equal(await page.locator('script[data-cf-beacon]').count(),0);
 // Blocked analytics cannot stop loading or changing the student character.
 blockBeacon=true;await page.goto(canonical+'/p/synthetic');await page.getByLabel('Character',{exact:true}).selectOption('Ro');await page.getByText('The gate is open. Shall we take a look?',{exact:true}).waitFor();assert.equal(scripts.length,2);assert.equal(reports.length,1);assert.equal(await page.getByRole('alert').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log('Student analytics browser checks passed: built CSP, public-only scope, private referrer, navigation, deduplication, offline and blocked-script reading.');
}finally{await context.close();await browser.close();}
