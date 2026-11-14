// Mock-mode check: node verify-mock.mjs <repo with client/node_modules> <base URL> <out dir>
import { createRequire } from 'node:module';
import { join } from 'node:path';
const [repo, base, out] = process.argv.slice(2);
const { chromium } = createRequire(join(repo, 'client', 'package.json'))('playwright-core');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${base}/play/client/?mock=1&room=KQXM`);
await p.getByTestId('join-nick').fill('Ada');
await p.getByTestId('join-submit').click();
await p.getByTestId('screen-lobby').waitFor({ timeout: 20000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: join(out, 'mock-phone-lobby.png') });
console.log(`PASS  mock mode: phone joined the scripted lobby without a server; pageerrors: ${errs.length}`);
await b.close();
