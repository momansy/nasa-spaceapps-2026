// Renders deck.html: one 1920x1080 PNG per slide (to orchestration/evidence/T052/slides/), a layout check
// (overflow, minimum font size, missing images) and MissionForge-deck.pdf (1920x1080 pages).
//   node submission/presentation/build-pdf.mjs            (run from the repo root; needs tools/e2e dependencies)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const deck = path.resolve('submission/presentation/deck.html');
const slidesDir = path.resolve('orchestration/evidence/T052/slides');
fs.mkdirSync(slidesDir, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const failedReq = [];
page.on('requestfailed', (r) => failedReq.push(r.url()));
page.on('console', (m) => { if (m.type() === 'error') failedReq.push('console: ' + m.text()); });
await page.goto(pathToFileURL(deck).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const n = await page.evaluate(() => window.__mfDeck.count);
const report = [];
for (let i = 0; i < n; i++) {
  await page.evaluate((k) => window.__mfDeck.show(k), i);
  await page.addStyleTag({content:'#hint{display:none!important}'}).catch(()=>{}); await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const s = document.querySelector('.slide.on'); const sr = s.getBoundingClientRect();
    const out = { clipped: [], minFont: 999, minFontText: '', brokenImages: [] };
    for (const img of s.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) out.brokenImages.push(img.getAttribute('src'));
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim(); if (!t) continue;
      const el = node.parentElement; const cs = getComputedStyle(el);
      if (el.closest('.foot')) continue; // page footer is decoration, not body text
      const fs_ = parseFloat(cs.fontSize);
      if (fs_ < out.minFont) { out.minFont = fs_; out.minFontText = t.slice(0, 40); }
      const range = document.createRange(); range.selectNodeContents(node);
      const rc = range.getBoundingClientRect();
      if (rc.right > sr.right + 1 || rc.bottom > sr.bottom - 56 + 1 || rc.left < sr.left - 1 || rc.top < sr.top - 1) out.clipped.push(t.slice(0, 50) + ` [r=${Math.round(rc.right)} b=${Math.round(rc.bottom)}]`);
    }
    for (const el of s.querySelectorAll('*')) if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.clipped.push('scroll-overflow ' + el.tagName + '.' + el.className);
    return out;
  });
  const file = path.join(slidesDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: file });
  report.push({ slide: i + 1, ...r });
  console.log(`slide ${i + 1}: minFont ${r.minFont}px ("${r.minFontText}") clipped ${r.clipped.length} brokenImages ${r.brokenImages.length}`, r.clipped.slice(0, 3).join(' | '));
}
fs.writeFileSync(path.join(slidesDir, 'layout-check.json'), JSON.stringify({ failedRequests: failedReq, slides: report }, null, 1));
await page.emulateMedia({ media: 'print' });
const pdfPath = path.resolve('submission/presentation/MissionForge-deck.pdf');
await page.pdf({ path: pdfPath, width: '1920px', height: '1080px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
console.log('PDF', pdfPath, fs.statSync(pdfPath).size, 'bytes; failed requests:', failedReq.length);
await b.close();
