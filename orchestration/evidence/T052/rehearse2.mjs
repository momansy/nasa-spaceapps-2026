// T052 rehearsal part 2: live hosted room server (wss) + the repo's scripted stand-in host + 3 phone-sized Chromium contexts
// driving the real, hosted phone client from lobby to debrief. Times every milestone.
//   node orchestration/evidence/T052/rehearse2.mjs
import { ScriptedHost } from '../../../tools/e2e/host/scripted-host.mjs';
import { PhoneDriver } from '../../../tools/e2e/lib/phone-driver.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(path.resolve('tools/e2e/x.js'));
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE ?? 'https://missionforge-spaceapps.onrender.com';
const OUT = path.resolve('orchestration/evidence/T052/rehearsal/part2');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now(); const T = () => Number(((Date.now() - t0) / 1000).toFixed(1));
const log = []; const mark = (name, extra = {}) => { const e = { t: T(), name, ...extra }; log.push(e); console.log(e.t, name, JSON.stringify(extra)); };
const browser = await chromium.launch({ headless: true });
const host = new ScriptedHost(`wss://${new URL(BASE).host}/ws`, { seed: 2801 });
mark('start');
await host.connect(); mark('room created', { room: host.room });
const phones = [];
for (let i = 0; i < 3; i++) { const p = new PhoneDriver(browser, { webUrl: `${BASE}/play/client`, room: host.room, index: i, runDir: OUT }); await p.open(); phones.push(p); mark('phone joined', { phone: i + 1 }); }
let mgShots = 0;
const onMilestone = async (name, data) => {
  const tag = data?.roundId ?? data?.id ?? data?.round ?? '';
  mark(name, { tag });
  try {
    if (name === 'lobby') await phones[0].shot('lobby');
    if (name === 'briefing') await phones[0].shot('briefing');
    if (name === 'build_started') await phones[0].shot('build');
    if (name === 'vote') {
      if (data.kind === 'PART') await phones[0].shot(`part-vote-${data.roundId.split('.').at(-1)}`);
      await Promise.all(phones.map((p) => p.handleVote(data)));
      mark('vote done', { tag });
    }
    if (name === 'poll') { await Promise.all(phones.map((p) => p.handlePoll(data.round))); await phones[0].shot(`frr-${data.round}`); }
    if (name === 'minigame') {
      const rec = (await Promise.all(phones.map((p) => p.handleMinigame(data)))).filter(Boolean);
      mark('minigame done', { tag });
      return rec;
    }
    if (name === 'minigame_summary') await Promise.all(phones.map((p, i) => p.finishMinigame(data.records.find((r) => r.phone === i + 1), data.id)));
    if (name === 'alert') await Promise.all(phones.map((p) => p.handleAlert()));
    if (name === 'blackout') await phones[0].shot('blackout');
    if (name === 'debrief') await phones[0].shot('debrief');
  } catch (e) { mark('milestone error', { name, e: String(e.message).slice(0, 160) }); }
};
try { await host.full({ onMilestone }); } catch (e) { mark('host.full error', { e: String(e.message).slice(0, 200) }); }
mark('end');
fs.writeFileSync(`${OUT}/timings.json`, JSON.stringify(log, null, 1));
for (const p of phones) await p.close().catch(() => {});
await browser.close();
process.exit(0);
