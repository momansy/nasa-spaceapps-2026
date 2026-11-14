// 3D part viewer (design 14.2 screen 4, 14.3 "[3D model, rotatable]").
//
// It shows `/models/<part_id>.glb` with three.js when the file and WebGL exist; three.js is a
// separate chunk fetched only then. Otherwise, and always until the model has loaded, it shows
// a canvas-2D wireframe of the part built from the catalog stats. Both renderers share one
// view (yaw, pitch, zoom) and the same drag / pinch / wheel / keyboard controls.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { getPart } from '../data/catalog';
import { fmt } from '../data/format';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { hasWebGL, loadModel } from './models';
import { buildWireModel } from './shapes';
import type { ThreeScene } from './threeScene';
import { drawWire, type View, type WireColors } from './wireframe';
import './viewer.css';

export interface PartViewerProps {
  /** Catalog part id; the model is /models/<partId>.glb. */
  partId: string;
  /** 'card' = compact header of a Part Card; 'full' = fills its container. */
  size?: 'card' | 'full';
  /**
   * False draws one still frame and runs no animation loop and no WebGL context (cards that
   * are off screen in a carousel). Default true.
   */
  active?: boolean;
  /** Card size only: shows the expand button and calls this when it (or the stage) is tapped. */
  onExpand?: () => void;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.6;
const PITCH_MAX = 1.25;
const AUTO_SPEED = 0.32; // rad/s
const IDLE_AFTER_INPUT_MS = 2600;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function isReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced';
}

function readColors(el: HTMLElement): WireColors {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    line: v('--accent', '#55c5cd'),
    bright: v('--accent-strong', '#8fe0e6'),
    dim: v('--accent', '#55c5cd'),
    text: v('--text', '#e8eef0'),
  };
}

export function PartViewer({ partId, size = 'card', active = true, onExpand }: PartViewerProps) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webgl, setWebgl] = useState(false);
  // Read through a ref so a new callback identity never rebuilds the viewer.
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;

  const part = getPart(partId);
  const name = part ? t(part.name_key) : partId;
  const north = t('ui.viewer.north');
  const south = t('ui.viewer.south');
  const model = useMemo(
    () => buildWireModel(partId, { north, south, formatDeg: (deg) => `${fmt(deg, 1)}°` }),
    [partId, north, south],
  );

  // Imperative handle shared by the effect and the buttons.
  const api = useRef<{ zoomBy: (f: number) => void; rotateBy: (dy: number, dp: number) => void; reset: () => void } | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const view: View = { yaw: model.yaw, pitch: model.pitch, zoom: 1 };
    let colors = readColors(stage);
    let contrast = document.documentElement.dataset.contrast;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scene: ThreeScene | null = null;
    let raf = 0;
    let lastT = 0;
    let lastDraw = 0;
    let dirty = true;
    let idleUntil = 0;
    let disposed = false;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    let moved = false;

    const draw = (timeMs: number) => {
      if (width === 0 || height === 0) return;
      const c = document.documentElement.dataset.contrast;
      if (c !== contrast) {
        contrast = c;
        colors = readColors(stage);
      }
      if (scene) {
        scene.draw(view);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pulse = active && !isReducedMotion() ? (timeMs % 1700) / 1700 : 0;
      drawWire(ctx, width, height, model, view, colors, pulse);
    };

    const frame = (timeMs: number) => {
      raf = 0;
      if (disposed) return;
      const dt = lastT ? Math.min(0.1, (timeMs - lastT) / 1000) : 0;
      lastT = timeMs;
      const auto = active && !isReducedMotion() && pointers.size === 0;
      if (auto && timeMs >= idleUntil) {
        view.yaw += AUTO_SPEED * dt;
        dirty = true;
      }
      // While only idling, 30 frames per second are plenty (old phones, battery).
      if (dirty && (pointers.size > 0 || timeMs - lastDraw >= 30)) {
        draw(timeMs);
        lastDraw = timeMs;
        dirty = false;
      }
      if (auto || dirty || pointers.size > 0) schedule();
      else lastT = 0;
    };
    const schedule = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(frame);
    };
    const invalidate = () => {
      dirty = true;
      schedule();
    };
    const touched = () => {
      idleUntil = performance.now() + IDLE_AFTER_INPUT_MS;
      invalidate();
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scene?.resize(width, height, dpr);
      // Draw at once so a resize never shows an empty frame.
      draw(performance.now());
      invalidate();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    // Restart the idle spin when the motion preference is switched back on.
    const mo = new MutationObserver(invalidate);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-contrast'] });

    api.current = {
      zoomBy(f) {
        view.zoom = clamp(view.zoom * f, ZOOM_MIN, ZOOM_MAX);
        touched();
      },
      rotateBy(dy, dp) {
        view.yaw += dy;
        view.pitch = clamp(view.pitch + dp, -PITCH_MAX, PITCH_MAX);
        touched();
      },
      reset() {
        view.yaw = model.yaw;
        view.pitch = model.pitch;
        view.zoom = 1;
        touched();
      },
    };

    // ───────────── input ─────────────
    // In a Part Card the stage sits inside a swipeable, scrollable card: touches are left to
    // the page there (a tap expands); the full viewer takes every gesture.
    const takesTouch = size === 'full';
    const onDown = (e: PointerEvent) => {
      if (!active) return;
      if (e.pointerType === 'touch' && !takesTouch) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
      stage.dataset.grabbing = '1';
      touched();
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchDist > 0 && d > 0) view.zoom = clamp(view.zoom * (d / pinchDist), ZOOM_MIN, ZOOM_MAX);
        pinchDist = d;
      } else {
        view.yaw += dx * 0.011;
        view.pitch = clamp(view.pitch + dy * 0.011, -PITCH_MAX, PITCH_MAX);
      }
      touched();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      pinchDist = 0;
      if (pointers.size === 0) delete stage.dataset.grabbing;
      touched();
    };
    const onClick = () => {
      // A tap or click without a drag on the card opens the full viewer.
      if (size === 'card' && !moved) onExpandRef.current?.();
      moved = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!takesTouch || !active) return;
      e.preventDefault();
      view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
      touched();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 0.16;
      switch (e.key) {
        case 'ArrowLeft':
          api.current?.rotateBy(-step, 0);
          break;
        case 'ArrowRight':
          api.current?.rotateBy(step, 0);
          break;
        case 'ArrowUp':
          api.current?.rotateBy(0, -step);
          break;
        case 'ArrowDown':
          api.current?.rotateBy(0, step);
          break;
        case '+':
        case '=':
          api.current?.zoomBy(1.2);
          break;
        case '-':
        case '_':
          api.current?.zoomBy(1 / 1.2);
          break;
        case '0':
        case 'Home':
          api.current?.reset();
          break;
        case 'Enter':
          if (size === 'card' && onExpandRef.current) onExpandRef.current();
          else return;
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('click', onClick);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('keydown', onKey);

    // ───────────── GLB model, when there is one ─────────────
    if (active) {
      void loadModel(partId).then(async (bytes) => {
        if (disposed || !bytes || !hasWebGL()) return;
        try {
          const { createThreeScene } = await import('./threeScene');
          const made = await createThreeScene(bytes);
          if (disposed) {
            made.destroy();
            return;
          }
          scene = made;
          made.canvas.className = 'viewer__gl';
          made.canvas.setAttribute('aria-hidden', 'true');
          stage.prepend(made.canvas);
          made.resize(width, height, dpr);
          setWebgl(true);
          invalidate();
        } catch {
          /* unreadable model or no GPU: the wireframe stays */
        }
      });
    }

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('click', onClick);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKey);
      delete stage.dataset.grabbing;
      api.current = null;
      scene?.destroy();
      scene = null;
      setWebgl(false);
    };
  }, [partId, model, active, size]);

  const stop = (fn: () => void) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className={`viewer viewer--${size} ${webgl ? 'viewer--gl' : 'viewer--wire'}`} data-testid="part-viewer">
      <div
        ref={stageRef}
        className="viewer__stage"
        role="application"
        tabIndex={active ? 0 : -1}
        aria-label={t('ui.viewer.label', { name })}
        aria-describedby={`viewer-hint-${partId}`}
      >
        <canvas ref={canvasRef} className="viewer__wire" aria-hidden="true" />
      </div>
      <span id={`viewer-hint-${partId}`} className="sr-only">
        {t('ui.viewer.keys')}
      </span>
      {!webgl && (
        <span className="viewer__tag" aria-hidden="true">
          <Icon name="cube" size="0.9em" />
          {t('ui.viewer.schematic')}
        </span>
      )}
      {size === 'full' && <span className="viewer__hint">{t('ui.viewer.hint')}</span>}
      <div className="viewer__tools">
        {size === 'full' ? (
          <>
            <button type="button" className="viewer__btn" onClick={stop(() => api.current?.zoomBy(1 / 1.25))} aria-label={t('ui.viewer.zoom_out')}>
              <Icon name="minus" />
            </button>
            <button type="button" className="viewer__btn" onClick={stop(() => api.current?.reset())} aria-label={t('ui.viewer.reset')}>
              <Icon name="rotate" />
            </button>
            <button type="button" className="viewer__btn" onClick={stop(() => api.current?.zoomBy(1.25))} aria-label={t('ui.viewer.zoom_in')}>
              <Icon name="plus" />
            </button>
          </>
        ) : (
          onExpand && (
            <button type="button" className="viewer__btn" onClick={stop(onExpand)} aria-label={t('ui.viewer.expand', { name })} data-testid="viewer-expand">
              <Icon name="expand" />
            </button>
          )
        )}
      </div>
    </div>
  );
}
