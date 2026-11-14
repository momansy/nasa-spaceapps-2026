// MG-28 canvas renderer: time and cards cards, a status line, the chain of evidence (places in
// order), the tray of all clue cards (own cards highlighted), the detail of the picked card, the four
// cause options and the LOCK button. It only reads the simulation; the rules live in `model.ts`.
import { fmt } from '../../data/format';
import type { MinigameEnv } from '../types';
import { Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import { FAILURE_MODES } from './clues';
import { ASIDE, N_OPTIONS, UNSET, type Mg28Sim } from './model';

export type Hit =
  | { kind: 'place'; slot: number }
  | { kind: 'clue'; index: number }
  | { kind: 'option'; option: number }
  | { kind: 'lock' }
  | { kind: 'field' };

export class Mg28View implements ViewLike<Mg28Sim> {
  readonly g: Gfx;
  private sim: Mg28Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chainRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private detail: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private optRects: Rect[] = [];
  private lockBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private clueRects: Rect[] = [];
  private placeH = 30;
  private gapPx = 6;
  private tight = false;
  private wrapKey = '';
  private wrapLines: string[] = [];
  /** Picked clue (index in `clues`) and chain cursor (keys); UI state only. */
  sel = -1;
  cursor = 0;

  constructor(canvas: HTMLCanvasElement, sim: Mg28Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.sel = sim.own[0] ?? 0;
    this.resize();
  }

  setSim(sim: Mg28Sim) {
    this.sim = sim;
    this.sel = sim.own[0] ?? 0;
    this.wrapKey = '';
    this.resize();
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const gap = compact ? 4 : 6;
    this.gapPx = gap;
    const k = Math.min(u, 1.3);
    const nPlaces = this.sim.inv.chainLen + (this.sim.config.oneButton ? 1 : 0);
    const nClues = this.sim.inv.clues.length;
    const rowsTray = Math.ceil(nClues / 3);
    const full = Math.round(56 * Math.min(u, 1.45)) + Math.round(34 * Math.min(u, 1.5)) + nPlaces * Math.round(32 * k) + rowsTray * Math.round(34 * k) + Math.round(66 * k) + 2 * Math.round(40 * k) + Math.round(46 * k) + gap * 10 + pad * 2;
    this.tight = !compact && H < full;
    const t = this.tight ? 0.82 : 1;
    const hudH = compact || this.tight ? 0 : Math.round(56 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(34 * Math.min(u, 1.5));
    const lockH = compact ? 0 : Math.round(46 * k * t);
    const optH = Math.round(40 * k * t);
    const clueH = Math.round(34 * k * t);
    const detH = compact ? 0 : Math.round(66 * k * t);
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? gap : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? gap : 0);
    // chain of evidence
    const fixedBelow = compact ? pad : rowsTray * clueH + (rowsTray - 1) * gap + gap + detH + gap + 2 * optH + gap * 2 + lockH + gap + pad;
    const chainH = Math.max(nPlaces * 18, H - y - fixedBelow - gap);
    this.placeH = Math.floor((chainH - gap * (nPlaces - 1)) / nPlaces);
    this.placeH = Math.min(this.placeH, Math.round(40 * k));
    this.chainRect = { x: pad, y, w: W - pad * 2, h: this.placeH * nPlaces + gap * (nPlaces - 1) };
    y += this.chainRect.h + gap;
    // tray
    this.clueRects = [];
    const cw = (W - pad * 2 - gap * 2) / 3;
    for (let i = 0; i < nClues; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = g.rtl ? W - pad - cw - col * (cw + gap) : pad + col * (cw + gap);
      this.clueRects.push({ x, y: y + row * (clueH + gap), w: cw, h: clueH });
    }
    y += rowsTray * (clueH + gap);
    this.detail = { x: pad, y, w: W - pad * 2, h: detH };
    y += detH + (detH ? gap : 0);
    this.optRects = [];
    const ow = (W - pad * 2 - gap) / 2;
    for (let i = 0; i < N_OPTIONS; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = g.rtl ? W - pad - ow - col * (ow + gap) : pad + col * (ow + gap);
      this.optRects.push({ x, y: y + row * (optH + gap), w: ow, h: optH });
    }
    y += 2 * optH + gap * 2;
    this.lockBtn = { x: pad, y, w: W - pad * 2, h: lockH };
    this.wrapKey = '';
  }

  private placeRect(slot: number): Rect {
    const c = this.chainRect;
    return { x: c.x, y: c.y + slot * (this.placeH + this.gapPx), w: c.w, h: this.placeH };
  }
  private inside(r: Rect, x: number, y: number, s = 3): boolean {
    return r.w > 0 && x >= r.x - s && x <= r.x + r.w + s && y >= r.y - s && y <= r.y + r.h + s;
  }

  /** What a press at (x, y) means. */
  hit(x: number, y: number): Hit | null {
    const sim = this.sim;
    if (sim.config.oneButton) return { kind: 'field' };
    if (this.inside(this.lockBtn, x, y)) return { kind: 'lock' };
    for (let i = 0; i < N_OPTIONS; i++) if (this.inside(this.optRects[i]!, x, y)) return { kind: 'option', option: i };
    for (let i = 0; i < this.clueRects.length; i++) if (this.inside(this.clueRects[i]!, x, y)) return { kind: 'clue', index: i };
    for (let s = 0; s < sim.inv.chainLen; s++) if (this.inside(this.placeRect(s), x, y, 2)) return { kind: 'place', slot: s };
    return null;
  }

  demoFinger(sim: Mg28Sim): { x: number; y: number; down: boolean } | null {
    if (sim.locked) return null;
    const hand = sim.inHand().find((i) => sim.trueSlot(i) >= 0);
    if (hand !== undefined) {
      const r = this.placeRect(sim.trueSlot(hand));
      return { x: r.x + r.w * 0.5, y: r.y + r.h / 2, down: sim.step % 30 < 10 };
    }
    const o = this.optRects[sim.inv.correct]!;
    return { x: o.x + o.w / 2, y: o.y + o.h / 2, down: sim.myVote >= 0 };
  }

  private causeName(option: number): string {
    return this.env.t(`minigame.MG-28.cause.${FAILURE_MODES[this.sim.inv.options[option]!]!}`);
  }
  private chipLabel(i: number): string {
    const c = this.sim.clueOf(i);
    return `${this.env.t(`minigame.MG-28.channel.${c.channel}`)} · ${this.env.t(`minigame.MG-28.pattern.${c.pattern}`)}`;
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    g.begin();
    if (!this.compact) {
      if (!this.tight) this.drawHud();
      this.drawStrip();
    }
    this.drawChain();
    if (!this.compact) {
      this.drawTray();
      this.drawDetail();
    } else this.drawTray();
    if (!this.compact) {
      this.drawOptions();
      this.drawLock();
    } else this.drawOptions();
    if (f.finger) g.finger(f.finger.x, f.finger.y, 22, f.finger.down);
    if (f.active && !this.compact) {
      ctx.strokeStyle = withAlpha(pal.accent, 0.5);
      ctx.lineWidth = 2;
      g.roundRect({ x: 1, y: 1, w: g.W - 2, h: g.H - 2 }, 12);
      ctx.stroke();
    }
    if (f.pausedText) {
      ctx.fillStyle = withAlpha(pal.bg0, 0.7);
      ctx.fillRect(0, 0, g.W, g.H);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'center';
      ctx.font = g.font(22, 800, false);
      ctx.fillText(f.pausedText, g.W / 2, g.H / 2);
    }
  }

  private drawHud() {
    const g = this.g;
    const { pal } = g;
    const sim = this.sim;
    const gap = 8;
    const w = (this.hud.w - gap) / 2;
    const c = sim.ownCorrect();
    const placed = sim.ownSlot.filter((s) => s !== UNSET).length;
    const urgent = !sim.locked && sim.leftS < 8;
    const cardsData = [
      { label: this.env.t('minigame.MG-28.hud.time'), num: fmt(sim.locked ? 0 : sim.leftS, 0), unit: 's', col: urgent ? pal.warn : pal.text },
      { label: this.env.t('minigame.MG-28.hud.cards'), num: `${placed}/${c.total}`, unit: '', col: pal.text },
    ];
    const pad = 12;
    cardsData.forEach((d, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? 1 - i : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, i === 0 && urgent ? pal.warn : null, i === 0 && urgent ? 'dashed' : 'solid');
      const s = g.startX(r, pad);
      g.label(d.label, s.x, r.y + 18 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      if (d.unit) g.numberWithUnit(d.num, d.unit, s.x, r.y + r.h - 10, w - pad * 2, 28 * Math.min(g.u, 1.3), d.col);
      else {
        g.fit(d.num, w - pad * 2, 28 * Math.min(g.u, 1.3), 800, true);
        g.ctx.textAlign = s.align;
        g.ctx.fillStyle = d.col;
        g.ctx.direction = 'ltr';
        g.ctx.fillText(d.num, s.x, r.y + r.h - 10);
        g.ctx.direction = g.rtl ? 'rtl' : 'ltr';
      }
    });
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.strip;
    let text: string;
    let col: string = pal.accentStrong;
    let glyph: 'ok' | 'up' | 'down' | 'x' | 'dot' = 'up';
    if (sim.locked) {
      const cause = this.causeName(sim.inv.correct);
      if (sim.success) {
        text = this.env.t('minigame.MG-28.status.found', { cause });
        col = pal.good;
        glyph = 'ok';
      } else {
        text = this.env.t(sim.myVote < 0 ? 'minigame.MG-28.status.novote' : 'minigame.MG-28.status.missed', { cause });
        col = pal.bad;
        glyph = 'x';
      }
    } else if (sim.config.oneButton) {
      text = this.env.t(sim.phase === 'place' ? 'minigame.MG-28.status.place' : 'minigame.MG-28.status.vote');
    } else {
      text = this.env.t('minigame.MG-28.status.build');
      if (this.tight) text += ` · ${fmt(sim.leftS, 0)} s`;
    }
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(sim.locked ? [] : [5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    const size = g.fit(text, r.w - 56, 13 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(glyph, r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  private drawChain() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const u = Math.min(g.u, 1.3);
    const chain = sim.displayChain();
    const nPlaces = sim.inv.chainLen + (sim.config.oneButton ? 1 : 0);
    const hl = sim.config.oneButton && !sim.locked && sim.phase === 'place' ? sim.highlight : -1;
    for (let s = 0; s < nPlaces; s++) {
      const r = this.placeRect(s);
      const aside = s === sim.inv.chainLen;
      const idx = aside ? -1 : (chain[s] ?? -1);
      const own = idx >= 0 && sim.own.includes(idx);
      const isCursor = !this.compact && !sim.config.oneButton && !sim.locked && this.cursor === s;
      let border: string = pal.line;
      let fill: string = pal.bg1;
      if (idx >= 0) {
        border = own ? pal.accentStrong : pal.lineStrong;
        fill = own ? withAlpha(pal.accent, 0.16) : withAlpha(pal.faint, 0.16);
      }
      if (s === hl) {
        border = pal.accentStrong;
        fill = withAlpha(pal.accent, 0.4);
      }
      g.roundRect(r, 8);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = s === hl || isCursor ? 3 : 1.5;
      ctx.strokeStyle = isCursor ? pal.text : border;
      ctx.setLineDash(isCursor ? [3, 3] : idx < 0 && !aside ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.dim;
      const bx = g.rtl ? r.x + r.w - 18 * u : r.x + 18 * u;
      ctx.font = g.font(Math.min(14 * u, r.h * 0.6), 800, true);
      if (!aside) ctx.fillText(String(s + 1), bx, r.y + r.h / 2 + 1);
      const st = g.startX(r, 34 * u);
      ctx.textAlign = st.align;
      let label: string;
      if (aside) label = this.env.t('minigame.MG-28.aside');
      else if (idx >= 0) label = `${this.chipLabel(idx)}${own ? '' : ` · ${this.env.t('minigame.MG-28.crew')}`}`;
      else label = this.env.t('minigame.MG-28.place.empty', { n: s + 1 });
      g.fit(label, r.w - 52 * u, Math.min(13 * u, r.h * 0.5), 700, false);
      ctx.fillStyle = idx >= 0 ? pal.text : pal.faint;
      ctx.fillText(label, st.x, r.y + r.h / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawTray() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const u = Math.min(g.u, 1.3);
    const chain = sim.displayChain();
    const start = sim.config.markStart ? sim.startClue : -2;
    for (let i = 0; i < this.clueRects.length; i++) {
      const r = this.clueRects[i]!;
      const k = sim.own.indexOf(i);
      const own = k >= 0;
      const used = Array.prototype.includes.call(chain, i) || (own && sim.ownSlot[k] === ASIDE);
      const sel = this.sel === i;
      g.roundRect(r, 8);
      ctx.fillStyle = used ? pal.bg2 : own ? withAlpha(pal.accent, 0.2) : pal.bg1;
      ctx.fill();
      ctx.lineWidth = sel ? 3 : own ? 2 : 1.2;
      ctx.strokeStyle = sel ? pal.text : own ? pal.accentStrong : pal.line;
      ctx.setLineDash(used ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = this.chipLabel(i);
      g.fit(label, r.w - 10, 10.5 * u, 700, false);
      ctx.fillStyle = used ? pal.faint : pal.text;
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h * (start === i ? 0.32 : 0.42));
      if (start === i) {
        const s = this.env.t('minigame.MG-28.start');
        g.fit(s, r.w - 10, 9.5 * u, 800, false);
        ctx.fillStyle = pal.good;
        ctx.fillText(s, r.x + r.w / 2, r.y + r.h * 0.74);
      } else if (!this.compact) {
        const ph = sim.clueOf(i).phase;
        ctx.font = g.font(9.5 * u, 600, true);
        ctx.fillStyle = pal.dim;
        ctx.fillText(ph, r.x + r.w / 2, r.y + r.h * 0.76);
      }
      ctx.textBaseline = 'alphabetic';
    }
  }

  /** Wraps `text` into at most `maxLines` lines of width `maxW` at the current font; cached by key. */
  private wrap(key: string, text: string, maxW: number, maxLines: number): string[] {
    if (key === this.wrapKey) return this.wrapLines;
    const { ctx } = this.g;
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s+\S*$/, '')}…`;
    }
    this.wrapKey = key;
    this.wrapLines = lines;
    return lines;
  }

  private drawDetail() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.detail;
    const u = Math.min(g.u, 1.3);
    g.panel(r, null);
    const i = this.sel;
    if (i < 0 || i >= sim.inv.clues.length) return;
    const c = sim.clueOf(i);
    const own = sim.own.includes(i);
    const s = g.startX(r, 10);
    ctx.textAlign = s.align;
    const head = `${this.chipLabel(i)} · ${c.phase} ${this.env.t(`flight_phase.${c.phase}.name`)}${own ? '' : ` · ${this.env.t('minigame.MG-28.notyours')}`}`;
    g.fit(head, r.w - 20, 10.5 * u, 800, false);
    ctx.fillStyle = own ? pal.accentStrong : pal.dim;
    ctx.fillText(head, s.x, r.y + 15 * u);
    ctx.font = g.font(12 * u, 600, false);
    const lines = this.wrap(`${i}:${r.w}:${g.u}:${this.sim.inv.clues[i]}`, this.env.t(c.textKey), r.w - 20, 3);
    ctx.fillStyle = pal.text;
    ctx.textAlign = s.align;
    ctx.font = g.font(12 * u, 600, false);
    lines.forEach((l, n) => ctx.fillText(l, s.x, r.y + 15 * u + (n + 1) * 14 * u));
  }

  private drawOptions() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const u = Math.min(g.u, 1.3);
    const votes = sim.displayVotes();
    const hl = sim.config.oneButton && !sim.locked && sim.phase === 'vote' ? sim.highlight : -1;
    for (let o = 0; o < N_OPTIONS; o++) {
      const r = this.optRects[o]!;
      const mine = sim.myVote === o;
      const correct = sim.locked && o === sim.inv.correct;
      const wrong = sim.locked && mine && !correct;
      let border: string = pal.line;
      let fill: string = pal.bg1;
      if (mine) {
        border = pal.accentStrong;
        fill = withAlpha(pal.accent, 0.3);
      }
      if (o === hl) {
        border = pal.accentStrong;
        fill = withAlpha(pal.accent, 0.45);
      }
      if (correct) {
        border = pal.good;
        fill = withAlpha(pal.good, 0.2);
      } else if (wrong) {
        border = pal.bad;
        fill = withAlpha(pal.bad, 0.2);
      }
      g.roundRect(r, 10);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = mine || o === hl || correct ? 3 : 1.5;
      ctx.strokeStyle = border;
      ctx.setLineDash(wrong ? [5, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = this.causeName(o);
      g.fit(name, r.w - 30 * u, 12 * u, 800, false);
      ctx.fillStyle = pal.text;
      ctx.fillText(name, r.x + r.w / 2, r.y + r.h / 2 + 1);
      const v = votes[o] ?? 0;
      if (v > 0 && !this.compact) {
        ctx.font = g.font(10 * u, 800, true);
        ctx.fillStyle = pal.dim;
        ctx.fillText(String(v), r.x + r.w - 10 * u, r.y + 10 * u);
      }
      if (correct) g.glyph('ok', r.x + 14 * u, r.y + r.h / 2, 11 * u, pal.good);
      else if (wrong) g.glyph('x', r.x + 14 * u, r.y + r.h / 2, 11 * u, pal.bad);
      else if (mine) g.glyph('dot', r.x + 14 * u, r.y + r.h / 2, 11 * u, pal.accentStrong);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawLock() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.lockBtn;
    const live = !sim.locked && !sim.config.oneButton;
    const ready = live && sim.myVote >= 0;
    g.roundRect(b, 14);
    ctx.fillStyle = !live ? pal.bg2 : ready ? withAlpha(pal.good, 0.9) : withAlpha(pal.accent, 0.25);
    ctx.fill();
    ctx.lineWidth = ready ? 3 : 1.5;
    ctx.strokeStyle = !live ? pal.line : ready ? pal.good : pal.accent;
    ctx.stroke();
    const label = this.env.t(sim.config.oneButton ? 'minigame.MG-28.button.anywhere' : 'minigame.MG-28.button.lock');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 17 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = !live ? pal.faint : ready ? pal.bg0 : pal.text;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}
