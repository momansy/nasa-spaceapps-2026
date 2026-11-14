// MG-23 canvas renderer: altitude and speed cards, the status line of this player's gate, the
// descent scene with the canopies, the gate timeline, the four stage cards and the DEPLOY button.
// It only reads the simulation; the rules live in `model.ts`.
import { fmt } from '../../data/format';
import type { MinigameEnv } from '../types';
import { clamp, Gfx, withAlpha, type Frame, type Rect, type ViewLike } from '../MG-22/kit';
import { CANOPIES, STAGES, type Mg23Sim, type StageState } from './model';

const STATE_STYLE: Record<StageState, { glyph: 'ok' | 'up' | 'down' | 'x' | 'dot'; border: 'solid' | 'dashed' | 'double' }> = {
  wait: { glyph: 'dot', border: 'solid' },
  gate: { glyph: 'up', border: 'dashed' },
  ok: { glyph: 'ok', border: 'solid' },
  torn: { glyph: 'x', border: 'double' },
  late: { glyph: 'down', border: 'double' },
  missed: { glyph: 'x', border: 'dashed' },
};

export class Mg23View implements ViewLike<Mg23Sim> {
  readonly g: Gfx;
  private sim: Mg23Sim;
  private readonly env: MinigameEnv;
  private readonly compact: boolean;
  private hud: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private strip: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scene: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private timeline: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cards: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** The DEPLOY button; the whole playfield in one-button mode. */
  button: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(canvas: HTMLCanvasElement, sim: Mg23Sim, env: MinigameEnv, compact: boolean) {
    this.g = new Gfx(canvas);
    this.sim = sim;
    this.env = env;
    this.compact = compact;
    this.resize();
  }

  setSim(sim: Mg23Sim) {
    this.sim = sim;
  }

  resize() {
    const g = this.g;
    g.measure();
    const { W, H, u } = g;
    const compact = this.compact;
    const pad = compact ? 8 : 12;
    const hudH = compact ? 0 : Math.round(60 * Math.min(u, 1.45));
    const stripH = compact ? 0 : Math.round(36 * Math.min(u, 1.5));
    const btnH = compact ? 0 : Math.round(56 * Math.min(u, 1.3));
    const cardsH = Math.round((compact ? 52 : 74) * Math.min(u, 1.4));
    const tlH = compact ? 14 : Math.round(26 * Math.min(u, 1.3));
    let y = pad;
    this.hud = { x: pad, y, w: W - pad * 2, h: hudH };
    y += hudH + (hudH ? 8 : 0);
    this.strip = { x: pad, y, w: W - pad * 2, h: stripH };
    y += stripH + (stripH ? 8 : 0);
    const bottom = H - pad;
    const btnY = bottom - btnH;
    const cardsY = btnY - (btnH ? 8 : 0) - cardsH;
    const tlY = cardsY - 6 - tlH;
    this.cards = { x: pad, y: cardsY, w: W - pad * 2, h: cardsH };
    this.timeline = { x: pad, y: tlY, w: W - pad * 2, h: tlH };
    this.scene = { x: pad, y, w: W - pad * 2, h: Math.max(80, tlY - 8 - y) };
    this.button = btnH ? { x: pad, y: btnY, w: W - pad * 2, h: btnH } : { x: 0, y: 0, w: 0, h: 0 };
  }

  /** Is (x, y) a press that deploys? Anywhere in one-button mode, otherwise on the button. */
  hits(x: number, y: number): boolean {
    if (this.sim.config.wholeField) return true;
    const b = this.button;
    return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
  }

  demoFinger(sim: Mg23Sim): { x: number; y: number; down: boolean } | null {
    const t = sim.timeS;
    const near = Math.abs(t - sim.ownCentreS) < 0.6;
    const b = this.cards;
    const down = sim.deployS !== null && t - sim.deployS < 0.5;
    if (!near && !down) return null;
    return { x: b.x + b.w / 2, y: b.y + b.h + 30, down };
  }

  private stateColor(s: StageState): string {
    const p = this.g.pal;
    return s === 'ok' ? p.good : s === 'gate' ? p.accentStrong : s === 'torn' ? p.bad : s === 'late' || s === 'missed' ? p.warn : p.dim;
  }

  draw(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    g.begin();
    if (!this.compact) {
      this.drawHud();
      this.drawStrip();
    }
    this.drawScene(f);
    this.drawTimeline();
    this.drawCards();
    if (!this.compact) this.drawButton(f);
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
    const cardsData: Array<{ label: string; num: string; unit: string }> = [
      { label: this.env.t('minigame.MG-23.hud.altitude'), num: fmt(Math.max(0, sim.altitudeM), 0), unit: 'm' },
      { label: this.env.t('minigame.MG-23.hud.speed'), num: fmt(sim.speedMS, 0), unit: 'm/s' },
    ];
    const pad = 12;
    cardsData.forEach((c, i) => {
      const r: Rect = { x: this.hud.x + (g.rtl ? (1 - i) : i) * (w + gap), y: this.hud.y, w, h: this.hud.h };
      g.panel(r, null);
      const s = g.startX(r, pad);
      g.label(c.label, s.x, r.y + 20 * g.u * 0.8, 11 * Math.min(g.u, 1.3), pal.dim, w - pad * 2, s.align);
      g.numberWithUnit(c.num, c.unit, s.x, r.y + r.h - 12, w - pad * 2, 30 * Math.min(g.u, 1.3), pal.text);
    });
  }

  private statusKey(): { key: string; state: StageState; args?: Record<string, string | number> } {
    const sim = this.sim;
    const st = sim.stageState(sim.config.stage);
    if (st === 'wait') return { key: 'minigame.MG-23.status.wait', state: st, args: { s: fmt(Math.max(0, sim.gateOpenS - sim.timeS), 1) } };
    if (st === 'gate') return { key: 'minigame.MG-23.status.gate', state: st };
    if (st === 'ok') return { key: 'minigame.MG-23.status.ok', state: st };
    if (st === 'torn') return { key: 'minigame.MG-23.status.torn', state: st };
    if (st === 'late') return { key: 'minigame.MG-23.status.late', state: st };
    return { key: 'minigame.MG-23.status.missed', state: st };
  }

  private drawStrip() {
    const g = this.g;
    const { ctx, pal } = g;
    const { key, state, args } = this.statusKey();
    const col = this.stateColor(state);
    const r = this.strip;
    g.roundRect(r, 10);
    ctx.fillStyle = withAlpha(col, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.setLineDash(STATE_STYLE[state].border === 'dashed' ? [5, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const stage = this.env.t(`minigame.MG-23.stage.${STAGES[this.sim.config.stage]!}`);
    const backup = this.sim.config.backup > 0 ? ` · ${this.env.t('minigame.MG-23.backup')}` : '';
    const text = `${stage}${backup} — ${this.env.t(key, args)}`;
    const size = g.fit(text, r.w - 56, 14 * Math.min(g.u, 1.3), 800, false);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = pal.text;
    ctx.fillText(text, r.x + r.w / 2 + 12, r.y + r.h / 2 + 1);
    g.glyph(STATE_STYLE[state].glyph, r.x + r.w / 2 - tw / 2 - 4, r.y + r.h / 2, size, col);
    ctx.textBaseline = 'alphabetic';
  }

  // ───────────── the descent scene ─────────────

  private drawScene(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.scene;
    const sim = this.sim;
    ctx.save();
    g.roundRect(r, 12);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, pal.bg0);
    sky.addColorStop(0.7, pal.bg2);
    sky.addColorStop(1, withAlpha(pal.accent, 0.35));
    ctx.fillStyle = sky;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // altitude tape: ticks every 1,000 m that slide with the descent
    const alt = Math.max(0, sim.altitudeM);
    const pxPerM = r.h / 2600;
    ctx.strokeStyle = withAlpha(pal.lineStrong, 0.7);
    ctx.fillStyle = pal.faint;
    ctx.lineWidth = 1;
    ctx.font = g.font(10 * Math.min(g.u, 1.3), 600, true);
    const tapeX = g.rtl ? r.x + r.w - 10 : r.x + 10;
    ctx.textAlign = g.rtl ? 'right' : 'left';
    const capY = r.y + r.h * 0.46;
    const first = Math.floor((alt - (r.h - (capY - r.y)) / pxPerM) / 500) * 500;
    for (let a = first; a <= alt + (capY - r.y) / pxPerM; a += 500) {
      if (a < 0) continue;
      const y = capY + (alt - a) * pxPerM;
      if (y < r.y || y > r.y + r.h) continue;
      const major = a % 1000 === 0;
      ctx.beginPath();
      ctx.moveTo(tapeX, y);
      ctx.lineTo(tapeX + (g.rtl ? -1 : 1) * (major ? 14 : 8), y);
      ctx.stroke();
      if (major) ctx.fillText(g.ltr(`${fmt(a, 0)} m`), tapeX + (g.rtl ? -1 : 1) * 20, y + 3);
    }
    // sea rising to meet the capsule
    const seaY = capY + alt * pxPerM + 36;
    if (seaY < r.y + r.h) {
      const sea = ctx.createLinearGradient(0, seaY, 0, r.y + r.h);
      sea.addColorStop(0, '#1d7a9b');
      sea.addColorStop(1, '#0b3550');
      ctx.fillStyle = sea;
      ctx.fillRect(r.x, seaY, r.w, r.y + r.h - seaY);
      ctx.strokeStyle = withAlpha(pal.accentStrong, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, seaY);
      ctx.lineTo(r.x + r.w, seaY);
      ctx.stroke();
    }
    // cloud streaks for the sense of speed
    if (!this.env.reducedMotion) {
      ctx.strokeStyle = withAlpha(pal.text, 0.07);
      ctx.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        const y = r.y + ((((i * 71 + alt * 0.4 * sim.speedMS * 0.01) % r.h) + r.h) % r.h);
        const x = r.x + ((i * 53) % 60) * 0.01 * r.w + 30;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 40 + (i % 3) * 18, y);
        ctx.stroke();
      }
    }
    // capsule and canopies
    const cx = r.x + r.w * 0.55;
    const cs = clamp(r.h * 0.09, 12, 22);
    this.drawCanopies(cx, capY, cs, f.timeMs);
    this.drawCapsule(cx, capY, cs);
    ctx.restore();
    g.roundRect(r, 12);
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.line;
    ctx.stroke();
  }

  private drawCanopies(cx: number, capY: number, s: number, timeMs: number) {
    const sim = this.sim;
    const { ctx, pal } = this.g;
    const sway = this.env.reducedMotion ? 0 : Math.sin(timeMs / 700) * 2;
    // Rows from the capsule upwards: mains (3 big), pilots (3 small), drogues (2), covers (3 small).
    const rows = [
      { stage: 3, r: s * 1.5, y: -s * 5.2, color: '#f08a4b' },
      { stage: 2, r: s * 0.6, y: -s * 4.2, color: '#ffce83' },
      { stage: 1, r: s * 0.95, y: -s * 3.0, color: '#9fb2bd' },
      { stage: 0, r: s * 0.5, y: -s * 2.1, color: '#e8eef0' },
    ];
    for (const row of rows) {
      const st = sim.stageDeployS(row.stage);
      if (st === null) continue;
      const n = CANOPIES[row.stage]!;
      const torn = sim.stageState(row.stage) === 'torn';
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * row.r * 2.1 + sway * (1 + i * 0.3);
        const x = cx + dx;
        const y = capY + row.y;
        // shroud lines
        ctx.strokeStyle = withAlpha(pal.text, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - row.r * 0.9, y);
        ctx.lineTo(cx, capY - s * 0.5);
        ctx.moveTo(x + row.r * 0.9, y);
        ctx.lineTo(cx, capY - s * 0.5);
        ctx.stroke();
        // dome
        ctx.beginPath();
        ctx.ellipse(x, y, row.r, row.r * 0.62, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = torn ? withAlpha(pal.bad, 0.55) : row.color;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = torn ? pal.bad : pal.bg0;
        if (torn) ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawCapsule(cx: number, cy: number, s: number) {
    const { ctx, pal } = this.g;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, -s * 0.7);
    ctx.lineTo(s * 0.35, -s * 0.7);
    ctx.lineTo(s * 0.62, s * 0.35);
    ctx.lineTo(-s * 0.62, s * 0.35);
    ctx.closePath();
    const body = ctx.createLinearGradient(-s, 0, s, 0);
    body.addColorStop(0, '#9fb2bd');
    body.addColorStop(0.5, '#f4f8f9');
    body.addColorStop(1, '#9fb2bd');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.62, s * 0.35);
    ctx.quadraticCurveTo(0, s * 0.72, s * 0.62, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#3a2a1f';
    ctx.fill();
    ctx.restore();
  }

  // ───────────── gate timeline ─────────────

  private drawTimeline() {
    const g = this.g;
    const { ctx, pal } = g;
    const r = this.timeline;
    const sim = this.sim;
    const dur = sim.descent.durationS;
    const xOf = (tS: number) => r.x + (g.rtl ? 1 - tS / dur : tS / dur) * r.w;
    ctx.fillStyle = pal.bg1;
    g.roundRect(r, 6);
    ctx.fill();
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    const half = sim.config.gateHalfS;
    for (let k = 0; k < 4; k++) {
      const c = sim.descent.centreS[k]!;
      const own = k === sim.config.stage;
      const x0 = Math.min(xOf(c - half), xOf(c + half));
      const w = Math.abs(xOf(c + half) - xOf(c - half));
      const lit = sim.timeS >= c - half && sim.timeS <= c + half;
      ctx.fillStyle = own ? withAlpha(lit ? pal.accentStrong : pal.accent, lit ? 0.9 : 0.5) : withAlpha(pal.lineStrong, 0.5);
      ctx.fillRect(x0, r.y + 3, w, r.h - 6);
      if (own) {
        // the middle 40 % (perfect): a bright centre
        const pw = w * sim.config.perfectFraction;
        ctx.fillStyle = withAlpha(pal.text, 0.85);
        ctx.fillRect(xOf(c) - pw / 2, r.y + r.h / 2 - 1.5, pw, 3);
        ctx.strokeStyle = pal.accentStrong;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0, r.y + 3, w, r.h - 6);
      }
    }
    if (sim.deployS !== null) {
      const x = xOf(sim.deployS);
      ctx.fillStyle = this.stateColor(sim.stageState(sim.config.stage));
      ctx.beginPath();
      ctx.moveTo(x, r.y + r.h - 1);
      ctx.lineTo(x - 5, r.y + r.h + 5);
      ctx.lineTo(x + 5, r.y + r.h + 5);
      ctx.closePath();
      ctx.fill();
    }
    // playhead
    const px = xOf(sim.timeS);
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, r.y - 2);
    ctx.lineTo(px, r.y + r.h + 2);
    ctx.stroke();
  }

  // ───────────── stage cards ─────────────

  private drawCards() {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const gap = 6;
    const w = (this.cards.w - gap * 3) / 4;
    for (let i = 0; i < 4; i++) {
      const k = g.rtl ? 3 - i : i;
      const r: Rect = { x: this.cards.x + i * (w + gap), y: this.cards.y, w, h: this.cards.h };
      const st = sim.stageState(k);
      const style = STATE_STYLE[st];
      const col = this.stateColor(st);
      const own = k === sim.config.stage;
      g.panel(r, own ? pal.accentStrong : st === 'wait' ? null : col, own && st === 'wait' ? 'solid' : style.border);
      if (own) {
        ctx.fillStyle = withAlpha(pal.accent, 0.1);
        g.roundRect(r, 10);
        ctx.fill();
      }
      const small = (this.compact ? 9 : 11) * Math.min(g.u, 1.3);
      const mid = r.x + r.w / 2;
      ctx.textAlign = 'center';
      g.fit(this.env.t(`minigame.MG-23.stage.${STAGES[k]!}`), w - 8, small, 800, false);
      ctx.fillStyle = own ? pal.accentStrong : pal.text;
      ctx.fillText(this.env.t(`minigame.MG-23.stage.${STAGES[k]!}`), mid, r.y + small + 6);
      // canopy count icon: little domes
      const n = CANOPIES[k]!;
      const dr = Math.min(7, (w - 14) / (n * 2.4));
      for (let j = 0; j < n; j++) {
        const x = mid + (j - (n - 1) / 2) * dr * 2.4;
        const y = r.y + r.h * 0.55;
        ctx.beginPath();
        ctx.ellipse(x, y, dr, dr * 0.65, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = st === 'ok' ? pal.good : st === 'torn' ? withAlpha(pal.bad, 0.6) : withAlpha(pal.dim, 0.5);
        ctx.fill();
      }
      if (!this.compact) {
        const stateText = this.env.t(`minigame.MG-23.card.${st}`);
        g.fit(stateText, w - 22, 10 * Math.min(g.u, 1.3), 700, false);
        ctx.fillStyle = col;
        ctx.fillText(stateText, mid + 6, r.y + r.h - 8);
        g.glyph(style.glyph, mid - ctx.measureText(stateText).width / 2 - 4, r.y + r.h - 12, 9, col);
      }
    }
  }

  private drawButton(f: Frame) {
    const g = this.g;
    const { ctx, pal } = g;
    const sim = this.sim;
    const b = this.button;
    const gateOpen = sim.gateOpen && sim.deployS === null;
    const done = sim.deployS !== null;
    const col = done ? pal.dim : gateOpen ? pal.accentStrong : pal.accent;
    g.roundRect(b, 14);
    ctx.fillStyle = done ? pal.bg2 : gateOpen ? withAlpha(pal.accent, 0.9) : withAlpha(pal.accent, 0.28);
    ctx.fill();
    ctx.lineWidth = gateOpen ? 3 : 1.5;
    ctx.strokeStyle = col;
    ctx.stroke();
    const label = this.env.t(sim.config.wholeField ? 'minigame.MG-23.button.anywhere' : 'minigame.MG-23.button.deploy');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.fit(label, b.w - 24, 20 * Math.min(g.u, 1.25), 800, false);
    ctx.fillStyle = done ? pal.faint : gateOpen ? pal.bg0 : pal.text;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    void f;
  }
}
