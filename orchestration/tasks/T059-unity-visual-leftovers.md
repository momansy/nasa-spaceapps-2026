# T059 — Unity visual leftovers from T034 and T032 (highest-impact fixes only) + host rebuild

**Worker:** a Unity worker (`cyrex04`, when its usage resets at about 12:40 UTC) · **Owns:** `unity/MissionForge/Assets/MissionForge/Screens/BuildBay/` environment, lighting and volume assets, `unity/MissionForge/Assets/MissionForge/Art/` (environment, lighting, engine materials), `docs/play/host/` (rebuild), `orchestration/evidence/T059/`

Re-issue of two parked items from `yousuf-amek`: #113 (T034 Build Bay environment, merged with rubric 3s) and
#151 (T032 rework 2, engine items M2, M3, M5–M8, M10 left as known gaps, see PR #138). The full findings are in
`orchestration/evidence/T034/RUBRIC.md` and `orchestration/VISUAL_TARGET.md`; the reference is
`assets/media/style/frames/02-build-bay.png`. Time is short: do the fixes below **in this order**, commit and
push after each one, and stop when the orchestrator says so.

1. **Lighting and grade (M8, M10):** cool the warm mauve mid-edges at votes 8–10 to the navy of frame 02,
   lift the crushed bottom corners (no pixel below about #061F33 in the corners), shrink the sun bloom and
   clipped whites, add a soft cloud layer to the sky. Volume/profile changes only.
2. **Wet ground (M2):** make the apron read wet: a smoothness/reflection-probe change so lamp heads and the
   vehicle mirror faintly in the slab, like frame 02.
3. **Soot and heat staining (M7):** a soot/heat decal or vertex-colour pass on the deflector, throat and trench mouth.
4. **Engine bells (M5):** make the bells read at the hero framing: metallic, heat-tinted nozzle material
   (blue-gold gradient near the throat), visible at votes 6–10.
5. Rebuild WebGL to `docs/play/host/` with `MissionForge.Build.WebGL` (as T055 did) and verify on the local
   hosted server (`npm --prefix server run start:hosted`, `http://localhost:10000/play/`): Build Bay at votes
   1, 6, 10, 22; before/after pairs against frame 02 into `orchestration/evidence/T059/`; WebGL fps not lower
   than before; EditMode tests green.

Do not change UI, game logic or the pre-flight/flight/debrief screens. Open the PR titled
"T059: Build Bay and engine visual leftovers + host rebuild" after step 1 and keep pushing; mark which steps are done.

Acceptance: each completed step visibly closer to frame 02 in before/after pairs; rebuilt WebGL committed;
tests green. Merging depends on the submission deadline: the orchestrator decides.
