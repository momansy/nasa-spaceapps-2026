// The living background behind every screen: a key-art scene chosen per screen, a slow star
// field and an Earth-limb glow (styles in theme/base.css, `.bd`). Decorative only. Each scene is
// one pre-baked WebP referenced from CSS, so the browser fetches only the current scene's file.
import type { Screen } from '../state/types';

export type Scene = 'sat' | 'limb' | 'bay' | 'ascent' | 'orbit';

export const SCENE_OF: Record<Screen, Scene> = {
  join: 'sat',
  lobby: 'bay',
  role: 'bay',
  build: 'limb',
  vote: 'limb',
  poll: 'ascent',
  console: 'ascent',
  minigame: 'limb',
  debrief: 'orbit',
};

/** `still`: the first scene after load is shown at once instead of fading in. */
export function Backdrop({ scene, still }: { scene: Scene; still?: boolean }) {
  return (
    <div className="bd" data-scene={scene} data-still={still ? '' : undefined} aria-hidden="true">
      {/* Keyed so a scene change fades the new art in. */}
      <div className="bd__art" key={scene} />
      <div className="bd__glow" />
      <div className="bd__twinkle" />
    </div>
  );
}
