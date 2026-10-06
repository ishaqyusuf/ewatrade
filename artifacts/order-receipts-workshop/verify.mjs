import {chromium} from '/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=fileURLToPath(new URL('.',import.meta.url));
const mode=process.argv[2]||'dashboard';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:mode==='mobile'?390:1440,height:mode==='mobile'?900:1050},reducedMotion:'reduce',acceptDownloads:true});
const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
const checks=[];await mkdir(dir+'evidence',{recursive:true});
async function route(d,scope='single'){await page.goto('about:blank');await page.goto(new URL(`index.html#${d}/${mode}/${scope}`,import.meta.url).href);await page.locator('#open-receipt').waitFor();}
async function open(){await page.locator('#open-receipt').click();await page.locator('#stage [data-action=prepare]').waitFor();}
async function prepare(){await page.locator('#stage [data-action=prepare]').click();await page.locator('#stage [data-action=download]').waitFor();}
if(process.argv.includes('--capture')){
 try{await route(2,'group');await open();await page.locator('.app').screenshot({path:dir+`evidence/recommended-${mode}.png`});if(mode==='mobile'){await prepare();await page.locator('[data-action=share]').click();await page.locator('.app').screenshot({path:dir+'evidence/share-mobile.png'});}console.log('Captured recommended '+mode+' flow.');}finally{await browser.close();}
 process.exit(0);
}
try{
 for(const theme of ['light','dark'])for(const d of [1,2,3])for(const scope of ['single','group']){
  await route(d,scope);await page.selectOption('#theme',theme);await open();
  assert.equal(await page.locator('#stage [data-action=prepare]').isVisible(),true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${mode}/${theme}/${d}/${scope} overflow`);
  if(scope==='group'&&d!==3){await page.locator('#stage [data-action=next]').click();assert.match(await page.locator('#stage .receipt').innerText(),/ORD-0042/);await page.locator('#stage [data-action=previous]').click();}
  await page.fill('#stage [name=note]','Thank you, Amina.');assert.match(await page.locator('#stage .receipt-note').first().innerText(),/Thank you, Amina/);
  await page.check('#stage [name=format][value=image]');assert.equal(await page.locator('#stage [name=format][value=image]').isChecked(),true);
  await page.screenshot({path:dir+`evidence/${mode}-${d}-${scope}-${theme}.png`,fullPage:true});
  await prepare();assert.match(await page.locator('#stage .ready-area').innerText(),/ready/);
  if(mode==='mobile'){await page.locator('[data-action=share]').click();assert.equal(await page.locator('.native-share').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('[data-action=share]').evaluate(el=>document.activeElement===el),true);}
  await page.locator('#stage [data-action=edit]').click();assert.equal(await page.locator('#stage [name=note]').inputValue(),'Thank you, Amina.');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#open-receipt').evaluate(el=>document.activeElement===el),true);
  await open();assert.equal(await page.locator('#stage [name=note]').inputValue(),'Thank you, Amina.');
  await page.locator('#reset').click();await open();assert.equal(await page.locator('#stage [name=note]').inputValue(),'Thank you for shopping with us.');
  checks.push({theme,direction:d,scope,overflow:false,preview:true,options:true,prepare:true,retention:true,escapeFocus:true,reset:true});
 }
 await route(2);await open();await page.selectOption('#scenario','unpaid');assert.match(await page.locator('#stage .receipt').innerText(),/Unpaid/i);assert.match(await page.locator('#stage .receipt-payment').innerText(),/₦0\.00/);assert.match(await page.locator('#stage .receipt-payment').innerText(),/₦34,500\.00/);
 await page.selectOption('#scenario','partial');assert.match(await page.locator('#stage .receipt').innerText(),/Part paid/i);assert.match(await page.locator('#stage .receipt-payment').innerText(),/₦14,500\.00/);
 await page.selectOption('#scenario','offline');assert.equal(await page.locator('#stage [data-action=prepare]').isDisabled(),true);
 await page.selectOption('#scenario','normal');await page.fill('#stage [name=note]','<img src=x onerror=alert(1)>');assert.equal(await page.locator('#stage .receipt img').count(),0);assert.match(await page.locator('#stage .receipt-note').innerText(),/<img/);
 await route(2,'group');await page.check('[data-pick="4"]');await open();assert.equal(await page.locator('#stage .receipt').count(),1);assert.match(await page.locator('#stage .notice').innerText(),/excluded/);
 await page.selectOption('#scenario','failure');await prepare();assert.equal(await page.locator('[data-retry]').count(),1);await page.locator('[data-retry]').click();assert.equal(await page.locator('[data-retry]').count(),0);
 await route(1);await open();await page.fill('#stage [name=note]','Retained in 01');await page.locator('[data-direction="2"]').click();await open();assert.equal(await page.locator('#stage [name=note]').inputValue(),'Thank you for shopping with us.');await page.locator('[data-direction="1"]').click();assert.equal(await page.locator('#stage [name=note]').inputValue(),'Retained in 01');
 if(mode==='dashboard'){
  const download=async name=>{const pending=page.waitForEvent('download');await page.locator('#stage [data-action=download]').click();const file=await pending;await file.saveAs(dir+'evidence/'+name);return readFile(dir+'evidence/'+name);};
  await route(2,'group');await open();await prepare();const pdf=await download('sample-group.pdf');assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');
  await route(2);await open();await page.check('[name=format][value=image]');await prepare();const png=await download('sample-receipt.png');assert.equal(png.subarray(1,4).toString(),'PNG');
  await route(2,'group');await open();await page.check('[name=format][value=image]');await prepare();const zip=await download('sample-images.zip');assert.equal(zip.subarray(0,2).toString(),'PK');
  await route(2);await open();await page.selectOption('#scenario','long');await prepare();await download('sample-long.pdf');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 await writeFile(dir+`evidence/verification-${mode}.json`,JSON.stringify({mode,runs:checks.length,checks,edgeCases:['unpaid','part-paid','offline','safe text','canceled exclusion','partial retry','isolated directions'],pageErrors:errors,externalRequests:network,scope:'Fictional local workshop; browser viewport, not production/native acceptance'},null,2));
 console.log(`PASS ${mode}: ${checks.length} direction/theme/scope runs, 7 edge scenarios, zero page errors or network calls.`);
}finally{await browser.close();}
