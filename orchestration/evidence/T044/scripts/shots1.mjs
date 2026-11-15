import { createRequire } from 'node:module';
const require = createRequire('/tmp/t044/clone2/tools/e2e/x.js');
const { chromium } = require('@playwright/test');
const out = '/Users/alainieh/Developer/Nasa/orchestration/evidence/T044/';
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const log = [];
for (const [name, path] of [['01-entry','/play/'],['02-credits','/play/credits.html'],['03-judges','/play/judges.html']]) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type()==='error') log.push(`${name} console.error: ${m.text()}`); });
  p.on('pageerror', e => log.push(`${name} pageerror: ${e.message}`));
  p.on('requestfailed', r => log.push(`${name} requestfailed: ${r.url()}`));
  const r = await p.goto('http://localhost:8080'+path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const h = await p.evaluate(() => document.documentElement.scrollHeight); console.log(name,'height',h);
  await p.screenshot({ path: out+name+'.png', fullPage: h < 12000 });
  if (h >= 12000) console.log(name,'viewport-only capture (page',h,'px tall)');
  const links = await p.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  console.log(name, r.status(), await p.title(), 'links', links.length);
}
// host
const hp = await ctx.newPage();
await hp.setViewportSize({ width: 1920, height: 1080 });
hp.on('console', m => { if (['error','warning'].includes(m.type())) log.push(`host console.${m.type()}: ${m.text().slice(0,200)}`); });
hp.on('pageerror', e => log.push(`host pageerror: ${e.message}`));
hp.on('requestfailed', r => log.push(`host requestfailed: ${r.url()}`));
await hp.goto('http://localhost:8080/play/host/?server=ws://localhost:8787', { waitUntil: 'load' });
await hp.waitForTimeout(8000);
await hp.screenshot({ path: out+'04a-host-loading.png' });
await hp.waitForTimeout(60000);
await hp.screenshot({ path: out+'04b-host-title.png' });
console.log(log.join('\n'));
await b.close();
