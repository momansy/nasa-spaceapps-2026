// MG-30 drawing: a three-step stepper (contribute, vote, team patch), the patch preview with
// where each element comes from, the option tiles of this player's category, the three
// candidates with their tallies, and the reveal. Patches are painted once per design and size.
import { Canvas2D, KeyedLayer, pathRoundRect, withAlpha, type Rect, type Status } from '../MG-02/kit';
import { CANDIDATES, CATEGORIES, OPTION_COUNT, type Mg30Sim, type Patch } from './model';
import { COLOURWAYS, drawPatch, drawSymbol, shapePath } from './patch';

export interface Mg30ViewOptions {
  compact: boolean;
  reducedMotion: boolean;
  t: (key: string, args?: Record<string, string | number>) => string;
}

export interface Mg30DrawState {
  timeMs: number;
  focus?: number;
  pausedText?: string | null;
  finger?: { x: number; y: number; pressed: boolean } | null;
}

const K = 'minigame.MG-30.';
const LETTERS = ['A', 'B', 'C'];

export class Mg30View {
  readonly c: Canvas2D;
  private sim: Mg30Sim;
  private readonly o: Mg30ViewOptions;
  private stepR: Rect | null = null;
  private previewR!: Rect;
  tiles: Rect[] = [];
  cands: Rect[] = [];
  private hintR: Rect | null = null;
  private cache = new Map<string, HTMLCanvasElement>();
  private stepLayer: KeyedLayer;
  private previewLayer: KeyedLayer;
  private tileLayer: KeyedLayer;
  private candLayer: KeyedLayer;

  constructor(canvas: HTMLCanvasElement, sim: Mg30Sim, o: Mg30ViewOptions) {
    this.c = new Canvas2D(canvas);
    this.sim = sim;
    this.o = o;
    this.stepLayer = new KeyedLayer(this.c);
    this.previewLayer = new KeyedLayer(this.c);
    this.tileLayer = new KeyedLayer(this.c);
    this.candLayer = new KeyedLayer(this.c);
    this.layout();
  }

  setSim(sim: Mg30Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.c.measure();
    this.cache.clear();
    this.layout();
  }

  private layout() {
    const { W, H } = this.c;
    const c = this.c;
    const compact = this.o.compact;
    const pad = compact ? 8 : 14;
    const s = Math.min(c.u, 1.3);
    const n = OPTION_COUNT[this.sim.config.category];
    if (compact) {
      const pw = Math.min(H - pad * 2, W * 0.46);
      this.previewR = { x: pad, y: pad, w: pw, h: H - pad * 2 };
      const tx = pad + pw + 8;
      const tw = (W - tx - pad - 6) / 2;
      const th = (H - pad * 2 - 6) / 2;
      this.tiles = [0, 1, 2, 3].map((i) => ({ x: tx + (i % 2) * (tw + 6), y: pad + Math.floor(i / 2) * (th + 6), w: tw, h: th }));
      this.stepR = null;
      this.hintR = null;
      this.cands = [];
      return;
    }
    let y = pad;
    const stepH = Math.round(44 * s);
    this.stepR = { x: pad, y, w: W - pad * 2, h: stepH };
    y += stepH + 10;
    const hintH = Math.round(28 * s);
    this.hintR = { x: pad, y: H - pad - hintH, w: W - pad * 2, h: hintH };
    const bottom = H - pad - hintH - 8;
    // Pick phase: preview card, then option tiles in two columns.
    const rows = Math.ceil(n / 2);
    const tileH = Math.round(Math.min(Math.max(48, 46 * s), (bottom - y - 180) / rows - 8));
    const tilesH = rows * (tileH + 8) - 8;
    this.previewR = { x: pad, y, w: W - pad * 2, h: Math.max(150, bottom - y - tilesH - 10) };
    const tw = (W - pad * 2 - 8) / 2;
    const ty = this.previewR.y + this.previewR.h + 10;
    this.tiles = Array.from({ length: n }, (_, i) => {
      const col = c.rtl ? 1 - (i % 2) : i % 2;
      return { x: pad + col * (tw + 8), y: ty + Math.floor(i / 2) * (tileH + 8), w: tw, h: tileH };
    });
    // Vote phase: three candidate cards in a row under the stepper.
    const cw = (W - pad * 2 - 16) / 3;
    const ch = Math.round(cw * 0.38 * 2.45 + 36);
    this.cands = [0, 1, 2].map((i) => {
      const col = c.rtl ? 2 - i : i;
      return { x: pad + col * (cw + 8), y, w: cw, h: ch };
    });
  }

  hitTile(x: number, y: number): number {
    if (this.sim.phase !== 'pick' && !this.o.compact) return -1;
    return this.tiles.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  hitCand(x: number, y: number): number {
    if (this.sim.phase !== 'vote') return -1;
    return this.cands.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  /** A patch painted once per design and size, then blitted. */
  private patchImage(p: Patch, R: number): HTMLCanvasElement {
    const c = this.c;
    const key = `${p.join(',')}@${Math.round(R)}/${c.dpr}`;
    let img = this.cache.get(key);
    if (img) return img;
    if (this.cache.size > 24) this.cache.clear();
    img = document.createElement('canvas');
    const size = Math.ceil(R * 2.5);
    img.width = Math.ceil(size * c.dpr);
    img.height = Math.ceil(size * c.dpr);
    const g = img.getContext('2d');
    if (g) {
      g.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
      drawPatch(g, p, size / 2, size / 2, R, this.o.t(`${K}motto.${p[3]}`), c.pal.fontUi);
    }
    this.cache.set(key, img);
    return img;
  }

  private blitPatch(p: Patch, cx: number, cy: number, R: number) {
    const img = this.patchImage(p, R);
    const size = Math.ceil(R * 2.5);
    this.c.ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  }

  draw(st: Mg30DrawState) {
    const c = this.c;
    const sim = this.sim;
    c.begin();
    c.backdrop(1);
    if (this.stepR) this.drawStepper();
    const phase = sim.phase;
    if (phase === 'pick' || this.o.compact) {
      this.drawPreview();
      this.drawTiles(st.focus ?? -1);
    } else if (phase === 'vote') this.drawVote(st.focus ?? -1);
    else this.drawReveal(st.timeMs);
    if (this.hintR) {
      const key = sim.config.oneButton ? 'hint.one' : phase === 'pick' ? 'hint.pick' : phase === 'vote' ? 'hint.vote' : '';
      if (key) c.hint(this.hintR, this.o.t(K + key), false);
    }
    if (st.finger) c.finger(st.finger.x, st.finger.y, st.finger.pressed, this.o.compact);
    if (st.pausedText) c.overlay(st.pausedText);
  }

  private drawStepper() {
    const c = this.c;
    const sim = this.sim;
    const r = this.stepR!;
    const t = this.o.t;
    const idx = sim.phase === 'pick' ? 0 : sim.phase === 'vote' ? 1 : 2;
    const left = Math.ceil(sim.phaseLeftS);
    this.stepLayer.blit({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 24 }, `${idx}|${left}|${r.w}|${c.rtl}`, () => {
      const ctx = c.ctx;
      c.glass(r, r.h / 2);
      const timeW = c.px(40, 1.3);
      const labels = ['step.pick', 'step.vote', 'step.reveal'];
      const sw = (r.w - timeW - 12) / 3;
      for (let i = 0; i < 3; i++) {
        const col = c.rtl ? 2 - i : i;
        const x = r.x + 6 + (c.rtl ? timeW : 0) + col * sw;
        const pill = { x: x + 2, y: r.y + 5, w: sw - 4, h: r.h - 10 };
        const cur = i === idx;
        const done = i < idx;
        if (cur) {
          pathRoundRect(ctx, pill, pill.h / 2);
          ctx.fillStyle = withAlpha(c.pal.accent, 0.2);
          ctx.fill();
          ctx.strokeStyle = c.pal.accent;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        const bs = pill.h - 10;
        const bx = c.rtl ? pill.x + pill.w - 6 - bs : pill.x + 6;
        const by = pill.y + 5;
        if (done) c.statusIcon('good', bx + bs / 2, by + bs / 2, bs);
        else {
          ctx.beginPath();
          ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2);
          ctx.fillStyle = cur ? c.pal.accent : withAlpha(c.pal.ceramic, 0.14);
          ctx.fill();
          c.text(String(i + 1), bx + bs / 2, by + bs / 2 + 1, bs, bs * 0.62, 700, cur ? c.pal.ink : c.pal.dim, 'center');
        }
        const tx = c.rtl ? bx - 6 : bx + bs + 6;
        c.text(t(K + labels[i]), tx, pill.y + pill.h / 2 + 1, pill.w - bs - 18, c.px(13, 1.25), 600, cur ? c.pal.text : c.pal.dim, c.rtl ? 'right' : 'left');
      }
      if (sim.phase !== 'done') {
        const tx = c.rtl ? r.x + 14 : r.x + r.w - 14;
        c.numberWithUnit(String(left), 's', tx, r.y + r.h / 2 + c.px(15, 1.25) * 0.36, timeW, c.px(15, 1.25), c.pal.text, c.rtl ? 'left' : 'right');
      }
    });
  }

  private drawPreview() {
    const c = this.c;
    const sim = this.sim;
    const r = this.previewR;
    const t = this.o.t;
    const p: Patch = [sim.element(0), sim.element(1), sim.element(2), sim.element(3)];
    const sources = [0, 1, 2, 3].map((k) => (k === sim.config.category ? 'you' : sim.fromTeam(k) ? 'team' : 'crew'));
    const key = `${p.join(',')}|${sources.join(',')}|${r.w}x${r.h}@${r.y}|${sim.pick}`;
    this.previewLayer.blit({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 26 }, key, () => {
      const ctx = c.ctx;
      c.glass(r, 18);
      const compact = this.o.compact;
      const tpx = c.px(12.5, 1.25);
      const legendH = compact ? 0 : Math.min(2 * 54, r.h * 0.34);
      const headH = compact ? 0 : tpx * 2.2;
      const areaH = r.h - legendH - headH - (compact ? 0 : 16);
      const R = Math.max(30, Math.min(areaH * 0.4, r.w * (compact ? 0.4 : 0.33)));
      const px = r.x + r.w / 2;
      const py = r.y + headH + 8 + areaH / 2;
      // Warm halo behind the patch.
      const halo = ctx.createRadialGradient(px, py, R * 0.4, px, py, R * 1.5);
      halo.addColorStop(0, 'rgba(255, 206, 131, 0.16)');
      halo.addColorStop(1, 'rgba(255, 206, 131, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(px - R * 1.5, py - R * 1.5, R * 3, R * 3);
      this.blitPatch(p, px, py, R);
      if (compact) return;
      c.text(t(K + 'yours', { cat: t(`${K}cat.${sim.config.category}`) }), r.x + r.w / 2, r.y + 8 + tpx * 0.9, r.w - 24, tpx, 600, c.pal.accentStrong, 'center');
      // Legend: a 2 × 2 grid, one cell per element with where it comes from.
      const gx = r.x + 10;
      const gy = r.y + r.h - legendH - 8;
      const cw = (r.w - 28) / 2;
      const chh = legendH / 2 - 4;
      for (let k = 0; k < 4; k++) {
        const col = c.rtl ? 1 - (k % 2) : k % 2;
        const box = { x: gx + col * (cw + 8), y: gy + Math.floor(k / 2) * (chh + 8), w: cw, h: chh };
        const mine = k === sim.config.category;
        pathRoundRect(ctx, box, 10);
        ctx.fillStyle = mine ? withAlpha(c.pal.accent, 0.16) : 'rgba(3, 10, 18, 0.35)';
        ctx.fill();
        ctx.strokeStyle = mine ? withAlpha(c.pal.accent, 0.75) : 'rgba(150, 205, 228, 0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const lpx = c.px(11, 1.2);
        c.textStart(`${t(`${K}cat.${k}`)} · ${t(`${K}from.${sources[k]}`)}`, { x: box.x + 10, y: box.y, w: box.w - 20, h: 0 }, box.y + lpx * 1.1, lpx, 600, mine ? c.pal.accentStrong : c.pal.dim);
        const name = t(`${K}${CATEGORIES[k]}.${p[k]}`);
        c.textStart(mine && sim.pick < 0 ? '…' : name, { x: box.x + 10, y: box.y, w: box.w - 20, h: 0 }, box.y + box.h * 0.68, c.px(13.5, 1.25), 600, c.pal.text);
      }
    });
  }

  /** Small preview of one option of category `cat`. */
  private optionIcon(cat: number, k: number, cx: number, cy: number, s: number) {
    const ctx = this.c.ctx;
    const pal = this.c.pal;
    ctx.save();
    ctx.translate(cx, cy);
    if (cat === 0) {
      shapePath(ctx, k, s);
      ctx.fillStyle = withAlpha(pal.accent, 0.18);
      ctx.fill();
      ctx.strokeStyle = pal.accentStrong;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (cat === 1) {
      drawSymbol(ctx, k, s * 0.85, { ...COLOURWAYS[0]!, ink: pal.text, accent: pal.accent });
    } else if (cat === 2) {
      const cw = COLOURWAYS[k]!;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fillStyle = cw.border;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.78, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(0, -s, 0, s);
      g.addColorStop(0, cw.f0);
      g.addColorStop(1, cw.f1);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = cw.ink;
      ctx.fill();
    } else {
      // Motto: a ribbon glyph.
      ctx.fillStyle = withAlpha(pal.sun, 0.9);
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.3);
      ctx.quadraticCurveTo(0, -s * 0.55, s, -s * 0.3);
      ctx.lineTo(s, s * 0.3);
      ctx.quadraticCurveTo(0, s * 0.05, -s, s * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTiles(focus: number) {
    const c = this.c;
    const sim = this.sim;
    const cat = sim.config.category;
    const hi = sim.config.oneButton ? sim.highlight() : -1;
    const shown = this.o.compact ? 4 : this.tiles.length;
    if (!this.tiles.length) return;
    const first = this.tiles[0]!;
    const last = this.tiles[this.tiles.length - 1]!;
    const key = `${sim.pick}|${hi}|${focus}|${first.y}|${first.w}|${cat}`;
    this.tileLayer.blit({ x: 0, y: first.y - 6, w: c.W, h: last.y + last.h - first.y + 26 }, key, () => {
      const ctx = c.ctx;
      for (let i = 0; i < shown; i++) {
        const r = this.tiles[i]!;
        const opt = this.o.compact ? [1, 3, 5, 6][i]! % OPTION_COUNT[cat] : i;
        const picked = sim.pick === opt;
        const lit = hi === opt || focus === opt;
        c.glass(r, 12, picked || lit);
        if (picked) {
          pathRoundRect(ctx, r, 12);
          ctx.fillStyle = withAlpha(c.pal.accent, 0.2);
          ctx.fill();
        }
        if (picked || lit) {
          ctx.strokeStyle = c.pal.accent;
          ctx.lineWidth = picked ? 2.5 : 2;
          pathRoundRect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 11);
          ctx.stroke();
        }
        const s = Math.min(r.h * 0.32, 16);
        const name = this.o.t(`${K}${CATEGORIES[cat]}.${opt}`);
        if (cat === 3) {
          c.text(name, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 18, this.o.compact ? 11 : c.px(13, 1.25), 600, c.pal.text, 'center');
        } else {
          const ix = this.o.compact && r.w <= 110 ? r.x + r.w / 2 : c.rtl ? r.x + r.w - 10 - s : r.x + 10 + s;
          this.optionIcon(cat, opt, ix, r.y + r.h / 2, s);
          if (!this.o.compact || r.w > 110) {
            const tx = c.rtl ? ix - s - 8 : ix + s + 8;
            c.text(name, tx, r.y + r.h / 2 + 1, r.w - s * 2 - 30, this.o.compact ? 10.5 : c.px(13, 1.25), 600, c.pal.text, c.rtl ? 'right' : 'left');
          }
        }
        if (picked && !this.o.compact) c.statusIcon('good', c.rtl ? r.x + 12 : r.x + r.w - 12, r.y + 12, 14);
      }
    });
  }

  private drawVote(focus: number) {
    const c = this.c;
    const sim = this.sim;
    const t = this.o.t;
    const cands = sim.candidates();
    const tally = sim.tally();
    const hi = sim.config.oneButton ? sim.highlight() : -1;
    const first = this.cands[0]!;
    const key = `${cands.map((p) => p.join('')).join('|')}|${tally.join(',')}|${sim.vote}|${hi}|${focus}|${first.w}`;
    this.candLayer.blit({ x: 0, y: first.y - 6, w: c.W, h: first.h + 30 }, key, () => {
      const ctx = c.ctx;
      for (let i = 0; i < CANDIDATES; i++) {
        const r = this.cands[i]!;
        const mine = sim.vote === i;
        const lit = hi === i || focus === i;
        c.glass(r, 14, mine || lit);
        if (mine || lit) {
          ctx.strokeStyle = c.pal.accent;
          ctx.lineWidth = mine ? 2.5 : 2;
          pathRoundRect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 13);
          ctx.stroke();
        }
        const R = r.w * 0.38;
        this.blitPatch(cands[i]!, r.x + r.w / 2, r.y + 10 + R * 1.05, R);
        // Letter badge and tally dots (crew votes dim, this player's in Signal).
        const by = r.y + r.h - 22;
        const bs = 20;
        pathRoundRect(ctx, { x: r.x + 8, y: by - bs / 2, w: bs, h: bs }, 5);
        ctx.fillStyle = mine ? c.pal.accent : withAlpha(c.pal.ceramic, 0.14);
        ctx.fill();
        c.text(LETTERS[i]!, r.x + 8 + bs / 2, by + 1, bs, 13, 700, mine ? c.pal.ink : c.pal.text, 'center');
        const n = tally[i]!;
        for (let k = 0; k < Math.min(n, 6); k++) {
          ctx.beginPath();
          ctx.arc(r.x + 8 + bs + 10 + k * 11, by, 4, 0, Math.PI * 2);
          ctx.fillStyle = mine && k === n - 1 ? c.pal.accent : withAlpha(c.pal.ceramic, 0.55);
          ctx.fill();
        }
      }
    });
    // Large preview of the current choice under the cards.
    const r = this.previewR;
    const top = first.y + first.h + 14;
    const bottom = (this.hintR ? this.hintR.y : c.H) - 10;
    const big = { x: r.x, y: top, w: r.w, h: bottom - top };
    if (big.h < 80) return;
    c.glass(big, 18);
    const sel = sim.vote >= 0 ? sim.vote : hi >= 0 ? hi : 0;
    c.text(t(K + 'vote.title'), big.x + big.w / 2, big.y + 18, big.w - 24, c.px(13.5, 1.25), 600, c.pal.dim, 'center');
    const R = Math.min(big.h * 0.36, big.w * 0.32);
    this.blitPatch(cands[sel]!, big.x + big.w / 2, big.y + big.h / 2 + 10, R);
  }

  private drawReveal(nowMs: number) {
    const c = this.c;
    const ctx = c.ctx;
    const sim = this.sim;
    const t = this.o.t;
    const top = this.stepR ? this.stepR.y + this.stepR.h + 10 : 8;
    const bottom = (this.hintR ? this.hintR.y + this.hintR.h : c.H) - 8;
    const box = { x: this.previewR.x, y: top, w: this.previewR.w, h: bottom - top };
    c.glass(box, 18, true);
    const w = sim.winner();
    const p = sim.candidates()[w]!;
    const chipH = Math.round(40 * Math.min(c.u, 1.3));
    const R = Math.min(box.w * 0.38, (box.h - 60 - chipH * 2 - 70) / 2.6);
    const content = 44 + R * 2.6 + 24 + chipH * 2 + 8;
    const top0 = box.y + Math.max(0, (box.h - content) / 2);
    const cx = box.x + box.w / 2;
    const cy = top0 + 44 + R * 1.15;
    // Celebration halo (Sunlight), slowly breathing unless reduced motion.
    const k = this.o.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(nowMs / 600);
    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.7);
    halo.addColorStop(0, `rgba(255, 206, 131, ${0.3 * k})`);
    halo.addColorStop(1, 'rgba(255, 206, 131, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - R * 1.8, cy - R * 1.8, R * 3.6, R * 3.6);
    c.text(t(K + 'reveal.title'), cx, top0 + 22, box.w - 30, c.px(18, 1.3), 600, c.pal.text, 'center', 'middle', true);
    this.blitPatch(p, cx, cy, R);
    const tally = sim.tally();
    c.numberWithUnit(`${LETTERS[w]} · ${tally[w]}`, t(K + 'votes'), cx, cy + R * 1.35, box.w - 40, c.px(15, 1.25), c.pal.sun, 'center');
    // Participation chips.
    const chipY = Math.min(box.y + box.h - chipH * 2 - 22, cy + R * 1.6);
    const s1: Status = sim.pick >= 0 ? 'good' : 'warn';
    const s2: Status = sim.vote >= 0 ? 'good' : 'warn';
    c.statusStrip({ x: box.x + 16, y: chipY, w: box.w - 32, h: chipH }, s1, t(sim.pick >= 0 ? K + 'chip.contributed' : K + 'chip.none_pick'));
    c.statusStrip({ x: box.x + 16, y: chipY + chipH + 8, w: box.w - 32, h: chipH }, s2, t(sim.vote >= 0 ? K + 'chip.voted' : K + 'chip.none_vote'));
  }
}
