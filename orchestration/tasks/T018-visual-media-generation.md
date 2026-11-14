# T018 — Generate the visual media: style frames, key art, C1 briefing (package H1)

**Worker:** `mohammed-alainieh` (macOS, Higgsfield connector) · **Starts after:** T004

mesh-model: sonnet
mesh-effort: high

**Owns:** `assets/media/` except `assets/media/style/STYLE_GUIDE.md` and
`assets/media/style/PROMPT_PACK.json`, which you may only **append** to (never edit or
remove existing text or entries); `orchestration/evidence/T018/`. Do not edit
`orchestration/evidence/T005/` and do not run its verifier (it rewrites files there).

**Credit budget:** the team owner has approved the whole available Higgsfield balance for
this game. Prefer the covered / unlimited configurations already chosen in the prompt pack
(`use_unlim: true`, GPT Image 2.6 at 2K medium, Seedance 2.5 at 720p) to preserve credits.
T005 saw unlimited generation available **until 2026-11-16T22:23:50Z**; after that, or if
the account no longer reports it, spend credits in the priority order below and stop when
they run out. Never start a trial, buy credits or change a subscription.

## Background

Task T005 wrote the art direction (`assets/media/style/STYLE_GUIDE.md`) and nine complete,
ready-to-run requests (`assets/media/style/PROMPT_PACK.json`), but every generation call
was refused in that worker with `MCP tool call requires approval, but approval policy is
never`, so no media exists. Read `assets/media/CREDITS.md` and
`orchestration/evidence/T005/README.md` for what happened. This task generates the media.

## Step 0 — tool check (do this first, stop fast)

1. Look for the Higgsfield tools in your tool list (the server is usually named
   `claude_ai_Higgsfield`). If none exist, return `status=blocked`: "Higgsfield tools not
   available in this worker; restart the worker with `--mcp <Higgsfield server name>` (see
   BUILD_MODE.md)".
2. Call the read-only balance tool and record credits, plan and unlimited availability.
3. Probe a generation-class call: the cost estimate for request 1 (`title`), or, if there
   is no estimate tool, the real generation of request 1. If any call is refused for
   permissions or approval, **return `status=blocked` immediately** with the exact tool
   name and the exact error text, plus the balance you read. Do not retry through other
   models, tools or interfaces, and do not spend the run on workarounds.

## Steps (priority order; each finished output is committed state)

Generate from `PROMPT_PACK.json` exactly (model, prompt, parameters). Respect each
request's `reference_policy`: later stills use the approved title frame as a style-only
reference, key art uses the approved orbit frame, and the cinematic uses the approved orbit
frame's job as `start_image` (never invent a media id).

1. `title` → `assets/media/style/frames/01-title.png`
2. `orbit` → `assets/media/style/frames/04-orbit-operations.png` (satellite design anchor)
3. `build_bay` → `assets/media/style/frames/02-build-bay.png`
4. `c1_briefing` → `assets/media/cinematics/c1-earth-watch-briefing.mp4`
5. `key_art_landscape` → `assets/media/key-art/missionforge-16x9.png`
6. `key_art_square` → `assets/media/key-art/missionforge-1x1.png`
7. `ascent` → `assets/media/style/frames/03-ascent.png`
8. `reentry` → `assets/media/style/frames/05-reentry.png`
9. `mission_control` → `assets/media/style/frames/06-mission-control.png`

For each output:

- **Approval gate** (`STYLE_GUIDE.md`, last section): open and inspect the full-resolution
  file. Reject malformed engine bells, floating attachments, incoherent staging, text-like
  marks, logos, watermarks and a satellite that differs from the approved anchor. For
  `title` and `build_bay`, also draw the reserved safe regions over a copy (title: upper-left
  45 % × 35 % logo area; Build Bay: outer 24 % each side quiet, hardware in the middle
  52 %) and check them; save that overlay in `orchestration/evidence/T018/`.
- **Retries:** at most 3 attempts per output while unlimited generation covers it, at most
  1 retry when it costs credits. If a prompt needs a change to pass the gate, keep the
  original in the pack and record the exact prompt you used (see below). If no attempt
  passes, keep the best one, mark it "not approved" with the reason, and move on.
- **Download** the approved result from the provider's result URL into the planned path.
  Stills must be at least 1920×1080 (square at least 1920×1920); do not upscale and call it
  native. Video: confirm H.264, 8–15 s, silent; decode the first, middle and last frames
  and inspect them for continuity and text. If the codec is not H.264, transcode with
  ffmpeg (install it with Homebrew or pip `imageio-ffmpeg` if missing) and keep both
  source details and derivative in the record. Every file under 50 MB.
- **Record** it immediately, before the next output: append a dated **T018** section to
  `assets/media/CREDITS.md` (do not rewrite T005's history; move its planned rows to
  "superseded by T018" only by appending) with tool, model, exact prompt or the pack id
  plus any changes, UTC date, job id, downloaded path, dimensions, duration and codec for
  video, SHA-256, edits or transcodes, and the gate result. Keep a machine-readable copy in
  `assets/media/GENERATION_LOG.json`. Rejected attempts are listed (job id and reason) but
  their files are not committed.

Use Python with Pillow in a virtual environment outside the repository (or `sips`) for
measurements, overlays and the contact sheet.

## Finish

- After the last output (or when credits run out), append to `STYLE_GUIDE.md` a short dated
  "Approved references (T018)" section listing the approved files, so 3D and Unity tasks
  can match them. Do not change the guide's existing text.
- Contact sheet `orchestration/evidence/T018/contact-sheet.jpg`: every approved still plus
  first / middle / last frames of the cinematic, labelled with the pack id. Also
  `orchestration/evidence/T018/README.md` with the balance before and after, what was
  generated, what was rejected and why, and what remains.
- One subagent, at most, reviews the outputs against the approval gate before you report.

## Acceptance

- Each of the nine planned files exists at its path, opens correctly, meets the size and
  format rules above and passed the approval gate, or is explicitly listed as missing or
  not approved with the reason. Nothing is claimed that was not generated and inspected.
- `CREDITS.md` and `GENERATION_LOG.json` cover every committed file and every attempt.
- The six frames and the key art read as one game (same satellite, same palette, warm sun
  and cool Earth); no logos, insignia, liveries, text or watermarks anywhere.
- The contact sheet and the safe-region overlays are in `orchestration/evidence/T018/`.
