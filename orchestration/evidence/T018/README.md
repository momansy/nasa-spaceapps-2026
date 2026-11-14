# T018 evidence — visual media generation (2026-11-14)

## Balance
- Before: 10 credits, Ultra plan. Unlimited generation: **not available from Claude Code** (cost preflight with `use_unlim: true` returned: unlimited generations are available only in Claude chat, Cowork and ChatGPT). `models_explore` also reported `unlim.available: false`.
- After: 0 credits (balance read 1 before the last attempt; that attempt spent it).
- 2K / medium GPT Image 2.6 still = 1 credit. Seedance 2.5 C1: 84 credits (12 s, 720p) or 24 credits (8 s, 480p), never affordable.

## Generated and approved (8 of 9 planned files)
01-title, 04-orbit-operations, 02-build-bay, 05-reentry, 03-ascent, 06-mission-control, key-art 16x9, key-art 1x1. All are PNG, 2048 × 1152 px (square 2048 × 2048 px), 2.7–4.9 MB, native resolution (nothing upscaled). Job ids, hashes and gate notes: `assets/media/CREDITS.md` and `assets/media/GENERATION_LOG.json`.

Safe-region overlays: `overlay-01-title.png` (red = logo region, clear) and `overlay-02-build-bay.png` (red = quiet outer 24 %, green = hardware middle 52 %). Contact sheet: `contact-sheet.jpg`.

## Rejected / lost
- mission_control attempt 1, job d747694a-f33a-42ac-b4e7-721e3efca9ce: the big screen showed the title-frame rocket instead of the observation satellite. Retried with the orbit frame as reference plus one added sentence (recorded); approved.
- key_art_landscape first submission: client timeout, 1 credit charged, job id and output unrecoverable (history tool returned nothing). Resubmitted unchanged and approved.
- build_bay: first call hit ECONNRESET before submission; balance and transactions confirmed no charge.

## Not delivered
- `assets/media/cinematics/c1-earth-watch-briefing.mp4`: not generated, so no H.264/duration/frame check and no cinematic frames on the contact sheet. Needs ≥ 84 credits, or a worker where unlimited generation applies (Claude chat/Cowork) before 2026-11-16T22:23:50Z.

## Known flaws (approved with notes)
- key_art_square: banding in the sun halo; more posterised than other frames.
- key art 16:9 is close in composition to the orbit frame (it is derived from it) plus a small distant rocket.
- mission_control people are more cartoon-like than the other frames.
- Gate was my own inspection of each full-resolution image; no independent reviewer subagent was run (small usage plan). Colour palette adherence was judged by eye, not measured.
