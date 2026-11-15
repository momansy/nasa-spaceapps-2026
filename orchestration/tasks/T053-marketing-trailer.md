# T053 — Marketing trailer: a fast-paced, great-looking video of the game

**Worker:** a media worker with Higgsfield (`momansy`) · **Owns:** `submission/trailer/` (create: videos, edit scripts, README), new entries in `assets/media/CREDITS.md`, `assets/media/GENERATION_LOG.json` and `submission/AI_DISCLOSURE.md`, `orchestration/evidence/T053/`

The demo videos in `submission/video/` explain the game calmly. We also need a **trailer**: 45–60 s,
fast cuts on the beat, cinematic, the kind of video that makes a student want to play, for social media,
the submission page and the start of the pitch. It must look excellent and stay honest.

**Deadline: final files merged by 12:00 UTC.** Have a complete first cut on your branch by 11:00.

## Material (real game first)

- **In-engine Unity clips** from T054 (`cyrex04`) in `assets/media/trailer-captures/` (1080p60), merged by
  about 10:45. Until then, start the edit with the other material and swap them in when they land.
- **Phone footage**: record the real phone client (Playwright, 3 phone-sized contexts, device frame
  overlay) on the live site <https://missionforge-spaceapps.onrender.com/play/> or locally: join, part
  card swipe and vote, the GO/NO-GO poll, two or three of the most visual minigames, the debrief. The
  recording scripts in `submission/video/scripts/` show how; reuse them.
- **Key art and briefing cinematic**: `assets/media/key-art/`, `assets/media/cinematics/`, the style frames
  in `assets/media/style/frames/`.
- **Higgsfield** (use the available balance): 4–6 short cinematic shots that the game cannot render (for
  example a launch at dawn, a satellite unfolding solar panels over Earth, mission control lit by screens,
  students around one big screen holding phones), matched to the style frames. They are mood shots between
  gameplay, never presented as gameplay.

## Steps, in order

1. Plan the cut in `submission/trailer/README.md`: a beat sheet of about 25–35 shots: hook (0–5 s, the
   most striking shot) → "one big screen, every phone a mission-control console" → build: choose parts,
   trade-offs flash on screen (MASS, POWER, BUDGET, ORBIT, COMMS as kinetic type) → vote → launch →
   minigames montage (quick cuts) → orbit → debrief score → title card "MissionForge" → "Play free in your
   browser" with the URL and a QR code → small credits line. Text on screen short (2–4 words per card).
2. Music: one royalty-free track you are licensed to use with a clear licence (record source, licence and
   URL in `assets/media/CREDITS.md`), or a track generated with a tool whose terms allow it (record it in
   `AI_DISCLOSURE.md`). Cut on the beat. No copyrighted music, no voices of real people.
3. Generate the Higgsfield shots; log each prompt and output in `GENERATION_LOG.json` and `CREDITS.md`.
4. Edit with a script (ffmpeg, or Remotion/HTML + Playwright frames as in `submission/video/scripts/`) so the
   trailer can be rebuilt: committed as `submission/trailer/scripts/`. Polish: colour-match the clips to the
   game palette, speed ramps and whip transitions, light grain/glow, motion type, consistent safe areas,
   audio fade-out. Every gameplay number shown must come from `data/`.
5. Outputs: `submission/trailer/missionforge-trailer-16x9.mp4` (1920×1080, 45–60 s, H.264 + AAC, under 30 MB)
   and `missionforge-trailer-9x16.mp4` (1080×1920 vertical re-cut, 20–30 s, under 20 MB). Small corner label
   "AI-generated" on Higgsfield shots, and an end line "Gameplay captured from MissionForge. Some
   cinematic shots AI-generated. Not affiliated with NASA."
6. Review: extract a frame every 2 s into a contact sheet in `orchestration/evidence/T053/`, watch both cuts
   fully, check sync with the music, no clipped text, no "Reconnecting" or debug UI, no placeholder screens.
   Have a subagent review the cut against this list and fix what it finds.

## Acceptance

Both trailer cuts merged by 12:00 UTC: fast-paced, cut on the beat, real gameplay as the majority of
shots, AI shots labelled, licensed music credited, rebuildable from the committed scripts, contact sheet reviewed.
