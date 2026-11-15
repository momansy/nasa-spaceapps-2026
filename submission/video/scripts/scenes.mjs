// Scene lists for the two cuts. Every image or clip is a real file from the repository or a
// recording made from the real phone client (see submission/video/README.md).
const R = 'C:/Projects/NASA GAME';
const E = `${R}/orchestration/evidence`;
const REC = `${(process.env.TEMP ?? '/tmp').split(String.fromCharCode(92)).join('/')}/demo-video/rec`;
const url = (p) => 'file:///' + p.replace(/ /g, '%20');

const KEYART = `${R}/assets/media/key-art/missionforge-16x9.png`;
const BRIEF = `${R}/assets/media/cinematics/c1-earth-watch-briefing.mp4`;
const SESSION = `${REC}/session.mp4`;

const SRC_UNITY = 'Big screen · Unity host capture';
const SRC_BAY = 'Big screen · Unity Build Bay, rehearsal build with simulated voters';
const NOTE_MOCK = 'Phone client, scripted demo session (?mock=1): bots fill the other seats and the numbers are demo values.';
const NOTE_LAB = 'Phone client minigame, played by the game\u2019s own scripted test player (minigame lab page).';

// ── HTML builders ──
function still(src, h1, p, amber = false) {
  return `<div class="abs band"></div>
  <div class="abs cap"><div class="srcline">${src}</div><h1>${h1}</h1>${p ? `<p>${p}</p>` : ''}</div>`;
}

const ONE = [{ x: 1292, y: 34, w: 468, h: 1012 }];
const TWO = [{ x: 862, y: 34, w: 468, h: 1012 }, { x: 1382, y: 34, w: 468, h: 1012 }];

function phone({ bg = KEYART, kicker, h1, p, chips = [], note, slots = ONE, right = 1200, labels = [] }) {
  const bez = slots.map((s) => `<div class="abs bezel" style="left:${s.x - 14}px;top:${s.y - 14}px;width:${s.w + 28}px;height:${s.h + 28}px"></div>`).join('');
  return `<div class="abs hide" style="inset:0;background:#050b14"></div>
  <div class="abs bgimg" data-bg="${url(bg)}"></div><div class="abs bgshade"></div>
  <div class="abs col hide" style="right:${1920 - right}px">
    ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
    <h1>${h1}</h1>${p ? `<p>${p}</p>` : ''}
    ${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip${c.startsWith('!') ? ' amber' : ''}">${c.replace(/^!/, '')}</span>`).join('')}</div>` : ''}
    ${labels.length ? `<div class="chips" style="margin-top:22px">${labels.map((c) => `<span class="chip">${c}</span>`).join('')}</div>` : ''}
    ${note ? `<div class="note">${note}</div>` : ''}
  </div>${bez}`;
}

function card(inner, shade = true) {
  return `${shade ? '<div class="abs cardshade"></div>' : ''}<div class="abs col" style="right:520px">${inner}</div>`;
}

const sess = (a, b) => [SESSION, a, b];
const rec = (f, a, b) => [`${REC}/${f}`, a, b];
const mk = (slots, clipsList) => slots.map((s, i) => ({ ...s, clips: clipsList[i] }));

// ── 2-minute cut ──
const twoMin = [
  { name: 'Title: key art', d: 5.5, still: { img: KEYART, z0: 1, z1: 1.07, fx: 0.6, fy: 0.4 },
    html: card(`<div class="kicker">NASA SPACE APPS CHALLENGE 2026 · SPACE MISSION DESIGN GAME</div>
      <div class="title">Mission<span>Forge</span></div>
      <p class="tag">A party game where your team designs a space mission, then flies it.</p>
      <p class="small">1 to 10 players · one big screen · every phone is a mission-control console</p>`) },
  { name: 'Problem: constraints over briefing film', d: 8, video: { file: BRIEF, ss: 0 },
    html: `<div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(2,7,16,.93) 0%,rgba(2,7,16,.8) 50%,rgba(2,7,16,.1) 100%)"></div>
    <div class="abs src right amber">Briefing film for contract C1 (AI-generated, in the repository)</div>` +
    card(`<div class="kicker">THE CHALLENGE</div><h1 style="font-size:66px;line-height:1.1;margin:0 0 26px">Design a space mission.<br>Every choice costs something.</h1>
      <div class="chips"><span class="chip">Mass</span><span class="chip">Power</span><span class="chip">Budget</span><span class="chip">Instruments</span><span class="chip">Orbit</span><span class="chip">Communications</span></div>
      <p class="fact" style="margin-top:34px"><b>Contract C1 Earth Watch:</b> a 150 kg imaging satellite to a 550 km Sun-synchronous orbit (97.6°), on 90 M game-dollars, in 180 days.</p>`, false) },
  { name: 'Host title screen', d: 3.5, still: { img: `${E}/T031/after/title-after-1920x1080.png`, z0: 1.45, z1: 1.52, fx: 0.03, fy: 0.0 },
    html: still(`${SRC_UNITY} · title screen`, 'One big screen hosts the mission', 'The Unity host runs on a laptop or TV; phones are the controllers.') },
  { name: 'Host lobby with QR', d: 4.5, still: { img: `${E}/T031/after/lobby-after-1920x1080.png`, z0: 1, z1: 1.08, fx: 0.9, fy: 0.2 },
    html: still(`${SRC_UNITY} · lobby (stub room server, 5 test players)`, 'Join with a 4-letter room code or the QR code', 'No app, no account, no chat. 1 to 10 players, plus an audience.') },
  { name: 'Phone join', d: 6.5, phones: mk(ONE, [[sess(0.3, 6.8)]]),
    html: phone({ kicker: 'JOIN ON YOUR PHONE', h1: 'Type a call sign and you are in the crew', p: 'The phone is the controller: role console, part cards, votes and minigames.', note: NOTE_MOCK }) },
  { name: 'Phone role card', d: 5.5, phones: mk(ONE, [[sess(8.4, 13.9)]]),
    html: phone({ kicker: 'ROLES', h1: 'Each phone becomes a mission-control console', p: '10 roles, from FLIGHT and BOOSTER to EECOM, INCO and PAYLOAD. With fewer players, roles merge automatically.', note: NOTE_MOCK }) },
  { name: 'Build Bay dashboard', d: 8.5, still: { img: `${E}/T031/after/buildbay-after-1920x1080.png`, z0: 1, z1: 1.1, fx: 0.0, fy: 0.25 },
    html: still(SRC_BAY, '22 part votes build the rocket and the satellite', 'The dashboard shows delta-v, thrust-to-weight, cost, schedule, power and data before the team commits.') },
  { name: 'Phone part cards and drawbacks', d: 9, phones: mk(ONE, [[sess(24.4, 33.4)]]),
    html: phone({ kicker: 'PART CARDS', h1: 'Every option shows its numbers and its drawbacks', p: 'Thrust, Isp, mass, cost and a real-world twin. A card warns when an option is over budget.', chips: ['!There is no perfect build'], note: NOTE_MOCK }) },
  { name: 'Build Bay if-chosen deltas', d: 6.5, still: { img: `${E}/T031/after/buildbay-assembly-1920x1080.png`, z0: 1, z1: 1.1, fx: 1.0, fy: 0.3 },
    html: still(SRC_BAY, '\u201cIf chosen\u201d shows what each option changes', 'Small fairing: +$2.0 M. Standard fairing: +$5.0 M and a structures concern. (Costs are game-dollars.)') },
  { name: 'Phone vote, tally and readiness', d: 8.5, phones: mk(ONE, [[sess(45.7, 49.7), sess(63.4, 64.9), sess(65.3, 68.3)]]),
    html: phone({ kicker: 'VOTE', h1: 'The crew votes, and the build updates', p: 'Live tallies, then the phone\u2019s readiness dashboard after each decision: delta-v, thrust-to-weight, budget, success chance.', note: NOTE_MOCK }) },
  { name: 'Build Bay compare tool', d: 3, still: { img: `${E}/T015/05-compare-1920x1080.png`, z0: 1.05, z1: 1.12, fx: 0.55, fy: 0.55 },
    html: still(SRC_BAY, 'Compare two options side by side', 'Also: exploded view, scale reference and stability markers.') },
  { name: 'Build Bay finished vehicle', d: 3.5, still: { img: `${E}/T031/after/buildbay-complete-vehicle-beauty-1920x1080.png`, z0: 1, z1: 1.06, fx: 0.45, fy: 0.5 },
    html: still(SRC_BAY, 'The vehicle is assembled live in 3D', '') },
  { name: 'Phone GO/NO-GO poll', d: 7.5, phones: mk(ONE, [[sess(179.8, 187.3)]]),
    html: phone({ kicker: 'FLIGHT READINESS REVIEW', h1: 'Every console calls GO or NO-GO', p: 'As in a real readiness review, a NO-GO stops the count for a discussion.', note: NOTE_MOCK }) },
  { name: 'Phone flight console alert', d: 6, phones: mk(ONE, [[sess(204.9, 210.9)]]),
    html: phone({ kicker: 'FLIGHT', h1: 'Consoles call out problems in flight', p: 'Max Q is coming: STRUCT calls the throttle-down for a Good Call.', note: NOTE_MOCK }) },
  { name: 'Minigame MG-08 Max Q Throttle Bucket', d: 6, phones: mk(ONE, [[sess(223.6, 229.6)]]),
    html: phone({ kicker: 'MINIGAME · MASS AND STRUCTURE', h1: 'Max Q Throttle Bucket', p: 'Keep dynamic pressure inside the band to protect the structure.', chips: ['32 minigames on the phone'], note: 'Recorded in the scripted demo session; the throttle was moved by a test script.' }) },
  { name: 'Minigame MG-15 Solar Wing Deploy', d: 4.5, phones: mk(ONE, [[rec('MG-15.mp4', 1.5, 6.0)]]),
    html: phone({ kicker: 'MINIGAME · POWER', h1: 'Solar Wing Deploy', p: 'Turn the wings to the Sun to stay power-positive.', chips: ['32 minigames on the phone'], note: NOTE_LAB }) },
  { name: 'Minigame MG-13 Ground Station Pass', d: 4.5, phones: mk(ONE, [[rec('MG-13.mp4', 3.5, 8.0)]]),
    html: phone({ kicker: 'MINIGAME · COMMUNICATIONS', h1: 'Ground Station Pass', p: 'Steer the antenna, lock on and downlink the data.', chips: ['32 minigames on the phone'], note: NOTE_LAB }) },
  { name: 'Minigame MG-21 Science Capture', d: 4.5, phones: mk(ONE, [[rec('MG-21.mp4', 4.0, 8.5)]]),
    html: phone({ kicker: 'MINIGAME · INSTRUMENTS', h1: 'Science Capture', p: 'Point the instrument you chose. Clouds block optical shots.', chips: ['32 minigames on the phone'], note: NOTE_LAB }) },
  { name: 'Phone debrief and facts', d: 8.5, phones: mk(ONE, [[sess(260.8, 265.0), sess(271.2, 275.5)]]),
    html: phone({ kicker: 'DEBRIEF', h1: 'The debrief explains the result', p: 'Score breakdown, awards, and the facts met along the way, each with its source.', note: 'Scripted demo session: the score, grade and "Mission success" label are demo values, not a computed result.' }) },
  { name: 'Accessibility: Arabic and 200% high contrast', d: 8, slots: TWO,
    phones: mk(TWO, [[rec('ar.mp4', 9.0, 12.0), rec('ar.mp4', 25.4, 30.3)], [sess(290.5, 298.5)]]),
    html: phone({ slots: TWO, right: 790, kicker: 'FOR EVERYONE', h1: 'Six languages. Large text. High contrast.', p: 'English, Arabic (right to left), Spanish, French, Portuguese, Hindi. 200% text, reduced motion, relaxed and one-button minigames.', labels: ['Left: Arabic', 'Right: 200% text, high contrast'], note: 'Scripted demo session.' }) },
  { name: 'End card', d: 8, still: { img: KEYART, z0: 1.07, z1: 1.0, fx: 0.6, fy: 0.4 },
    html: card(`<div class="title" style="font-size:120px">Mission<span>Forge</span></div>
      <p class="tag">Design it. Launch it. Learn why it worked.</p>
      <p class="small" style="font-size:30px;color:#d3e6f0;margin:0 0 26px">Team Winton · NASA Space Apps Challenge 2026 · code and credits on the project page</p>
      <p class="small">Phone footage: the real phone client, in a scripted demo session and minigame lab. Big-screen images: Unity host captures; the Build Bay is a rehearsal build with simulated voters. Big-screen briefing, flight and debrief views are in development. Built with AI coding agents. Key art and briefing film are AI-generated. Not affiliated with or endorsed by NASA.</p>`) },
];

// ── 30-second cut ──
const thirty = [
  { name: 'Hook: key art', d: 5, still: { img: KEYART, z0: 1, z1: 1.07, fx: 0.6, fy: 0.4 },
    html: card(`<div class="title" style="font-size:130px">Mission<span>Forge</span></div>
      <p class="tag" style="font-size:52px">Every space mission is a set of trade-offs.</p>`) },
  { name: 'Host lobby', d: 4.5, still: { img: `${E}/T031/after/lobby-after-1920x1080.png`, z0: 1, z1: 1.08, fx: 0.9, fy: 0.2 },
    html: still(`${SRC_UNITY} · lobby (stub room server)`, 'Scan a code. Your phone becomes mission control.', 'No app, no account. 1 to 10 players.') },
  { name: 'Build Bay vote', d: 5, still: { img: `${E}/T031/after/buildbay-assembly-1920x1080.png`, z0: 1, z1: 1.08, fx: 0.8, fy: 0.3 },
    html: still(SRC_BAY, 'Vote on every part', 'Each choice changes mass, power, cost, schedule and risk.') },
  { name: 'Phone part card', d: 4, phones: mk(ONE, [[sess(29.6, 33.6)]]),
    html: phone({ kicker: 'PART CARDS', h1: 'No perfect build', p: 'Every option shows its numbers and its drawbacks.', note: NOTE_MOCK }) },
  { name: 'MG-08', d: 3, phones: mk(ONE, [[sess(225.0, 228.0)]]),
    html: phone({ kicker: 'THEN FLY IT TOGETHER', h1: 'Max Q Throttle Bucket', p: 'Mass and structure', note: 'Scripted demo session; input from a test script.' }) },
  { name: 'MG-15', d: 3, phones: mk(ONE, [[rec('MG-15.mp4', 2.0, 5.0)]]),
    html: phone({ kicker: 'THEN FLY IT TOGETHER', h1: 'Solar Wing Deploy', p: 'Power', note: NOTE_LAB }) },
  { name: 'MG-21', d: 3, phones: mk(ONE, [[rec('MG-21.mp4', 4.5, 7.5)]]),
    html: phone({ kicker: 'THEN FLY IT TOGETHER', h1: 'Science Capture', p: 'Instruments', note: NOTE_LAB }) },
  { name: 'End card', d: 6, still: { img: KEYART, z0: 1.07, z1: 1.0, fx: 0.6, fy: 0.4 },
    html: card(`<div class="title" style="font-size:120px">Mission<span>Forge</span></div>
      <p class="tag">Design it. Launch it. Learn why it worked.</p>
      <p class="small" style="font-size:30px;color:#d3e6f0;margin:0 0 22px">Team Winton · NASA Space Apps Challenge 2026</p>
      <p class="small">Real game screens: phone client (scripted demo session and minigame lab) and Unity host captures (Build Bay rehearsal build). AI-generated key art. Not affiliated with or endorsed by NASA.</p>`) },
];

export const CUTS = {
  '2min': { scenes: twoMin, out: `${R}/submission/video/missionforge-demo-2min.mp4` },
  '30s': { scenes: thirty, out: `${R}/submission/video/missionforge-demo-30s.mp4` },
};
