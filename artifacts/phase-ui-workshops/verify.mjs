import { chromium } from '/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const dir=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1050},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
try {
await page.goto(new URL('index.html',import.meta.url).href);
const list=await page.evaluate(()=>studies.map(({id,recommended})=>({id,recommended})));
await mkdir(dir+'evidence',{recursive:true});
await page.screenshot({path:dir+'evidence/comparison-desktop.png',fullPage:true});
for(const mode of ['desktop-light','desktop-dark','mobile-light','mobile-dark']){
 const mobile=mode.startsWith('mobile');
 await page.setViewportSize({width:mobile?390:1500,height:mobile?844:1050});
 await page.selectOption('#surface',mobile?'mobile':'desktop');
 await page.selectOption('#theme',mode.endsWith('dark')?'dark':'light');
 for(const s of list){
  for(const d of [1,2,3]){
   await page.goto(new URL(`index.html#${s.id}/${d}`,import.meta.url).href);
   await page.locator('.stage .app').waitFor();
   await page.locator('[data-reset-one]').click();
   assert.equal(await page.locator('.stage .app').count(),1);
   const broken=await page.locator('.stage img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
   assert.deepEqual(broken,[],`${s.id}/${d} broken images`);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false,`${mode}/${s.id}/${d} page overflow`);
   const choice=page.locator('.stage [data-pick="1"]');
   if(await choice.count()){await choice.click();assert.equal(await choice.getAttribute('aria-pressed'),'true');}
   await page.locator('[data-action]').click();
   assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
   await page.locator('#cancel').click();
   assert.equal(await page.locator('[data-action]').evaluate(el=>document.activeElement===el),true);
   await page.locator('[data-action]').click();await page.locator('#confirm').click();
   assert.ok((await page.locator('.status').innerText()).length>10);
   if(d===s.recommended&&mode==='desktop-light')await page.screenshot({path:dir+`evidence/${s.id}-recommended.png`,fullPage:true});
   await page.locator('[data-reset-one]').click();assert.equal(await page.locator('.status').innerText(),'');
   results.push({mode,study:s.id,direction:d,render:true,selection:true,confirmation:true,reset:true,overflow:false});
  }
 }
 console.log(`${mode}: ${list.length*3} directions passed`);
}
async function route(id,d=2){await page.goto(new URL(`index.html#${id}/${d}`,import.meta.url).href);await page.locator('[data-reset-one]').click();}
async function commit(){await page.locator('[data-action]').click();await page.locator('#confirm').click();return page.locator('.status').innerText();}
await route('coin-quote');await page.selectOption('[data-field="Job scenario"]','Provider uncertain');assert.match(await commit(),/remain held/);
await page.selectOption('[data-field="Job scenario"]','Rejected');assert.match(await commit(),/released/);
await page.selectOption('[data-field="Spend authority"]','Staff cap exceeded');assert.match(await commit(),/No coins held/);
await route('public-settings');await page.selectOption('[data-field="Complete pause"]','On');assert.match(await commit(),/unavailable/);
await route('media-library');await page.locator('[data-pick="2"]').click();assert.match(await commit(),/under review/);
await route('media-usage');await page.selectOption('[data-field="Operation"]','Delete from gallery');assert.match(await commit(),/Cannot delete/);
await route('public-image-consent');assert.match(await commit(),/Confirm reuse rights/);
await route('public-product');await page.selectOption('[data-field="Availability preview"]','Unavailable');assert.equal(await page.locator('[data-action]').isDisabled(),true);
await route('public-contact');await page.fill('[data-field="Contact"]','123');assert.match(await commit(),/valid international/);
await route('import-entry');await page.selectOption('[data-field="Input layout"]','Unknown layout');assert.match(await commit(),/explicitly/);
await page.selectOption('[data-field="Input layout"]','Invalid template');assert.match(await commit(),/Required fields missing/);
await route('billing-plans');await page.selectOption('[data-field="Period"]','Annual');assert.match(await commit(),/30,000/);
await route('media-library');await page.fill('[data-field="Search images"]','not present');assert.match(await page.locator('.records').innerText(),/No matches/);await page.fill('[data-field="Search images"]','Rice');assert.equal(await page.locator('[data-pick]').count(),1);
await route('document-branding');await page.fill('[data-field="Business name"]','<img src=x onerror=alert(1)>');await commit();assert.equal(await page.locator('dialog img').count(),0);
await page.locator('#reset').click();await route('coin-quote',1);await commit();await page.goto(new URL('index.html#coin-quote/2',import.meta.url).href);assert.equal(await page.locator('.status').innerText(),'');
await page.goto(new URL('index.html#coin-quote/1',import.meta.url).href);assert.match(await page.locator('.status').innerText(),/settled/);
await page.locator('#reset').click();assert.equal(await page.locator('.status').innerText(),'');
await route('public-product',3);await page.selectOption('#surface','mobile');await page.selectOption('#theme','dark');await page.screenshot({path:dir+'evidence/customer-mobile-dark.png',fullPage:true});
assert.deepEqual(errors,[]);
await writeFile(dir+'evidence/verification.json',JSON.stringify({date:new Date().toISOString(),scope:'Local workshop previews; not native/provider/production acceptance',studies:list.length,directions:list.length*3,viewportThemeRuns:results.length,edgeChecks:17,pageErrors:errors,results},null,2));
console.log(`PASS ${list.length} studies, ${list.length*3} directions, ${results.length} viewport/theme runs, edge cases.`);
} finally {await browser.close();}
