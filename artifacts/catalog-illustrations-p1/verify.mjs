// Local artifact checks and SVG raster previews, not native acceptance.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire('/Users/M1PRO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const sharp = require('sharp');
const { chromium } = require('playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const tiles = [];
const evidence = {assetCount: manifest.assets.length, exportCount: 0, renderedSizes: [32,48,128], bytes: [], edgeCheck: true, browser: {}};
for (const [i, asset] of manifest.assets.entries()) {
  const parts = [];
  for (const [theme, file] of Object.entries(asset.files)) {
    const svg = await readFile(path.join(root, file));
    for (const size of evidence.renderedSizes) {
      const raster = await sharp(svg).resize(size,size).ensureAlpha().raw().toBuffer();
      if (!raster.some((v,j) => j%4 === 3 && v > 0)) throw new Error(`Empty artwork ${file}`);
    }
    const {data,info} = await sharp(svg).resize(128,128).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let x=0;x<info.width;x++) {
      if(data[x*4+3] || data[((info.height-1)*info.width+x)*4+3]) throw new Error(`Clipped vertical edge ${file}`);
    }
    for(let y=0;y<info.height;y++) {
      if(data[y*info.width*4+3] || data[(y*info.width+info.width-1)*4+3]) throw new Error(`Clipped horizontal edge ${file}`);
    }
    if(data[3] !== 0) throw new Error(`Background not transparent ${file}`);
    parts.push({input:await sharp(svg).resize(128,128).png().toBuffer(),left:theme==='light'?14:174,top:6});
    evidence.exportCount++;
    evidence.bytes.push(svg.length);
  }
  const label = Buffer.from(`<svg width="320" height="48"><text x="12" y="18" font-family="sans-serif" font-size="14" fill="#182420">${i+1}. ${asset.label.replaceAll('&','&amp;')}</text><text x="12" y="38" font-family="sans-serif" font-size="11" fill="#626d69">${asset.id}</text></svg>`);
  parts.push({input:label,left:0,top:140});
  const backgrounds = Buffer.from('<svg width="320" height="188"><rect width="320" height="188" fill="#fff"/><rect x="160" width="160" height="138" fill="#1b2320"/></svg>');
  tiles.push({input:await sharp(backgrounds).composite(parts).png().toBuffer(),left:(i%4)*328,top:Math.floor(i/4)*196});
}
const board = await sharp({create:{width:1304,height:Math.ceil(tiles.length/4)*196-8,channels:4,background:'#e5ebe7'}}).composite(tiles).png().toBuffer();
await writeFile(path.join(root,'contact-sheet.png'),board);
// Smaller review sheets preserve readable labels for the expanded library.
for (let start=0,part=1; start<tiles.length; start+=24,part++) {
  const subset=tiles.slice(start,start+24).map((tile,i)=>({...tile,left:(i%4)*328,top:Math.floor(i/4)*196}));
  await sharp({create:{width:1304,height:Math.ceil(subset.length/4)*196-8,channels:4,background:'#e5ebe7'}}).composite(subset).png().toFile(path.join(root,`contact-sheet-${part}.png`));
}
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1300,height:1000},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  await page.goto('file://' + path.join(root,'index.html'));
  await page.locator('img').last().waitFor();
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  evidence.browser.loadedImages = await page.locator('img').count();
  evidence.browser.brokenImages = await page.evaluate(()=>[...document.images].filter(img=>!img.complete||img.naturalWidth===0).length);
  evidence.browser.desktopOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.screenshot({path:path.join(root,'preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  evidence.browser.narrowOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.screenshot({path:path.join(root,'preview-narrow.png'),fullPage:true});
  evidence.browser.errors=errors;
  if(evidence.browser.brokenImages || errors.length || evidence.browser.narrowOverflow || evidence.browser.desktopOverflow) throw new Error('Browser preview failed');
} finally {
  if(browser) await browser.close();
}
evidence.minBytes=Math.min(...evidence.bytes);
evidence.maxBytes=Math.max(...evidence.bytes);
delete evidence.bytes;
evidence.nativeAndroidAcceptance='pending';
await writeFile(path.join(root,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
