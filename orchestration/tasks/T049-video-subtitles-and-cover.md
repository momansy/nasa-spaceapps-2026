# T049 — Demo video subtitles (en, ar) and submission cover image

**Worker:** a coding/media worker (`mohammed-alainieh`) · **Owns:** `submission/video/subtitles/` (create), `submission/media/` (create), the "Subtitles" and "Cover image" sections of `submission/video/README.md`, `orchestration/evidence/T049/`

The two demo cuts are committed: `submission/video/missionforge-demo-2min.mp4` and
`missionforge-demo-30s.mp4` (1920×1080, on-screen captions, no narration). They were built from
`submission/video/scripts/scenes.mjs` (scene list, durations and every caption text) and `build.mjs`.
The submission checklist asks for subtitles, and YouTube/the form need a cover image. Do not
re-render or edit the MP4 files.

## Steps, in order

1. Read `submission/video/README.md`, `scenes.mjs` and `build.mjs`; work out each scene's start and
   end time in both cuts from the durations (and transitions, if any). Check them against the actual
   files with `ffprobe` (total duration) and a few extracted frames (`ffmpeg -ss T -frames:v 1`) at
   scene boundaries; the subtitle timings must match what is on screen to within 0.3 s.
2. Write `submission/video/subtitles/missionforge-demo-2min.en.srt` and `...-30s.en.srt`: one cue
   per on-screen caption block, the same words as on screen (headline, then body line), at most two
   lines of about 42 characters per cue, cues 1–7 s long. Validate that each file parses
   (sequential numbers, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, no overlaps).
3. Translate both into Modern Standard Arabic (`...2min.ar.srt`, `...30s.ar.srt`), using the same
   cue timings. Keep "MissionForge", "NASA", contract and part names, and SI units (km, kg, $M) in
   Latin script, as in `data/strings/ar*.json` and `client/src/i18n/strings/ar.*.json`; reuse those
   files' wording for game terms so the video matches the game.
4. Cover image `submission/media/cover-16x9.png` (1920×1080) and `submission/media/thumbnail-1280x720.jpg`
   (under 2 MB, for YouTube): built only from real material — `assets/media/key-art/missionforge-16x9.png`
   plus real phone/host screenshots from `submission/video/stills/` or `orchestration/evidence/` —
   with the title "MissionForge" and the line "Design a satellite mission together. Phones in hand,
   one big screen." No AI-invented interface. Build it with a script (HTML + Playwright screenshot, or
   ImageMagick) committed as `submission/media/build-cover.mjs` so it can be regenerated. If you add
   any new AI-generated element, add it to `submission/AI_DISCLOSURE.md` in the same change.
5. Proof: burn the English subtitles into a 20 s low-resolution preview of each cut with ffmpeg
   (do not commit the previews), extract three frames per cut into `orchestration/evidence/T049/`,
   and look at them: cue in sync with the on-screen caption, no clipping. Do the same for one Arabic
   frame (right-to-left order correct, units readable). Add the "Subtitles" and "Cover image" sections
   to `submission/video/README.md` (how to upload the .srt files to YouTube, how to rebuild the cover).

## Acceptance

Four valid SRT files in sync with the videos (frames show it); Arabic uses the game's own terms;
cover and thumbnail built from real material by a committed script; evidence frames reviewed.
