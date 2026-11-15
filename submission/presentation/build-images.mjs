// Converts the source screenshots (listed below) to deck-sized JPEGs in ./img using headless Chromium (no extra packages).
// Run from the repo root:  node submission/presentation/build-images.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const R = (p) => path.resolve(p);
const E = 'orchestration/evidence';
// [output name, source file, max width px, jpeg quality 0..1, optional crop {x,y,w,h} in source px]
const jobs = JSON.parse(fs.readFileSync(R('submission/presentation/image-sources.json'), 'utf8'));
const b = await chromium.launch();
const page = await b.newPage();
for (const j of jobs) {
  const src = fs.readFileSync(R(j.src)).toString('base64');
  const mime = j.src.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const out = await page.evaluate(async ({ src, mime, w, q, crop }) => {
    const img = new Image(); img.src = `data:${mime};base64,${src}`; await img.decode();
    const c = crop ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const s = Math.min(1, w / c.w); const cv = document.createElement('canvas');
    cv.width = Math.round(c.w * s); cv.height = Math.round(c.h * s);
    cv.getContext('2d').drawImage(img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', q).split(',')[1];
  }, { src, mime, w: j.w, q: j.q ?? 0.86, crop: j.crop });
  fs.writeFileSync(R(`submission/presentation/img/${j.out}.jpg`), Buffer.from(out, 'base64'));
  console.log(j.out, fs.statSync(R(`submission/presentation/img/${j.out}.jpg`)).size, 'bytes');
}
await b.close();
