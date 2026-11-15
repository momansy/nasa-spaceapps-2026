// MG-26 canvas renderer: time and cards cards, a status line, the seven-position board (the EDL
// sequence), the tray of this player's cards, the trigger slider of the picked card and the SEND
// button; in the watch phase the board replays the sequence. It only reads the simulation; the rules
// live in `model.ts`.
import { fmt } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import { CARD_KEYS, N_CARDS, PLAN, WATCH_STEPS, type Mg26Sim } from './model';

export type Hit =
  | { kind: 'row'; pos: number }
  | { kind: 'chip'; card: number }
  | { kind: 'slider'; frac: number }
  | { kind: 'send' }
  | { kind: 'field' };

export class Mg26View implements ViewLike<Mg26Sim> {
  readonly g: Gfx;
  private sim: Mg26Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private board: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tray: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private editor: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private track: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private sendBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rowH = 30;
  private gapPx = 6;
  private tight = false;
  private chipRects: Array<{ card: number; r: Rect }> = [];
  /** Board position under the keyboard cursor (keys only). */
  cursor = 0;

  constructor(canvas: HTMLCanvasElement, sim: Mg26Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg26Sim) {
    this.sim = sim;
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
    // Tight layout (short canvas, e.g. 200 % text): no HUD cards (time and count go into the status line), smaller chips.
    const full = Math.round(56 * Math.min(u, 1.45)) + Math.round(34 * Math.min(u, 1.5)) + Math.round(52 * k) + Math.round(46 * k) * 2 + Math.round(84 * k) + gap * 8 + 7 * 30 + pad * 2;
    this.tight = !compact && H < full;
    const t = this.tight ? 0.8 : 1;
    const hudH = compact || this.tight ? 0 : Math.round(56 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(34 * Math.min(u, 1.5));
    const sendH = compact ? 0 : Math.round(52 * k * t);
    const chipH = Math.round(46 * k * t);
    const trayH = compact ? 0 : chipH * 2 + gap;
    const editH = compact ? 0 : Math.round(84 * k * t);
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? gap : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? gap : 0);
    const fixedBelow = (compact ? 0 : sendH + trayH + editH + gap * 3) + pad;
    const boardH = Math.max(7 * 24, H - y - fixedBelow);
    this.rowH = Math.floor((boardH - gap * 6) / 7);
    this.board = { x: pad, y, w: W - pad * 2, h: this.rowH * 7 + gap * 6 };
    y += this.board.h + gap;
    this.tray = { x: pad, y, w: W - pad * 2, h: trayH };
    y += trayH + (trayH ? gap : 0);
    this.editor = { x: pad, y, w: W - pad * 2, h: editH };
    y += editH + (editH ? gap : 0);
    this.sendBtn = { x: pad, y, w: W - pad * 2, h: sendH };
    const tw = this.editor.w - 24;
    this.track = { x: this.editor.x + 12, y: this.editor.y + this.editor.h - 26 * k, w: tw, h: 14 * k };
    // Tray chips, four to a row.
    this.chipRects = [];
    const cols = 4;
    const cw = (this.tray.w - gap * (cols - 1)) / cols;
    const ch = chipH;
    this.sim.config.own.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = g.rtl ? this.tray.x + this.tray.w - cw - col * (cw + gap) : this.tray.x + col * (cw + gap);
      this.chipRects.push({ card: c, r: { x: cx, y: this.tray.y + row * (ch + gap), w: cw, h: ch } });
    });
  }

  private rowRect(pos: number): Rect {
    const b = this.board;
    return { x: b.x, y: b.y + pos * (this.rowH + this.gapPx), w: b.w, h: this.rowH };
  }
  private inside(r: Rect, x: number, y: number, s = 4): boolean {
    return r.w > 0 && x >= r.x - s && x <= r.x + r.w + s && y >= r.y - s && y <= r.y + r.h + s;
  }

  /** What a press at (x, y) means. */
  hit(x: number, y: number): Hit | null {
    if (this.sim.config.oneButton) return { kind: 'field' };
    if (this.sim.phase !== 'program') return null;
    if (this.inside(this.sendBtn, x, y)) return { kind: 'send' };
    if (this.inside({ ...this.track, y: this.track.y - 18, h: this.track.h + 36 }, x, y)) return { kind: 'slider', frac: this.fracAt(x) };
    for (const c of this.chipRects) if (this.inside(c.r, x, y)) return { kind: 'chip', card: c.card };
    for (let p = 0; p < N_CARDS; p++) if (this.inside(this.rowRect(p), x, y, 2)) return { kind: 'row', pos: p };
    return null;
  }
  /** Slider fraction for a canvas x (mirrored in right-to-left layouts). */
  fracAt(x: number): number {
    const t = clamp((x - this.track.x) / this.track.w, 0, 1);
    return this.g.rtl ? 1 - t : t;
  }

  demoFinger(sim: Mg26Sim): { x: number; y: number; down: boolean } | null {
    if (sim.phase !== 'program') return null;
    const next = sim.trayCards()[0];
    const last = sim.config.own.filter((c) => sim.cardPos[c]! >= 0).pop();
    const target = next ?? last;
    if (target === undefined) return null;
    const r = this.rowRect(target);
    return { x: r.x + r.w * 0.5, y: r.y + r.h / 2, down: sim.step % 24 < 8 };
  }

  private cardName(c: number): string {
    return this.env.t(`minigame.MG-26.card.${CARD_KEYS[c]!}`);
  }
  private unitOf(c: number): string {
    return PLAN[c]!.kind === 0 ? 'km' : 's';
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    g.begin();
    if (!this.compact) {
      if (!this.tight) this.drawHud();
      this.drawStrip();
    }
    this.drawBoard(f);
    if (!this.compact) {
      this.drawTray();
      this.drawEditor();
      this.drawSend();
    }
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
    const own = sim.config.own;
    const placed = own.filter((c) => sim.cardPos[c]! >= 0).length;
    const urgent = sim.phase === 'program' && sim.leftS < 8;
    const cardsData = [
      { label: this.env.t('minigame.MG-26.hud.time'), num: fmt(sim.phase === 'program' ? sim.leftS : 0, 0), unit: 's', col: urgent ? pal.warn : pal.text },
      { label: this.env.t('minigame.MG-26.hud.cards'), num: `${placed}/${own.length}`, unit: '', col: pal.text },
    ];
    const pad = 12;
    cardsData.forEach((c, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? 1 - i : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, i === 0 && urgent ? pal.warn : null, i === 0 && urgent ? 'dashed' : 'solid');
      const s = g.startX(r, pad);
      g.label(c.label, s.x, r.y + 18 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      if (c.unit) g.numberWithUnit(c.num, c.unit, s.x, r.y + r.h - 10, w - pad * 2, 28 * Math.min(g.u, 1.3), c.col);
      else {
        g.fit(c.num, w - pad * 2, 28 * Math.min(g.u, 1.3), 800, true);
        g.ctx.textAlign = s.align;
        g.ctx.fillStyle = c.col;
        g.ctx.direction = 'ltr';
        g.ctx.fillText(c.num, s.x, r.y + r.h - 10);
        g.ctx.direction = g.rtl ? 'rtl' : 'ltr';
      }
    });
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.strip;
    let key: string;
    let col = pal.dim;
    let glyph: 'ok' | 'up' | 'down' | 'x' | 'dot' = 'dot';
    let args: Record<string, string | number> | undefined;
    if (sim.phase === 'program') {
      const left = sim.trayCards().length;
      key = left > 0 ? 'minigame.MG-26.status.program' : 'minigame.MG-26.status.ready';
      args = { n: left };
      col = left > 0 ? pal.accentStrong : pal.good;
      glyph = left > 0 ? 'up' : 'ok';
    } else {
      key = 'minigame.MG-26.status.watch';
      args = { m: sim.lightMin };
      col = pal.accentStrong;
      glyph = 'dot';
    }
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(sim.phase === 'watch' ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    let text = this.env.t(key, args);
    if (this.tight && sim.phase === 'program') text += ` · ${fmt(sim.leftS, 0)} s`;
    const size = g.fit(text, r.w - 56, 13 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(glyph, r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  private drawBoard(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const u = Math.min(g.u, 1.3);
    const watching = sim.phase === 'watch';
    const revealed = watching ? Math.floor(((sim.step - sim.watchStart) / WATCH_STEPS) * (N_CARDS + 1)) : -1;
    const hl = sim.config.oneButton && !watching ? sim.highlight : -1;
    const activeCard = sim.active;
    for (let p = 0; p < N_CARDS; p++) {
      const r = this.rowRect(p);
      const at = sim.cardAt(p);
      const isCursor = !this.compact && !sim.config.oneButton && sim.phase === 'program' && this.cursor === p;
      let border: string = pal.line;
      let fill: string = pal.bg1;
      let dash: number[] = [];
      let glyph: 'ok' | 'up' | 'down' | 'x' | 'dot' | null = null;
      let glyphCol: string = pal.dim;
      if (at?.own) {
        const j = sim.judgeCard(at.card);
        if (watching && p < revealed) {
          const good = at.card === p && j.inWindow;
          border = good ? pal.good : pal.bad;
          fill = withAlpha(border, 0.14);
          glyph = good ? 'ok' : 'x';
          glyphCol = border;
          dash = good ? [] : [5, 3];
        } else {
          border = pal.accentStrong;
          fill = withAlpha(pal.accent, at.card === activeCard ? 0.3 : 0.14);
        }
      } else if (at) {
        border = pal.lineStrong;
        fill = withAlpha(pal.faint, 0.18);
        if (watching && p < revealed) {
          glyph = 'ok';
          glyphCol = pal.dim;
        }
      }
      if (p === hl) {
        border = pal.accentStrong;
        fill = withAlpha(pal.accent, 0.4);
        dash = [];
      }
      g.roundRect(r, 8);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = p === hl || isCursor ? 3 : 1.5;
      ctx.strokeStyle = isCursor ? pal.text : border;
      ctx.setLineDash(isCursor ? [3, 3] : dash);
      ctx.stroke();
      ctx.setLineDash([]);
      // position number badge
      const bx = g.rtl ? r.x + r.w - 22 * u : r.x + 22 * u;
      ctx.fillStyle = pal.dim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = g.font(Math.min(15 * u, r.h * 0.6), 800, true);
      ctx.fillText(String(p + 1), bx, r.y + r.h / 2 + 1);
      // label
      const s = g.startX(r, 40 * u);
      ctx.textAlign = s.align;
      if (at) {
        const name = this.cardName(at.card) + (at.own ? '' : ` · ${this.env.t('minigame.MG-26.crew')}`);
        g.fit(name, r.w - 40 * u - 44 * u, Math.min(14 * u, r.h * 0.55), 700, false);
        ctx.fillStyle = at.own ? pal.text : pal.dim;
        ctx.fillText(name, s.x, r.y + r.h / 2 + 1);
        if (glyph) g.glyph(glyph, g.rtl ? r.x + 20 * u : r.x + r.w - 20 * u, r.y + r.h / 2, Math.min(15 * u, r.h * 0.5), glyphCol);
      } else if (!this.compact && sim.phase === 'program' && sim.config.markSlots && activeCard === p) {
        ctx.fillStyle = pal.good;
        g.fit(this.env.t('minigame.MG-26.here'), r.w - 90 * u, Math.min(12 * u, r.h * 0.5), 700, false);
        ctx.fillText(this.env.t('minigame.MG-26.here'), s.x, r.y + r.h / 2 + 1);
      } else {
        ctx.fillStyle = pal.faint;
        g.fit(this.env.t('minigame.MG-26.empty'), r.w - 90 * u, Math.min(12 * u, r.h * 0.5), 600, false);
        ctx.fillText(this.env.t('minigame.MG-26.empty'), s.x, r.y + r.h / 2 + 1);
      }
      ctx.textBaseline = 'alphabetic';
    }
    void f;
  }

  private drawTray() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const u = Math.min(g.u, 1.3);
    for (const { card, r } of this.chipRects) {
      const placed = sim.cardPos[card]! >= 0;
      const sel = sim.active === card;
      g.roundRect(r, 10);
      ctx.fillStyle = placed ? pal.bg2 : sel ? withAlpha(pal.accent, 0.4) : pal.bg1;
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeStyle = sel ? pal.accentStrong : placed ? pal.line : pal.lineStrong;
      ctx.setLineDash(placed ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = this.cardName(card);
      g.fit(name, r.w - 12, 12 * u, 700, false);
      ctx.fillStyle = placed ? pal.faint : pal.text;
      ctx.fillText(name, r.x + r.w / 2, r.y + r.h * 0.38);
      const plan = `${fmt(sim.target[card]!, 1)} ${this.unitOf(card)}`;
      g.fit(plan, r.w - 12, 10 * u, 600, true);
      ctx.fillStyle = pal.dim;
      ctx.direction = 'ltr';
      ctx.fillText(plan, r.x + r.w / 2, r.y + r.h * 0.74);
      ctx.direction = g.rtl ? 'rtl' : 'ltr';
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawEditor() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const r = this.editor;
    const u = Math.min(g.u, 1.3);
    g.panel(r, null);
    const c = sim.active;
    if (c < 0 || sim.config.oneButton) {
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.dim;
      g.fit(this.env.t(sim.config.oneButton ? 'minigame.MG-26.editor.preset' : 'minigame.MG-26.editor.none'), r.w - 24, 13 * u, 600, false);
      ctx.fillText(this.env.t(sim.config.oneButton ? 'minigame.MG-26.editor.preset' : 'minigame.MG-26.editor.none'), r.x + r.w / 2, r.y + r.h / 2);
      return;
    }
    const s = g.startX(r, 12);
    ctx.textAlign = s.align;
    const kind = PLAN[c]!.kind === 0 ? this.env.t('minigame.MG-26.trigger.altitude') : this.env.t('minigame.MG-26.trigger.time');
    const label = `${this.cardName(c)} · ${kind}`;
    g.fit(label, r.w * 0.55, 13 * u, 700, false);
    ctx.fillStyle = pal.dim;
    ctx.fillText(label, s.x, r.y + 20 * u);
    const e = g.endX(r, 12);
    const val = `${fmt(sim.valueOf(c), 1, 1)} ${this.unitOf(c)}`;
    ctx.textAlign = e.align;
    g.fit(val, r.w * 0.4, 20 * u, 800, true);
    ctx.fillStyle = pal.text;
    ctx.direction = 'ltr';
    ctx.fillText(val, e.x, r.y + 24 * u);
    ctx.direction = g.rtl ? 'rtl' : 'ltr';
    // slider track
    const t = this.track;
    g.roundRect(t, t.h / 2);
    ctx.fillStyle = pal.bg0;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pal.lineStrong;
    ctx.stroke();
    const fr = sim.frac[c]!;
    const kx = g.rtl ? t.x + t.w * (1 - fr) : t.x + t.w * fr;
    ctx.fillStyle = pal.accentStrong;
    ctx.beginPath();
    ctx.arc(kx, t.y + t.h / 2, t.h * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.bg0;
    ctx.lineWidth = 2;
    ctx.stroke();
    // the plan value, marked on the track (a tick and a label above)
    const tf = sim.targetFrac(c);
    const tx = g.rtl ? t.x + t.w * (1 - tf) : t.x + t.w * tf;
    ctx.strokeStyle = pal.good;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, t.y - 5);
    ctx.lineTo(tx, t.y + t.h + 5);
    ctx.stroke();
  }

  private drawSend() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.sendBtn;
    const live = sim.phase === 'program' && !sim.config.oneButton;
    const ready = live && sim.trayCards().length === 0;
    g.roundRect(b, 14);
    ctx.fillStyle = !live ? pal.bg2 : ready ? withAlpha(pal.good, 0.9) : withAlpha(pal.accent, 0.3);
    ctx.fill();
    ctx.lineWidth = ready ? 3 : 1.5;
    ctx.strokeStyle = !live ? pal.line : ready ? pal.good : pal.accent;
    ctx.stroke();
    const label = this.env.t(sim.config.oneButton ? 'minigame.MG-26.button.anywhere' : 'minigame.MG-26.button.send');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 18 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = !live ? pal.faint : ready ? pal.bg0 : pal.text;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}
