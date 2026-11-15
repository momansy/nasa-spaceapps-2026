# T056 — Higgsfield cinematic shots for the marketing trailer

**Worker:** a media worker with Higgsfield (`momansy`) · **Owns:** `assets/media/trailer-ai/` (create), new entries in `assets/media/CREDITS.md`, `assets/media/GENERATION_LOG.json`, `submission/AI_DISCLOSURE.md` · **Deadline: PR open by 11:15 UTC** (the trailer edit, T053, is being cut on the orchestrator device and will take whatever is merged by 11:20).

The trailer (T053) needs 4–6 short cinematic mood shots that the game itself cannot render. Use the
available Higgsfield balance.

1. Look at the style reference: `assets/media/style/frames/`, `assets/media/key-art/missionforge-16x9.png`, and
   the game footage in `assets/media/trailer-captures/` (palette: deep space navy, teal UI accents, warm
   sunlight orange). Match it.
2. Generate 4–6 video shots, 16:9, 3–5 s each, 1080p if available, no text, no logos, no real people's
   likeness, no NASA insignia: (a) a rocket lifting off at dusk from a coastal pad, (b) a small Earth-observation
   satellite unfolding solar panels over Earth, (c) a fairing separating in the upper atmosphere, (d) a
   satellite gliding over a city-lit night side of Earth, (e) a teenage team around a large screen in a dark
   room lit by phones (faces not in focus), (f) stage separation with engine glow. Pick the best 4–6.
3. Save as `assets/media/trailer-ai/NN-short-name.mp4` (H.264, no audio, under 8 MB each) plus
   `README.md` (prompt, model, seed/settings, date for each). Log every generation in
   `GENERATION_LOG.json` and `CREDITS.md`; add one line to `submission/AI_DISCLOSURE.md` naming these shots.
4. Open the PR titled "T056: Higgsfield trailer shots" as soon as 4 good shots exist. Do not edit the trailer.

Acceptance: 4–6 on-style shots, logged and disclosed, PR open by 11:15 UTC.
