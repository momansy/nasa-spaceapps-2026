// T043: axe-core on every screen of the scripted mock session (`?mock=1`), in English and Arabic,
// in default and high-contrast modes, and at 200 % text. Writes one JSON report per configuration
// to orchestration/evidence/T043/axe-<phase>/ (phase = A11Y_PHASE, default "run") and fails on any
// serious or critical violation. Run with `npx playwright test e2e/a11y`.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PHASE = process.env.A11Y_PHASE ?? 'run';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../orchestration/evidence/T043', `axe-${PHASE}`);
mkdirSync(OUT, { recursive: true });

interface Config {
  id: string;
  lang: 'en' | 'ar';
  highContrast: boolean;
  textScalePct: number;
}

const CONFIGS: Config[] = [
  { id: 'en-default', lang: 'en', highContrast: false, textScalePct: 100 },
  { id: 'en-contrast', lang: 'en', highContrast: true, textScalePct: 100 },
  { id: 'en-text200', lang: 'en', highContrast: false, textScalePct: 200 },
  { id: 'ar-default', lang: 'ar', highContrast: false, textScalePct: 100 },
  { id: 'ar-contrast', lang: 'ar', highContrast: true, textScalePct: 100 },
  { id: 'ar-text200', lang: 'ar', highContrast: false, textScalePct: 200 },
];

interface Finding {
  screen: string;
  rule: string;
  impact: string;
  help: string;
  nodes: Array<{ target: string; summary: string }>;
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const cfg of CONFIGS) {
  test(`axe: every screen of the mock session (${cfg.id})`, async ({ page }) => {
    test.setTimeout(12 * 60_000);
    const findings: Finding[] = [];
    const screens: string[] = [];
    const smallTargets: Array<{ screen: string; target: string; w: number; h: number }> = [];
    const contrastIncomplete: Array<{ screen: string; count: number }> = [];
    const contrastSamples: ContrastSample[] = [];

    async function audit(name: string) {
      await page.waitForTimeout(350);
      // Let enter animations finish (axe would otherwise sample a half-faded colour); animations
      // that loop forever are left running.
      await page.evaluate(() =>
        Promise.race([
          Promise.allSettled(
            document
              .getAnimations()
              .filter((a) => {
                const t = a.effect?.getTiming();
                return t != null && t.iterations !== Infinity && Number(t.duration) + Number(t.delay) < 1500;
              })
              .map((a) => a.finished),
          ),
          new Promise((r) => setTimeout(r, 900)),
        ]),
      );
      const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      screens.push(name);
      const inc = res.incomplete.find((v) => v.id === 'color-contrast');
      if (inc) {
        contrastIncomplete.push({ screen: name, count: inc.nodes.length });
        // axe cannot resolve gradient / image backgrounds ("incomplete"): measure the text colour
        // against the darkest and lightest surfaces it can sit on instead.
        const targets = inc.nodes.map((n) => n.target.join(' ')).slice(0, 60);
        for (const c of await sampleContrast(page, targets, cfg.highContrast)) contrastSamples.push({ screen: name, ...c });
      }
      for (const t of await smallInteractive(page)) smallTargets.push({ screen: name, ...t });
      for (const v of res.violations) {
        findings.push({
          screen: name,
          rule: v.id,
          impact: v.impact ?? 'minor',
          help: v.help,
          nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220) })),
        });
      }
    }

    /** A screen that is only up for a few seconds: audit it if we catch it, otherwise move on. */
    async function optional(testId: string, name: string, timeout = 15_000) {
      try {
        await expect(page.getByTestId(testId)).toBeVisible({ timeout });
      } catch {
        return;
      }
      await audit(name);
    }

    async function stage(s: string, timeout = 60_000) {
      await expect(page.locator(`[data-testid="screen-vote"][data-stage="${s}"]`)).toBeVisible({ timeout });
    }

    await page.addInitScript((c) => {
      localStorage.setItem('mf.prefs', JSON.stringify({ lang: c.lang, highContrast: c.highContrast, textScalePct: c.textScalePct }));
    }, cfg);
    await page.goto('/?mock=1&speed=1&room=KQXM');

    // Join.
    await expect(page.getByTestId('screen-join')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', cfg.lang);
    if (cfg.lang === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await audit('join');
    await page.getByTestId('join-nick').fill('Ada');
    await page.getByTestId('join-submit').click();

    await expect(page.getByTestId('screen-lobby')).toBeVisible();
    await expect(page.locator('.crew > li')).toHaveCount(5, { timeout: 15_000 });
    await audit('lobby');

    await expect(page.getByTestId('screen-role')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await audit('role-card');
    await page.getByTestId('role-ready').click();

    await expect(page.getByTestId('screen-build')).toBeVisible({ timeout: 15_000 });
    await audit('briefing');

    // Vote 1: reveal, predict, result, inspect, vote, result.
    await stage('REVEAL');
    await page.waitForTimeout(900);
    await audit('vote-reveal');
    await stage('PREDICT');
    await audit('predict');
    await page.getByTestId('predict-2').click();
    await expect(page.getByTestId('predict-result')).toBeVisible({ timeout: 20_000 });
    await audit('predict-result');

    await stage('INSPECT');
    await page.waitForTimeout(700);
    await audit('part-card');
    await page.locator('[data-testid="card-eng_kerolox_workhorse"] .stat__btn').nth(1).click();
    await audit('stat-explain');
    await page.locator('.dot').nth(2).click();
    await page.waitForTimeout(450);
    await audit('part-card-warnings');
    await page.locator('[data-testid="card-eng_hydrolox_high_efficiency"] [data-testid="viewer-expand"]').click();
    await expect(page.getByTestId('viewer-sheet')).toBeVisible();
    await page.waitForTimeout(600);
    await audit('part-viewer');
    await page.keyboard.press('Escape');

    await stage('VOTE');
    await page.locator('.dot').nth(3).click();
    await page.waitForTimeout(450);
    await page.getByTestId('cast').click();
    await page.waitForTimeout(600);
    await audit('vote-cast');
    await optional('stage-result', 'vote-result', 30_000);

    await optional('screen-build', 'build');

    // Quick vote.
    await expect(page.getByTestId('stage-quick')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('quick-TEST').click();
    await audit('quick-vote');

    // Vote 2: veto flash, veto confirm, pings.
    await stage('INSPECT');
    await expect(page.getByTestId('veto-flash')).toBeVisible({ timeout: 15_000 });
    await audit('veto-flash');
    await stage('VOTE');
    await page.locator('.dot').nth(0).click();
    await page.waitForTimeout(450);
    await page.getByTestId('veto').click();
    await audit('veto-confirm');
    await page.getByTestId('veto-confirm').click();
    await page.waitForTimeout(900);
    await page.locator('.dot').nth(2).click();
    await page.waitForTimeout(450);
    await page.getByTestId('open-pings').click();
    await expect(page.getByTestId('ping-sheet')).toBeVisible();
    await audit('pings');
    await page.getByTestId('ping-LIKE_THIS').click();
    await page.getByTestId('cast').click();

    // Vote 3: tie, trivia, pick.
    await stage('INSPECT', 30_000);
    await stage('VOTE');
    await page.locator('.dot').nth(0).click();
    await page.waitForTimeout(450);
    await page.getByTestId('cast').click();
    await expect(page.getByTestId('stage-trivia')).toBeVisible({ timeout: 30_000 });
    await audit('trivia');
    await page.getByTestId('trivia-1').click();
    await expect(page.getByTestId('stage-pick')).toBeVisible({ timeout: 10_000 });
    await audit('pick');
    await page.getByTestId('pick-fairing_small').click();
    // GO / NO-GO poll.
    await expect(page.getByTestId('screen-poll')).toBeVisible({ timeout: 30_000 });
    await audit('poll-waiting');
    await expect(page.getByTestId('poll-my-call')).toBeVisible({ timeout: 20_000 });
    await audit('poll-my-call');
    await page.getByTestId('poll-go').click();
    await expect(page.getByTestId('poll-result')).toBeVisible({ timeout: 30_000 });
    await audit('poll-result');

    // Flight console.
    await expect(page.getByTestId('console-screen')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    await audit('console-countdown');
    await expect(page.getByTestId('console-alert').first()).toBeVisible({ timeout: 30_000 });
    await audit('console-alert');
    await page.getByTestId('alert-callout').first().click();

    // Minigame: intro and result are audited; the play surface is reported separately (not ours to change).
    await expect(page.getByTestId('mg-intro')).toBeVisible({ timeout: 30_000 });
    await audit('minigame-intro');
    await expect(page.getByTestId('mg-play')).toBeVisible({ timeout: 15_000 });
    await audit('minigame-play');
    const box = await page.getByTestId('mg-play').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.waitForTimeout(2500);
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.42, { steps: 6 });
      await page.waitForTimeout(3000);
      await page.mouse.up();
    }
    await expect(page.getByTestId('mg-result')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    await audit('minigame-result');
    await page.getByTestId('mg-continue').click();

    await expect(page.getByTestId('console-blackout')).toBeVisible({ timeout: 30_000 });
    await audit('blackout');

    // Debrief, codex, settings.
    await expect(page.getByTestId('screen-debrief')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('debrief-awards')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1800);
    await audit('debrief');
    await page.getByTestId('open-codex').click();
    await expect(page.getByTestId('codex-sheet')).toBeVisible();
    await audit('codex');
    await page.getByTestId('codex-item').first().click();
    await audit('codex-entry');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-sheet')).toBeVisible();
    await audit('settings');

    writeReport(cfg, screens, findings, smallTargets, contrastIncomplete, contrastSamples);

    // Gate: no serious or critical violation outside the minigame play surface.
    const blocking = findings.filter((f) => (f.impact === 'serious' || f.impact === 'critical') && f.screen !== 'minigame-play');
    const small = smallTargets.filter((x) => x.screen !== 'minigame-play');
    expect(
      small.map((x) => `${x.screen}: ${x.target} ${x.w}x${x.h}`),
      'interactive elements smaller than 44 x 44 CSS px',
    ).toEqual([]);
    expect(
      blocking.map((f) => `${f.screen}: ${f.rule} (${f.impact}) ${f.nodes.map((n) => n.target).join(' | ')}`),
      'serious or critical axe violations',
    ).toEqual([]);
  });
}

interface ContrastSample {
  screen: string;
  target: string;
  text: string;
  fontPx: number;
  color: string;
  worstRatio: number;
  need: number;
  pass: boolean;
}

/**
 * For text axe could not resolve, computes the worst-case WCAG contrast of its colour against
 * the surfaces it sits on (opacity animations are not applied): the page
 * and card navy, and the glass panel over a bright cloud. High-contrast mode uses black and #1a1a1a.
 */
async function sampleContrast(page: Page, targets: string[], highContrast: boolean) {
  return page.evaluate(
    ({ targets, highContrast }) => {
      const surfaces = highContrast ? ['#000000', '#1a1a1a'] : ['#071522', '#173a55', '#2c3b49'];
      const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi! + 0.05) / (lo! + 0.05);
      };
      const out: Array<{ target: string; text: string; fontPx: number; color: string; worstRatio: number; need: number; pass: boolean }> = [];
      for (const target of targets) {
        let el: Element | null = null;
        try {
          el = document.querySelector(target);
        } catch {
          /* unparsable selector */
        }
        if (!el || !(el instanceof HTMLElement) || !el.textContent?.trim()) continue;
        const cs = getComputedStyle(el);
        const m = cs.color.match(/[\d.]+/g)?.map(Number);
        if (!m) continue;
        const alpha = m[3] ?? 1;
        const fontPx = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const need = fontPx >= 24 || (fontPx >= 18.66 && bold) ? 3 : 4.5;
        // Dark text (ink on a filled button or chip): measure it against that fill, which is the
        // first ancestor background that is a solid colour. Gradient fills have no solid colour:
        // they are covered by the ink-on-fill rows of the token table instead (contrast.mjs).
        let surfaceList = surfaces;
        if (lum([m[0]!, m[1]!, m[2]!]) < 0.1) {
          let solid: number[] | null = null;
          for (let e: HTMLElement | null = el; e && !solid; e = e.parentElement) {
            const style = getComputedStyle(e);
            if (style.backgroundImage !== 'none') break; // a gradient or image fill: no single colour
            const b = style.backgroundColor.match(/[\d.]+/g)?.map(Number);
            if (b && (b[3] ?? 1) >= 0.9 && b.slice(0, 3).some((v) => v > 0)) solid = b.slice(0, 3);
          }
          if (!solid) continue;
          surfaceList = [`#${solid.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`];
        }
        let worst = Infinity;
        for (const sf of surfaceList) {
          const bg = hex(sf);
          const fg = [0, 1, 2].map((i) => m[i]! * alpha + bg[i]! * (1 - alpha));
          worst = Math.min(worst, ratio(fg, bg));
        }
        out.push({ target, text: el.textContent.trim().slice(0, 40), fontPx, color: cs.color, worstRatio: Math.round(worst * 100) / 100, need, pass: worst >= need });
      }
      return out;
    },
    { targets, highContrast },
  );
}

/** Visible interactive elements under 44 x 44 CSS px (WCAG 2.5.5 / the brief), by selector. */
async function smallInteractive(page: Page) {
  return page.evaluate(() => {
    const out: Array<{ target: string; w: number; h: number }> = [];
    const sel = 'button, [role="button"], [role="tab"], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"], input:not([type="hidden"]), select, textarea, a[href], summary';
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], [inert]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Skip elements scrolled out of an overflow container's clip (they are not tappable now).
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        const id = el.getAttribute('data-testid');
        out.push({ target: id ? `[data-testid=${id}]` : `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
      }
    }
    return out;
  });
}

function writeReport(
  cfg: Config,
  screens: string[],
  findings: Finding[],
  smallTargets: Array<{ screen: string; target: string; w: number; h: number }>,
  contrastIncomplete: Array<{ screen: string; count: number }>,
  contrastSamples: ContrastSample[],
) {
  const byImpact: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const f of findings) byImpact[f.impact] = (byImpact[f.impact] ?? 0) + f.nodes.length;
  writeFileSync(join(OUT, `${cfg.id}.json`), JSON.stringify({ config: cfg, screens, nodesByImpact: byImpact, findings, smallTargets, contrastIncomplete, contrastSamples }, null, 2));
}

export type { Page };
