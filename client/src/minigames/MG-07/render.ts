// MG-07 canvas renderer: status strip, FLIGHT's poll of the consoles, this console's three
// readings with their launch-commit limits, the answer timer and the GO / NO-GO buttons.
import { fmt } from '../../data/format';
import { rect, View2D, withAlpha, type GlyphKind, type Rect, type Tone, type Translate } from '../MG-09/shared/draw';
import { CHANNELS, inLimits, type Mg07Sim, type Reading } from './model';

export interface Mg07Frame {
  timeMs: number;
  /** Teammates' calls from the host (slot → true GO / false NO-GO), when known. */
  liveCalls: Map<number, boolean>;
  down?: 'GO' | 'NOGO' | null;
  pausedText?: string | null;
  finger?: 'GO' | 'NOGO' | null;
  fingerDown?: boolean;
}

export function limitText(r: Reading, unit: string, decimals: number, t: Translate): string {
  const lo = Number.isFinite(r.lo);
  const hi = Number.isFinite(r.hi);
  const f = (v: number) => fmt(v, decimals, decimals);
  if (lo && hi) return t('minigame.MG-07.limits.range', { lo: f(r.lo), hi: f(r.hi), unit });
  if (hi) return t('minigame.MG-07.limits.max', { hi: f(r.hi), unit });
  return t('minigame.MG-07.limits.min', { lo: f(r.lo), unit });
}

export class Mg07View extends View2D {
  private sim: Mg07Sim;
  private readonly compact: boolean;
  private strip = rect(0, 0, 0, 0);
  private loop = rect(0, 0, 0, 0);
  private cards = rect(0, 0, 0, 0);
  private timer = rect(0, 0, 0, 0);
  private goBtn = rect(0, 0, 0, 0);
  private nogoBtn = rect(0, 0, 0, 0);
  private hint = rect(0, 0, 0, 0);

  constructor(canvas: HTMLCanvasElement, sim: Mg07Sim, t: Translate, reducedMotion: boolean, compact: boolean) {
    super(canvas, t, reducedMotion);
    this.sim = sim;
    this.compact = compact;
    this.layout();
  }

  setSim(sim: Mg07Sim) {
    this.sim = sim;
    this.layout();
  }

  resize() {
    this.measure();
    this.layout();
  }

  buttonAt(x: number, y: number): 'GO' | 'NOGO' | null {
    const inR = (r: Rect) => x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6;
    return inR(this.goBtn) ? 'GO' : inR(this.nogoBtn) ? 'NOGO' : null;
  }

  private layout() {
    const { W, H, us } = this;
    const pad = this.compact ? 8 : 12;
    let y = pad;
    if (!this.compact) {
      const stripH = Math.round(40 * us);
      this.strip = rect(pad, y, W - pad * 2, stripH);
      y += stripH + 8;
    } else this.strip = rect(0, 0, 0, 0);
    const hintH = this.compact ? 0 : Math.round(24 * us);
    this.hint = rect(pad, H - pad - hintH, W - pad * 2, hintH);
    const btnH = this.compact ? Math.round(H * 0.22) : Math.max(64, Math.round(80 * Math.min(this.u, 1.4)));
    const by = (this.compact ? H - pad : this.hint.y - 6) - btnH;
    const gap = 10;
    const bw = (W - pad * 2 - gap) / 2;
    const a = rect(pad, by, bw, btnH);
    const b = rect(pad + bw + gap, by, bw, btnH);
    this.goBtn = this.rtl ? b : a;
    this.nogoBtn = this.rtl ? a : b;
    const timerH = this.compact ? 6 : Math.round(30 * Math.min(this.u, 1.3));
    this.timer = rect(pad, by - 8 - timerH, W - pad * 2, timerH);
    const rows = Math.min(this.sim.slots, this.compact ? 3 : 5);
    const rowH = this.compact ? 0 : Math.round(30 * Math.min(this.u, 1.35));
    const loopH = this.compact ? 0 : rowH * rows + Math.round(30 * Math.min(this.u, 1.3));
    this.loop = rect(pad, y, W - pad * 2, loopH);
    if (loopH) y += loopH + 8;
    // The demo slot carries a "Demo" tag in its top corner.
    if (this.compact) y = Math.max(y, 30);
    this.cards = rect(pad, y, W - pad * 2, this.timer.y - 8 - y);
  }

  draw(f: Mg07Frame) {
    this.begin();
    if (!this.compact) {
      this.drawStrip();
      this.drawLoop(f);
    }
    this.drawCards();
    this.drawTimer();
    this.drawButtons(f);
    if (!this.compact) {
      const key = this.sim.config.oneButton ? 'minigame.MG-07.hint.one' : 'minigame.MG-07.hint.two';
      this.ctx.textBaseline = 'middle';
      this.textCenter(this.t(key), this.hint.x + this.hint.w / 2, this.hint.y + this.hint.h / 2 + 1, this.hint.w, 12.5 * this.us, 600, false, this.pal.dim);
      this.ctx.textBaseline = 'alphabetic';
    }
    if (f.pausedText) this.paused(f.pausedText);
  }

  private drawStrip() {
    const s = this.sim;
    const now = s.timeMs;
    if (!s.myTurn) {
      this.statusStrip(this.strip, 'neutral', 'dot', this.t('minigame.MG-07.status.wait', { s: fmt(Math.max(0, s.startMs - now) / 1000, 1, 1) }));
      return;
    }
    if (s.answer) {
      this.statusStrip(this.strip, 'neutral', s.answer === 'GO' ? 'ok' : 'stop', this.t(s.answer === 'GO' ? 'minigame.MG-07.status.called_go' : 'minigame.MG-07.status.called_nogo'));
      return;
    }
    if (s.timedOut) {
      this.statusStrip(this.strip, 'warn', 'warn', this.t('minigame.MG-07.status.timeout'));
      return;
    }
    const left = Math.max(0, s.deadlineMs - now);
    this.statusStrip(this.strip, left < 1500 ? 'warn' : 'accent', left < 1500 ? 'warn' : 'ring', this.t('minigame.MG-07.status.your_call', { n: s.slot + 1 }));
  }

  private drawLoop(f: Mg07Frame) {
    const { ctx, pal, sim } = this;
    const r = this.loop;
    this.panel(r, 12, pal.bg1);
    const px = 10.5 * Math.min(this.u, 1.3);
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-07.loop.title'), r, 12, r.y + px + 8, px, 700, true, pal.dim, r.w * 0.6);
    const turn = sim.config.turnMs;
    const now = sim.timeMs;
    const current = Math.min(sim.slots - 1, Math.floor(now / turn));
    const rows = Math.min(sim.slots, 5);
    // Show a window of rows around the console being polled.
    const first = Math.max(0, Math.min(sim.slots - rows, current - 1));
    const rowH = (r.h - Math.round(30 * Math.min(this.u, 1.3))) / rows;
    const top = r.y + Math.round(26 * Math.min(this.u, 1.3));
    for (let k = 0; k < rows; k++) {
      const i = first + k;
      const row = rect(r.x + 6, top + k * rowH, r.w - 12, rowH - 4);
      const mine = i === sim.slot;
      const active = i === current && (!mine || (!sim.answer && !sim.timedOut));
      if (active) {
        this.roundRect(row, 8);
        ctx.fillStyle = withAlpha(pal.accent, 0.14);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const midY = row.y + row.h / 2;
      ctx.textBaseline = 'middle';
      const name = this.t('minigame.MG-07.loop.console', { n: i + 1 });
      const who = mine ? this.t('minigame.MG-07.loop.you') : f.liveCalls.size ? this.t('minigame.MG-07.loop.teammate') : this.t('minigame.MG-07.loop.crew');
      this.textStart(`${name} · ${who}`, row, 10, midY + 1, 12 * Math.min(this.u, 1.3), mine ? 800 : 650, false, mine ? pal.text : pal.dim, row.w * 0.55);
      // Status of that console.
      let text: string;
      let tone: Tone = 'neutral';
      let glyph: GlyphKind = 'dot';
      if (mine) {
        if (sim.answer) {
          text = this.t(sim.answer === 'GO' ? 'minigame.MG-07.call.go' : 'minigame.MG-07.call.nogo');
          glyph = sim.answer === 'GO' ? 'ok' : 'stop';
          tone = sim.answer === 'GO' ? 'good' : 'bad';
        } else if (sim.timedOut) {
          text = this.t('minigame.MG-07.call.none');
          glyph = 'warn';
          tone = 'warn';
        } else if (sim.myTurn) {
          text = this.t('minigame.MG-07.call.polling');
          tone = 'accent';
          glyph = 'ring';
        } else text = this.t('minigame.MG-07.call.standby');
      } else {
        const start = i * turn;
        const live = f.liveCalls.get(i);
        const c = sim.crew[i]!;
        const answeredAt = live !== undefined ? start : c.atMs === null ? null : start + c.atMs;
        const go = live !== undefined ? live : c.go;
        if (now < start) text = this.t('minigame.MG-07.call.standby');
        else if (answeredAt !== null && now >= answeredAt) {
          text = this.t(go ? 'minigame.MG-07.call.go' : 'minigame.MG-07.call.nogo');
          glyph = go ? 'ok' : 'stop';
          tone = go ? 'good' : 'bad';
        } else if (now < start + turn) {
          text = this.t('minigame.MG-07.call.polling');
          tone = 'accent';
          glyph = 'ring';
        } else {
          text = this.t('minigame.MG-07.call.none');
          glyph = 'warn';
          tone = 'warn';
        }
      }
      const c = this.tone(tone);
      const tpx = 12 * Math.min(this.u, 1.3);
      ctx.font = this.font(tpx, 800, true);
      const tw = Math.min(ctx.measureText(text).width, row.w * 0.38);
      const gs = tpx * 1.1;
      const endX = this.ex(row, 10);
      const gx = this.rtl ? endX + tw + 6 + gs / 2 : endX - tw - 6 - gs / 2;
      this.glyph(glyph, gx, midY, gs, c);
      this.textEnd(text, row, 10, midY + 1, tpx, 800, true, c, row.w * 0.38);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawCards() {
    const { ctx, pal, sim } = this;
    const r = this.cards;
    const n = sim.readings.length;
    const gap = this.compact ? 5 : 8;
    const h = (r.h - gap * (n - 1)) / n;
    const shown = sim.myTurn;
    for (let i = 0; i < n; i++) {
      const card = rect(r.x, r.y + i * (h + gap), r.w, h);
      const rd = sim.readings[i]!;
      const ch = CHANNELS[rd.channel]!;
      this.panel(card, 12);
      const px = (this.compact ? 9.5 : 11.5) * Math.min(this.u, 1.3);
      ctx.textBaseline = 'alphabetic';
      const name = this.t(`minigame.MG-07.ch.${ch.id}`);
      if (this.compact) {
        // One line: name and value; the gauge carries the limits.
        this.textStart(name, card, 10, card.y + px + 4, px, 750, false, pal.dim, card.w * 0.55);
        if (shown) {
          ctx.direction = 'ltr';
          ctx.textAlign = 'right';
          ctx.font = this.font(px * 1.15, 800, true);
          ctx.fillStyle = pal.text;
          ctx.fillText(`${fmt(rd.value, ch.decimals, ch.decimals)} ${ch.unit}`, this.rtl ? card.x + card.w * 0.45 : card.x + card.w - 10, card.y + px * 1.15 + 4);
          ctx.direction = this.rtl ? 'rtl' : 'ltr';
        }
      } else this.textStart(name, card, 12, card.y + px + 7, px, 750, false, pal.dim, card.w * 0.55);
      if (!shown) {
        if (this.compact) continue;
        ctx.textBaseline = 'middle';
        this.textCenter(this.t('minigame.MG-07.reading.hidden'), card.x + card.w / 2, card.y + card.h / 2 + px * 0.4, card.w - 24, 13 * Math.min(this.u, 1.3), 650, false, pal.faint);
        ctx.textBaseline = 'alphabetic';
        continue;
      }
      const valuePx = this.compact ? 0 : Math.min(38 * Math.min(this.u, 1.35), card.h * 0.34);
      const gaugeH = !sim.config.showGauges ? 0 : this.compact ? 6 : Math.max(10, Math.min(18, card.h * 0.16));
      const baseY = card.y + card.h - 12 - (gaugeH ? gaugeH + 12 : 0);
      if (!this.compact) {
        const lim = limitText(rd, ch.unit, ch.decimals, this.t);
        this.textEnd(lim, card, 12, card.y + px + 7, px, 700, true, pal.text, card.w * 0.5);
        this.numberUnit(fmt(rd.value, ch.decimals, ch.decimals), ch.unit, card, 12, baseY, valuePx, pal.text, card.w * 0.6);
      }
      if (sim.config.showGauges) {
        const g = this.compact ? rect(card.x + 10, card.y + card.h - 7 - gaugeH, card.w - 20, gaugeH) : rect(card.x + 12, card.y + card.h - 12 - gaugeH, card.w - 24, gaugeH);
        // Time and value run left to right in every direction (it is a scale).
        const x = (v: number) => g.x + ((Math.min(ch.max, Math.max(ch.min, v)) - ch.min) / (ch.max - ch.min)) * g.w;
        ctx.fillStyle = pal.bg0;
        this.roundRect(g, 4);
        ctx.fill();
        const lo = Number.isFinite(rd.lo) ? rd.lo : ch.min;
        const hi = Number.isFinite(rd.hi) ? rd.hi : ch.max;
        ctx.fillStyle = withAlpha(pal.good, 0.28);
        ctx.fillRect(x(lo), g.y + 2, x(hi) - x(lo), g.h - 4);
        ctx.strokeStyle = pal.good;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (Number.isFinite(rd.lo)) {
          ctx.moveTo(x(rd.lo), g.y - 3);
          ctx.lineTo(x(rd.lo), g.y + g.h + 3);
        }
        if (Number.isFinite(rd.hi)) {
          ctx.moveTo(x(rd.hi), g.y - 3);
          ctx.lineTo(x(rd.hi), g.y + g.h + 3);
        }
        ctx.stroke();
        ctx.strokeStyle = pal.lineStrong;
        ctx.lineWidth = 1;
        this.roundRect(g, 4);
        ctx.stroke();
        // The reading: a needle in text colour (the player judges; no status colour is given away).
        const vx = x(rd.value);
        ctx.fillStyle = pal.text;
        const nd = this.compact ? 3 : 6;
        ctx.fillRect(vx - 1.5, g.y - nd * 0.6, 3, g.h + nd * 1.2);
        ctx.beginPath();
        ctx.moveTo(vx, g.y - 1);
        ctx.lineTo(vx - nd, g.y - nd * 1.5);
        ctx.lineTo(vx + nd, g.y - nd * 1.5);
        ctx.closePath();
        ctx.fill();
      }
      // After the call: show which readings were out (teaching moment, stays until the host moves on).
      if ((sim.answer || sim.timedOut) && !this.compact) {
        const ok = inLimits(rd);
        this.glyph(ok ? 'ok' : 'stop', this.ex(card, 22), baseY - valuePx * 0.35, valuePx * 0.7, ok ? pal.good : pal.bad);
      }
    }
  }

  private drawTimer() {
    const { ctx, pal, sim } = this;
    const r = this.timer;
    const now = sim.timeMs;
    const win = sim.config.windowMs;
    const left = sim.myTurn ? Math.max(0, sim.deadlineMs - now) : win;
    const frac = sim.answer || sim.timedOut ? 0 : left / win;
    const barH = this.compact ? r.h : Math.max(6, r.h * 0.32);
    const bar = rect(r.x, r.y + r.h - barH, r.w, barH);
    ctx.fillStyle = pal.line;
    this.roundRect(bar, barH / 2);
    ctx.fill();
    const c = !sim.myTurn ? pal.faint : left < 1500 ? pal.warn : pal.accent;
    ctx.fillStyle = c;
    const fw = bar.w * frac;
    this.roundRect(rect(this.rtl ? bar.x + bar.w - fw : bar.x, bar.y, Math.max(0, fw), bar.h), barH / 2);
    ctx.fill();
    if (this.compact) return;
    const px = 11 * Math.min(this.u, 1.3);
    ctx.textBaseline = 'alphabetic';
    this.textStart(this.t('minigame.MG-07.timer.label'), r, 2, bar.y - 5, px, 700, true, pal.dim, r.w * 0.6);
    this.textEnd(`${fmt(left / 1000, 1, 1)} s`, r, 2, bar.y - 5, px * 1.15, 800, true, sim.myTurn ? c : pal.faint);
  }

  private drawButtons(f: Mg07Frame) {
    const { sim } = this;
    const open = sim.myTurn && !sim.answer && !sim.timedOut;
    const lit = sim.config.oneButton && open ? sim.highlighted(sim.timeMs) : null;
    const sub = this.compact ? undefined : sim.config.oneButton ? this.t('minigame.MG-07.btn.one_sub') : undefined;
    this.button(this.goBtn, this.t('minigame.MG-07.call.go'), {
      tone: 'good',
      glyph: 'ok',
      enabled: open || sim.answer === 'GO',
      armed: lit === 'GO',
      pressed: f.down === 'GO' || sim.answer === 'GO',
      sub: sim.config.oneButton ? (lit === 'GO' ? sub : undefined) : this.compact ? undefined : this.t('minigame.MG-07.btn.key_go'),
    });
    this.button(this.nogoBtn, this.t('minigame.MG-07.call.nogo'), {
      tone: 'bad',
      glyph: 'stop',
      enabled: open || sim.answer === 'NOGO',
      armed: lit === 'NOGO',
      pressed: f.down === 'NOGO' || sim.answer === 'NOGO',
      sub: sim.config.oneButton ? (lit === 'NOGO' ? sub : undefined) : this.compact ? undefined : this.t('minigame.MG-07.btn.key_nogo'),
    });
    if (f.finger) {
      const b = f.finger === 'GO' ? this.goBtn : this.nogoBtn;
      this.finger(b.x + b.w * 0.62, b.y + b.h * 0.6, !!f.fingerDown, this.compact ? 13 : 18);
    }
  }
}
