// T053 trailer edit decision lists. Durations are in beats of the soundtrack (120 BPM: 1 beat = 0.5 s =
// 15 frames at 30 fps), so every cut lands on a beat. `tr` is the transition INTO the shot.
// Sources: S() a still (camera move in ffmpeg), V() a video file, P() 1-3 phone recordings in device frames.
//
// Big-screen material is the current WebGL host only: T054's 1080p60 GPU captures in
// assets/media/trailer-captures/ plus one T031 Build Bay still. The host's flight, orbit and debrief screens
// are placeholders in the published build, so launch and orbit beats use the phone flight console, the
// minigames and labelled AI mood shots instead. The Scale view and the "Fuel cells" vote card are avoided
// (missing glyphs in the host font).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..').split(path.sep).join('/');
export const REC = process.env.T053_REC ?? `${(process.env.TEMP ?? '/tmp').split(path.sep).join('/')}/demo-video/rec`;
const r = (p) => `${ROOT}/${p}`;
const rec = (n) => `${REC}/${n}.mp4`;
// Unity host 1080p60 GPU captures from T054.
export const CAP = r('assets/media/trailer-captures');
const cap = (n) => `${CAP}/${n}.mp4`;

const S = (img, o = {}) => ({ still: img, ...o });
const V = (file, ss, o = {}) => ({ video: file, ss, ...o });
const P = (layout, clips, o = {}) => ({ phones: clips.map(([n, ss, speed = 1, tag]) => ({ file: rec(n), ss, speed, tag })), layout, ...o });

const H = {
  title: cap('01-title-rocket-over-earth'),
  room: cap('02-room-open-qr-code'),
  crew: cap('04-lobby-crew-joining'),
  tally: cap('06-build-bay-vote-tally'),
  arrival: cap('05-build-bay-arrival'),
  exploded: cap('07-build-bay-exploded-view'),
  boosters: cap('08-build-bay-boosters-attach'),
  stack: cap('09-build-bay-full-stack-on-pad'),
  bayBeauty: r('orchestration/evidence/T031/after/buildbay-beauty-no-ui-after-1920x1080.png'),
  // T027 pre-flight screens: real 1080p host renders (merged on main, not yet in the WebGL build), labelled 'Big screen'
  briefing: r('orchestration/evidence/T027/briefing_frame1.png'),
  frrGo: r('orchestration/evidence/T027/frr_go.png'),
};
// T056 Higgsfield trailer shots (assets/media/trailer-ai/NN-name.mp4), used by keyword when present on main.
const TAI = r('assets/media/trailer-ai');
const taiFiles = fs.existsSync(TAI) ? fs.readdirSync(TAI).filter((f) => f.endsWith('.mp4')).sort() : [];
const tai = (re) => { const f = taiFiles.find((n) => re.test(n)); return f ? `${TAI}/${f}` : null; };
const AIX = { team: tai(/team|screen|room/i), liftoff: tai(/lift|launch|pad/i), panels: tai(/panel|unfold|deploy|wing/i), night: tai(/night|city|glid/i) };
// clip from T056 if present (ss into the clip), else the fallback
const X = (clip, ss, o, fallback) => (clip ? V(clip, ss, o) : fallback);
// AI-generated mood material (already disclosed in submission/AI_DISCLOSURE.md and assets/media/CREDITS.md).
const AI = {
  c1: r('assets/media/cinematics/c1-earth-watch-briefing.mp4'),
  key: r('assets/media/key-art/missionforge-16x9.png'),
  ascent: r('assets/media/style/frames/03-ascent.png'),
  orbit: r('assets/media/style/frames/04-orbit-operations.png'),
  control: r('assets/media/style/frames/06-mission-control.png'),
};
// Blurred, darkened host footage behind the phones.
const BG = { earth: V(H.title, 0.5, { blur: true }), bay: S(H.bayBeauty, { blur: true }), pad: V(H.stack, 0.5, { blur: true }) };

export const URL = 'https://missionforge-spaceapps.onrender.com/play/';
export const FINE = 'Gameplay captured from MissionForge. Some imagery AI-generated. Not affiliated with NASA.';
const W1 = (w, at = 0, o = {}) => ({ w, at, ...o });
const DEMO = { demo: true };
const MONTAGE = [['MG-15', 1.0, 'C', 'Solar Wing Deploy'], ['MG-16', 13.0, 'L', 'Station Docking'], ['MG-14', 0.6, 'R', 'Debris Dodge'], ['MG-21', 5.0, 'C', 'Science Capture'],
  ['MG-06', 3.0, 'L', 'Shake Table'], ['MG-03', 1.5, 'R', 'Weld Inspector'], ['MG-20', 3.0, 'C', 'Deorbit Burn'], ['MG-13', 8.0, 'L', 'Ground Station Pass'],
  ['MG-02', 4.0, 'R', 'Rocket Equation Balance'], ['MG-18', 6.0, 'C', 'Eclipse Power Juggle'], ['MG-16', 19.0, 'L', 'Station Docking'], ['MG-21', 9.0, 'R', 'Science Capture']];

// ─────────────────────────── 16:9, 112 beats = 56 s ───────────────────────────
export const LONG = [
  // Hook (bars 0-1)
  { b: 2, src: V(H.title, 0.5, { z: [2.0, 1.65], fx: 1.0, fy: 0.42 }), punch: 0.06 },
  { b: 1, src: V(H.stack, 1.0, { z: [2.6, 2.7], fx: 0.41, fy: 0.45 }) },
  { b: 1, src: V(H.boosters, 2.0, { z: [2.6, 2.7], fx: 0.41, fy: 0.45 }) },
  { b: 4, tr: 'flash', src: X(AIX.team, 0.5, { z: [1.0, 1.08] }, V(AI.c1, 1.0, { z: [1.0, 1.08] })), ov: { ai: true, scrim: 'soft', words: [W1('Design it.', 0, { until: 0.5 }), W1('Build it.', 0.5, { until: 1.0 }), W1('Fly it.', 1.0, { amber: true })] } },
  // One big screen, every phone a console (bars 2-3)
  { b: 2, tr: 'whip', src: V(H.room, 0.4, { z: [1.0, 1.08] }), ov: { scrim: 'heavy', words: [W1('One big screen.', 0.05, { size: 150 })] }, punch: 0.05 },
  { b: 2, src: V(H.crew, 1.2, { ramp: [2.5, 1.0, 2.0], z: [1.06, 1.0] }) },
  { b: 4, src: P('3top', [['session', 0.8], ['session', 5.0], ['session', 10.0]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Every phone a console.', 0, { size: 100, y: 0.115 })] }, punch: 0.04 },
  // Build (bars 4-5)
  { b: 3, tr: 'zoom', src: S(H.bayBeauty, { z: [1.18, 1.0] }), ov: { words: [W1('Pick every part.', 0.1, { size: 130, y: 0.2 })] } },
  { b: 3, src: P('R', [['session', 28.0, 1.2]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Real engines.', 0, { x: 0.07, y: 0.42, size: 92 }), W1('Real trade-offs.', 0.75, { x: 0.07, y: 0.56, size: 92, amber: true })] } },
  { b: 2, src: V(H.arrival, 3.0, { z: [1.0, 1.06] }) },
  // Trade-offs as kinetic type (bars 6-11)
  { b: 2, tr: 'whip', src: P('R', [['session', 54.5, 0.8]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Mass.', 0, { x: 0.1, size: 230 })] }, punch: 0.06 },
  { b: 2, src: V(H.boosters, 0.3, { speed: 1.3, z: [1.0, 1.06] }) },
  { b: 2, src: X(AIX.panels, 0.5, { z: [1.0, 1.06] }, S(AI.orbit, { z: [1.05, 1.16] })), ov: { ai: true, words: [W1('Power.', 0, { size: 230, y: 0.78 })] }, punch: 0.06 },
  { b: 2, src: P('C', [['MG-18', 3.0, 1.2, 'Eclipse Power Juggle']], { bg: BG.earth }), ov: {} },
  { b: 2, tr: 'whip', src: P('R', [['session', 31.0]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Budget.', 0, { x: 0.08, size: 230 })] }, punch: 0.06 },
  // exploded-view capture before the parts separate: full frame, readiness panel and budget bar
  { b: 2, src: V(H.exploded, 0.0, { speed: 0.6, z: [1.0, 1.06], fy: 0.9 }) },
  { b: 2, tr: 'whip', src: P('R', [['MG-14', 0.6, 1.3, 'Debris Dodge']], { bg: BG.earth }), ov: { words: [W1('Orbit.', 0, { x: 0.1, size: 230 })] }, punch: 0.06 },
  { b: 2, src: V(H.title, 2.5, { z: [1.65, 1.8], fx: 1.0, fy: 0.4 }) },
  { b: 2, tr: 'whip', src: P('R', [['MG-13', 6.0, 1.4, 'Ground Station Pass']], { bg: BG.earth }), ov: { words: [W1('Comms.', 0, { x: 0.08, size: 230 })] }, punch: 0.06 },
  // the briefing screen's background picture is the game's AI-generated satellite art, so it carries both labels
  { b: 2, src: S(H.briefing, { z: [1.0, 1.08] }), ov: { host: 'Big screen', ai: true } },
  { b: 4, tr: 'zoom', src: P('3top', [['session', 45.5], ['session', 49.0], ['session', 63.5]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Vote together.', 0, { size: 100, y: 0.115 })] } },
  // Vote -> GO / NO-GO -> countdown (bars 12-13)
  { b: 2, src: V(H.tally, 1.0, { speed: 2, z: [1.0, 1.04] }) },
  { b: 2, tr: 'whip', src: P('2top', [['session', 180.5], ['session', 188.0]], { bg: BG.pad }), ov: { ...DEMO, words: [W1('GO / NO-GO?', 0, { size: 110, y: 0.115, amber: true })] } },
  { b: 2, src: S(H.frrGo, { z: [1.0, 1.05] }), ov: { host: 'Big screen' } },
  { b: 2, src: P('C', [['session', 191.5]], { bg: BG.pad }), ov: { ...DEMO } },
  // Launch + minigame montage (bars 14-19)
  { b: 2, tr: 'flash', src: X(AIX.liftoff, 0.5, { z: [1.0, 1.1] }, S(AI.ascent, { z: [1.0, 1.25], fy: 0.4 })), ov: { ai: true, words: [W1('Launch.', 0, { size: 230, y: 0.8, amber: true })] }, punch: 0.08 },
  { b: 2, src: P('C', [['session', 205.6]], { bg: BG.earth }), ov: { ...DEMO } },
  { b: 2, src: P('C', [['session', 221.0, 1.5, 'Max Q Throttle Bucket']], { bg: BG.earth }), ov: { ...DEMO } },
  { b: 2, src: V(H.title, 4.0, { z: [1.7, 1.9], fx: 1.0, fy: 0.35 }) },
  ...MONTAGE.map(([n, ss, lay, tag], i) => ({ b: 1, tr: i % 4 === 0 ? 'whip' : undefined, src: P('m' + lay, [[n, ss, 1.6, tag]], { bg: i % 2 ? BG.earth : BG.bay }), punch: 0.07 })),
  { b: 4, src: P('3top', [['MG-16', 21.0], ['MG-21', 11.0], ['MG-06', 6.0]], { bg: BG.earth }), ov: { words: [W1('32 minigames.', 0, { size: 110, y: 0.115, amber: true })] }, punch: 0.05 },
  // Orbit (bars 20-21)
  { b: 4, tr: 'fade', src: X(AIX.night, 0.5, { z: [1.0, 1.06] }, V(AI.c1, 4.0, { z: [1.0, 1.06] })), ov: { ai: true, words: [W1('Reach orbit.', 0.3, { size: 160 })] } },
  { b: 4, src: P('C', [['MG-15', 2.6, 1.0, 'Solar Wing Deploy']], { bg: BG.earth }), ov: {} },
  // Debrief, accessibility, build-up (bars 22-23)
  { b: 2, tr: 'whip', src: P('C', [['session', 261.0, 1.0]], { bg: BG.earth }), ov: { ...DEMO } },
  { b: 2, src: P('2top', [['ar', 26.0], ['session', 296.0]], { bg: BG.earth }), ov: { ...DEMO, words: [W1('6 languages.', 0, { size: 110, y: 0.115 })] } },
  { b: 4, src: V(H.boosters, 3.0, { z: [1.0, 1.08] }), ov: { scrim: 'heavy', words: [W1('Your mission.', 0, { size: 150, until: 1.0 }), W1('Your call.', 1.0, { size: 150, amber: true })] } },
  // Title + end card (bars 24-27)
  { b: 4, tr: 'flash', src: S(AI.key, { z: [1.14, 1.0] }), ov: { ai: true, scrim: 'soft', title: { sub: 'Design it. Build it. Fly it.' } } },
  { b: 12, src: S(AI.key, { z: [1.0, 1.06] }), ov: { end: true } },
];

// ─────────────────────────── 9:16, 52 beats = 26 s ───────────────────────────
export const SHORT = [
  { b: 2, src: V(H.title, 0.5, { cx: 0.8, z: [1.4, 1.15], fy: 0.3 }), punch: 0.06 },
  { b: 2, tr: 'flash', src: X(AIX.team, 0.5, { cx: 0.5 }, V(AI.c1, 1.0, { cx: 0.5 })), ov: { ai: true, scrim: 'soft', words: [W1('Build it.', 0, { until: 0.5, size: 170 }), W1('Fly it.', 0.5, { amber: true, size: 170 })] } },
  { b: 2, tr: 'whip', src: V(H.room, 0.4, { fit: true, z: [1.0, 1.0] }), ov: { words: [W1('One big', 0, { size: 130, y: 0.2 }), W1('screen.', 0.25, { size: 130, y: 0.275 })] } },
  { b: 2, src: P('p1', [['session', 1.0]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Every phone', 0, { size: 90, y: 0.07 }), W1('a console.', 0.25, { size: 90, y: 0.125 })] } },
  { b: 2, tr: 'whip', src: P('p1', [['session', 54.5, 0.8]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Mass.', 0, { size: 120, y: 0.09 })] }, punch: 0.05 },
  { b: 2, src: V(H.boosters, 0.3, { speed: 1.3, fit: true, z: [1.0, 1.0] }), ov: { words: [W1('Build it', 0, { size: 120, y: 0.2 }), W1('together.', 0.2, { size: 120, y: 0.275 })] } },
  { b: 2, src: P('p1', [['MG-15', 3.2, 1.3, 'Solar Wing Deploy']], { bg: BG.earth }), ov: { words: [W1('Power.', 0, { size: 120, y: 0.09 })] }, punch: 0.05 },
  { b: 2, src: P('p1', [['session', 31.0]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Budget.', 0, { size: 120, y: 0.09 })] }, punch: 0.05 },
  { b: 2, tr: 'whip', src: P('p1', [['MG-14', 0.6, 1.3, 'Debris Dodge']], { bg: BG.earth }), ov: { words: [W1('Orbit.', 0, { size: 120, y: 0.09 })] }, punch: 0.05 },
  { b: 2, src: P('p1', [['MG-13', 6.0, 1.4, 'Ground Station Pass']], { bg: BG.earth }), ov: { words: [W1('Comms.', 0, { size: 120, y: 0.09 })] }, punch: 0.05 },
  { b: 2, tr: 'zoom', src: P('p2', [['session', 45.5], ['session', 63.5]], { bg: BG.bay }), ov: { ...DEMO, words: [W1('Vote together.', 0, { size: 100, y: 0.13 })] } },
  { b: 2, src: V(H.tally, 1.0, { speed: 2, fit: true, z: [1.0, 1.0] }), ov: { words: [W1('On the', 0, { size: 120, y: 0.2 }), W1('big screen.', 0.2, { size: 120, y: 0.275 })] } },
  { b: 2, src: P('p1', [['session', 180.5]], { bg: BG.pad }), ov: { ...DEMO, words: [W1('GO / NO-GO?', 0, { size: 110, y: 0.09, amber: true })] } },
  { b: 2, src: S(H.frrGo, { fit: true, z: [1.0, 1.0] }), ov: { host: 'Big screen', words: [W1('GO for', 0, { size: 130, y: 0.2, amber: true }), W1('launch.', 0.2, { size: 130, y: 0.275, amber: true })] } },
  { b: 2, tr: 'flash', src: X(AIX.liftoff, 0.5, { cx: 0.5, z: [1.0, 1.1] }, S(AI.ascent, { cx: 0.5, z: [1.0, 1.25], fy: 0.4 })), ov: { ai: true, words: [W1('Launch.', 0, { size: 170, y: 0.8, amber: true })] }, punch: 0.08 },
  { b: 1, src: P('p1', [['session', 221.0, 1.5, 'Max Q Throttle Bucket']], { bg: BG.earth }), ov: { ...DEMO }, punch: 0.07 },
  ...[['MG-16', 13.0, 'Station Docking'], ['MG-20', 3.0, 'Deorbit Burn'], ['MG-21', 5.0, 'Science Capture'], ['MG-06', 3.0, 'Shake Table'], ['MG-03', 1.5, 'Weld Inspector'], ['MG-16', 19.0, 'Station Docking']]
    .map(([n, ss, tag], i) => ({ b: 1, tr: i % 3 === 0 ? 'whip' : undefined, src: P('p1', [[n, ss, 1.6, tag]], { bg: i % 2 ? BG.earth : BG.bay }), punch: 0.07 })),
  { b: 3, src: V(H.title, 2.5, { cx: 0.8, z: [1.2, 1.35], fy: 0.4 }), ov: { words: [W1('Reach', 0, { size: 150, y: 0.7 }), W1('orbit.', 0.2, { size: 150, y: 0.78 })] } },
  { b: 4, tr: 'flash', src: S(AI.key, { cx: 0.7, z: [1.12, 1.0] }), ov: { ai: true, scrim: 'soft', title: { y: 0.4, sub: 'Design it. Build it. Fly it.' } } },
  { b: 8, src: S(AI.key, { cx: 0.7, z: [1.0, 1.05] }), ov: { end: true } },
];

export const CUTS = {
  '16x9': { W: 1920, H: 1080, shots: LONG, music: 'long', out: r('submission/trailer/missionforge-trailer-16x9.mp4'), maxMB: 30 },
  '9x16': { W: 1080, H: 1920, shots: SHORT, music: 'short', out: r('submission/trailer/missionforge-trailer-9x16.mp4'), maxMB: 20 },
};
