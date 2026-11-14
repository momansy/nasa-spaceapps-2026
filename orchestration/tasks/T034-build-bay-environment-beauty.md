# T034 — Build Bay environment and camera beauty pass

Every visual task must meet `orchestration/VISUAL_TARGET.md` (rubric 4/5 or better).

**Worker:** `yousuf-amek` (Unity MCP, Blender MCP), right after T031 · **Owns:** `unity/MissionForge/Assets/MissionForge/Art/Environment/` (including `LaunchPad/`), the 3D content of `unity/MissionForge/Assets/MissionForge/Scenes/MF_BuildBay.unity` (not its UI), `unity/MissionForge/Assets/MissionForge/Screens/BuildBay/Cameras/` (create), `orchestration/evidence/T034/`

Uses T031's URP volume profiles, lighting rigs and `MF_KitLit` material importer; does not
change `ProjectSettings/` or `Packages/`. Does not touch the Build Bay UI panels (T031 owns
the design system) or the kit models themselves (T032/T033 replace them in place by ID).

## Why

The Build Bay (T015) works, but its 3D scene is far below the reference frame
`assets/media/style/frames/02-build-bay.png`: untextured grey blocks, a black void for the
ground, a flat gradient sky, the vehicle tiny in frame, no atmosphere. This is the screen
judges look at longest.

## Steps, in order

1. **Look-dev baseline.** Capture the current scene at 1920x1080 from the default camera
   and next to frame 02 (side by side) for the before/after record.
2. **Sky and light.** Dusk HDRI from Poly Haven (CC0; record in `THIRD_PARTY.md`) as sky
   and image-based light, warm low sun matching frame 02, cool fill, reflection probes,
   light fog/haze for depth; apply T031's post-processing (ACES, bloom on lights only,
   SSAO, grading).
3. **Ground and distance.** Textured concrete pad apron with markings and wear, flame
   trench, gravel/scrub terrain, a distant coastline or ocean plane with sun glint,
   distant lightning towers and service buildings as silhouettes; nothing reads as a
   black void.
4. **Launch pad hero assets.** Replace the block tower, crane and hall with the T017 world
   models (`assets/blender/export/fbx/` and the pad models listed in its manifest) using
   T032's PBR library where available; add umbilical arms, work-platform lights,
   floodlights with volumetric-looking cones (cheap cards are fine), and small human
   figures for scale.
5. **Camera direction.** A Cinemachine rig: a framing that keeps the vehicle at roughly
   45–60 % of screen height in the space between the left and right UI panels at every
   stage of assembly (dolly/zoom as the stack grows), a slow idle orbit, punch-ins when a
   part lands, and the compare/exploded/scale views re-framed to match. Respect reduced
   motion.
6. **Assembly feel.** Crane hook lowers each part, sparks and work lights during
   integration, subtle steam at the cryogenic vent once tanks are on.
7. **Performance:** WebGL build holds at least 45 fps at 1080p on a mid-range laptop with
   the Build Bay full (state the measurement and machine); provide a quality toggle.
8. **Evidence** in `orchestration/evidence/T034/`: before/after pairs, the complete-vehicle
   beauty shot next to frame 02, three assembly-stage shots with UI on, the rubric scores.

## Acceptance

Side by side with frame 02, the scene reads as the same world: lit pad at dusk, believable
materials, a vehicle that dominates the frame. Rubric 4/5 or better on every 3D item of
`VISUAL_TARGET.md`. EditMode tests stay green; no UI regressions.
