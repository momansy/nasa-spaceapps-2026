// T053: original trailer soundtrack, synthesized from scratch (no samples, no third-party audio).
// 120 BPM, A minor (Am - F - C - G, one chord per bar), so a beat is exactly 0.5 s and a bar 2 s;
// the edit in build.mjs cuts on these times. Kick, clap, hats, sub bass, saw bass, a 16th-note
// arpeggio with a filter that opens during the build, a detuned saw pad, noise risers and impacts.
//   node music.mjs long out.wav     (28 bars, 56 s, for the 16:9 cut)
//   node music.mjs short out.wav    (13 bars, 26 s, for the 9:16 cut)
import fs from 'node:fs';

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;

// Per-bar arrangement. k kick, c clap, h hats (1 closed, 2 closed+open), b bass, a arp filter 0..1 (0 = off),
// p pad, r riser into the next bar, i impact on the downbeat, roll clap roll in the last two beats.
const A = (o) => ({ k: 0, c: 0, h: 0, b: 0, a: 0, p: 1, r: 0, i: 0, roll: 0, ...o });
export const ARRANGEMENTS = {
  long: [
    A({ i: 1, a: 0.18 }), A({ a: 0.26, h: 1, r: 1 }),
    A({ k: 1, h: 1, b: 1, a: 0.4, i: 1 }), A({ k: 1, h: 1, b: 1, a: 0.45 }),
    A({ k: 1, c: 1, h: 1, b: 1, a: 0.5 }), A({ k: 1, c: 1, h: 1, b: 1, a: 0.55, r: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.6, i: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.65 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.7 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.75 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.8 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.85 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.85 }), A({ k: 0, h: 1, a: 0.5, r: 1, roll: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1, i: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 1 }),
    A({ a: 0.55, h: 1, i: 1 }), A({ a: 0.6, h: 1, b: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.9 }), A({ k: 1, c: 0, h: 1, b: 1, a: 0.7, r: 1, roll: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1, i: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.9 }),
    A({ a: 0.5 }), A({ a: 0.3 }),
  ],
  short: [
    A({ i: 1, a: 0.3, h: 1, r: 1 }),
    A({ k: 1, h: 1, b: 1, a: 0.5, i: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.65 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.75 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.85 }), A({ k: 1, c: 1, h: 2, b: 1, a: 0.9 }),
    A({ k: 0, h: 1, a: 0.5, r: 1, roll: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1, i: 1 }), A({ k: 1, c: 1, h: 2, b: 1, a: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 1, r: 1 }),
    A({ k: 1, c: 1, h: 2, b: 1, a: 0.9, i: 1 }), A({ a: 0.5 }), A({ a: 0.3 }),
  ],
};

const SR = 48000;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
// Am, F, C, G: chord tones as MIDI notes (root position, octave 3-4) and bass roots.
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function render(arr) {
  const bars = arr.length;
  const N = Math.ceil((bars * BAR + 2.5) * SR);
  const drums = new Float32Array(N), bass = new Float32Array(N), arp = new Float32Array(N), pad = new Float32Array(N), fx = new Float32Array(N);
  const duck = new Float32Array(N).fill(1);
  const at = (t) => Math.round(t * SR);

  const kick = (t, amp = 1) => {
    const s0 = at(t); let ph = 0;
    for (let i = 0; i < 0.45 * SR && s0 + i < N; i++) {
      const tt = i / SR;
      const f = 45 + 110 * Math.exp(-tt * 28);
      ph += (2 * Math.PI * f) / SR;
      drums[s0 + i] += amp * 0.95 * Math.sin(ph) * Math.exp(-tt * 7) + (i < 90 ? amp * 0.25 * rnd() * (1 - i / 90) : 0);
      const d = 1 - 0.7 * Math.exp(-tt * 9); // sidechain
      if (d < duck[s0 + i]) duck[s0 + i] = d;
    }
  };
  const clap = (t, amp = 1) => {
    const s0 = at(t); let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < 0.3 * SR && s0 + i < N; i++) {
      const tt = i / SR;
      const n = rnd(); hp = 0.85 * (hp + n - prev); prev = n; lp += 0.35 * (hp - lp);
      const env = Math.exp(-tt * 16) * (tt < 0.03 ? 0.6 + 0.4 * Math.sin(tt * 900) : 1);
      drums[s0 + i] += amp * (0.42 * lp * env + 0.12 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30));
    }
  };
  const hat = (t, open, amp = 1) => {
    const s0 = at(t); let prev = 0, hp = 0;
    const len = open ? 0.22 : 0.05;
    for (let i = 0; i < len * SR && s0 + i < N; i++) {
      const tt = i / SR; const n = rnd(); hp = 0.6 * (hp + n - prev); prev = n;
      drums[s0 + i] += amp * (open ? 0.13 : 0.11) * hp * Math.exp(-tt * (open ? 14 : 70));
    }
  };
  const impact = (t) => {
    const s0 = at(t); let ph = 0, lp = 0;
    for (let i = 0; i < 2.4 * SR && s0 + i < N; i++) {
      const tt = i / SR; const f = 38 + 60 * Math.exp(-tt * 6); ph += (2 * Math.PI * f) / SR;
      lp += 0.06 * (rnd() - lp);
      fx[s0 + i] += 0.9 * Math.sin(ph) * Math.exp(-tt * 2.2) + 0.9 * lp * Math.exp(-tt * 2.8);
    }
  };
  const riser = (t0, dur) => {
    const s0 = at(t0); let low = 0, band = 0, ph = 0;
    for (let i = 0; i < dur * SR && s0 + i < N; i++) {
      const x = i / (dur * SR); const fc = 300 + 7000 * x * x; const f = 2 * Math.sin((Math.PI * fc) / SR);
      const n = rnd(); low += f * band; const high = n - low - 0.5 * band; band += f * high;
      ph += (2 * Math.PI * (200 + 900 * x * x)) / SR;
      fx[s0 + i] += (0.32 * band + 0.05 * Math.sin(ph)) * x * x;
    }
  };
  const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
  const bassNote = (t, dur, m) => {
    const s0 = at(t); let p1 = 0, p2 = 0, low = 0, band = 0;
    const f0 = mtof(m);
    for (let i = 0; i < dur * SR && s0 + i < N; i++) {
      const tt = i / SR; p1 += f0 / SR; p2 += (f0 * 1.005) / SR;
      const x = 0.5 * saw(p1) + 0.5 * saw(p2);
      const fc = 180 + 900 * Math.exp(-tt * 18); const f = 2 * Math.sin((Math.PI * fc) / SR);
      low += f * band; const high = x - low - 0.7 * band; band += f * high;
      const env = Math.min(1, tt / 0.004) * Math.min(1, (dur - tt) / 0.01);
      bass[s0 + i] += env * (0.42 * low + 0.33 * Math.sin(2 * Math.PI * (f0 / 2) * tt));
    }
  };
  const arpNote = (t, m, cut, amp) => {
    const s0 = at(t); let p = 0, low = 0, band = 0; const f0 = mtof(m);
    for (let i = 0; i < 0.22 * SR && s0 + i < N; i++) {
      const tt = i / SR; p += f0 / SR;
      const x = saw(p) * 0.6 + (p % 1 < 0.5 ? 0.4 : -0.4);
      const fc = Math.min(9000, (400 + 5200 * cut) * (0.35 + Math.exp(-tt * 22))); const f = 2 * Math.sin((Math.PI * fc) / SR);
      low += f * band; const high = x - low - 0.35 * band; band += f * high;
      arp[s0 + i] += amp * 0.2 * low * Math.exp(-tt * 13) * Math.min(1, tt / 0.002);
    }
  };
  const padChord = (t, dur, notes) => {
    const s0 = at(t);
    const st = notes.flatMap((m) => [-0.08, 0, 0.09].map((d) => ({ f: mtof(m + 12 + d), p: Math.random() })));
    let low = 0, band = 0;
    for (let i = 0; i < dur * SR && s0 + i < N; i++) {
      const tt = i / SR; let x = 0;
      for (const o of st) { o.p += o.f / SR; x += saw(o.p); }
      const f = 2 * Math.sin((Math.PI * 1300) / SR); low += f * band; const high = x / st.length - low - 0.8 * band; band += f * high;
      const env = Math.min(1, tt / 0.25) * Math.min(1, (dur - tt) / 0.3);
      pad[s0 + i] += 0.28 * low * env;
    }
  };

  arr.forEach((b, bi) => {
    const t0 = bi * BAR; const ch = bi % 4;
    if (b.i) impact(t0);
    if (b.p) padChord(t0, BAR + 0.3, CHORDS[ch]);
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * BEAT;
      if (b.k) kick(tb);
      if (b.c && (q === 1 || q === 3)) clap(tb);
      if (b.h) { hat(tb + BEAT / 2, b.h === 2 && q % 2 === 1); hat(tb + BEAT / 4, false, 0.45); hat(tb + (3 * BEAT) / 4, false, 0.45); }
      if (b.b) for (const e of [0.5, 0.75]) bassNote(tb + e * BEAT, BEAT / 4 - 0.01, ROOTS[ch] + 12 * (e === 0.75 && q === 3 ? 1 : 0));
    }
    if (b.b) bassNote(t0, BEAT / 2, ROOTS[ch]);
    if (b.roll) for (let s = 0; s < 8; s++) clap(t0 + 2 * BEAT + s * (BEAT / 4), 0.35 + 0.08 * s);
    if (b.r) riser(t0 + BAR / 2, BAR / 2);
    if (b.a) {
      const tones = CHORDS[ch];
      const seq = [tones[0], tones[1], tones[2], tones[0] + 12, tones[2], tones[1] + 12, tones[0] + 12, tones[2] + 12];
      for (let s = 0; s < 16; s++) arpNote(t0 + (s * BEAT) / 4, seq[s % 8] + 12, b.a, s % 4 === 0 ? 1 : 0.75);
    }
  });

  // arp delay (3/16 note, ping-pong) and a short room on pad/fx
  const dl = at((3 * BEAT) / 4);
  const L = new Float32Array(N), R = new Float32Array(N);
  const dL = new Float32Array(N), dR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const inA = arp[i] * duck[i];
    dL[i] = inA + (i >= dl ? 0.38 * dR[i - dl] : 0);
    dR[i] = i >= dl ? 0.38 * dL[i - dl] : 0;
    const p = pad[i] * (0.55 + 0.45 * duck[i]); const bs = bass[i] * duck[i];
    L[i] = drums[i] + bs + 0.8 * inA + 0.32 * dL[i] + p * 1.0 + fx[i] * 0.8;
    R[i] = drums[i] + bs + 0.8 * inA + 0.32 * dR[i] + p * 0.92 + fx[i] * 0.8;
  }
  // glue: soft clip and normalize to -1 dBFS peak
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = 0.89 / peak;
  return { L, R, N, g };
}

function writeWav(path, { L, R, N, g }) {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path, buf);
}

if (process.argv[1] && process.argv[1].endsWith('music.mjs')) {
  const which = process.argv[2] ?? 'long';
  const out = process.argv[3] ?? `music-${which}.wav`;
  Math.random = (() => { let s = 777; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); })();
  writeWav(out, render(ARRANGEMENTS[which]));
  console.log('wrote', out, (ARRANGEMENTS[which].length * BAR).toFixed(1), 's of music + tail');
}
