// Which requests 404 on the hosted pages? node probe-404.mjs <url>...
import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
for (const url of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(4000);
  console.log(url, '->', bad.length ? bad : 'no failed requests');
  await p.close();
}
await b.close();
