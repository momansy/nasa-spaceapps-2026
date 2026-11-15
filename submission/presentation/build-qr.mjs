// Writes img/qr-play.svg: a QR code for the hosted game URL, using the repository's own qrcode-terminal dependency.
// Run from the repo root after `npm --prefix tools/demo install`:  node submission/presentation/build-qr.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('tools/demo/x.js'));
const QRCode = require('qrcode-terminal/vendor/QRCode');
const ECL = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
const URL_ = process.argv[2] ?? 'https://missionforge-spaceapps.onrender.com/play/';
const qr = new QRCode(-1, ECL.M); qr.addData(URL_); qr.make();
const n = qr.getModuleCount(); const q = 4; const size = n + 2 * q;
let d = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#071522"/></svg>\n`;
fs.writeFileSync(path.resolve('submission/presentation/img/qr-play.svg'), svg);
console.log('QR modules', n, 'for', URL_);
