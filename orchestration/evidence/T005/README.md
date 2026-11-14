# T005 evidence — complete media set

Date: 2026-11-14. The original unattended-worker blocker is preserved below as historical evidence. T018 supplied the six approved style frames and two key-art files; the project owner supplied the final C1 briefing video, which was validated and remuxed without audio to complete T005.

## Done

- `assets/media/style/STYLE_GUIDE.md`: palette, accessible status design, type/layout guidance, Blender/Unity material recipes, lighting/camera direction, scene descriptions, physical/game boundaries, C1 shot plan and acceptance gates.
- `assets/media/style/PROMPT_PACK.json`: complete prompts and proposed parameters for six style frames, landscape/square key art and a silent 12 s C1 cinematic, in brief order.
- `assets/media/CREDITS.md`: authored-file provenance and explicitly ungenerated media register.
- `assets/media/style/frames/01-title.png` through `06-mission-control.png`: approved 2048×1152 style frames merged by T018.
- `assets/media/key-art/missionforge-16x9.png` and `missionforge-1x1.png`: approved 2048×1152 and 2048×2048 key art merged by T018.
- `assets/media/cinematics/c1-earth-watch-briefing.mp4`: approved 10 s, 1280×720, 24 fps H.264/yuv420p briefing with no audio stream; SHA-256 `8D70D08D5413ACDE132F1A3F8FEA450ACA15CB2006AD0028238C0B58B46B8F66`.
- `orchestration/evidence/T005/contact-sheet.jpg`: 1920×810 contact sheet containing all eight stills and three representative cinematic frames.

## Historical tool evidence and blocker

Read-only Higgsfield balance succeeded: 10 credits, Ultra plan, unlimited available through 2026-11-16T22:23:50Z. Read-only model discovery confirmed GPT Image 2.6 supports 2K/medium under the allowance, and Seedance 2.5 supports 720p under it. User preferences said no automatic project creation. No project was created. `open_home` was called once as the provider requested.

`estimate_image_cost` rejected the prepared 2K/medium configuration with `MCP tool call requires approval, but approval policy is never`. The actual first title-frame `generate_image` request then returned the identical rejection. No job ID or output URL exists. Calls were not retried through other models, identities or interfaces to bypass the approval restriction. The missing capability is permission for Higgsfield generation tools in this worker execution environment; it is **not** an established shortage of credits or a missing personal login.

Initial and final milestone progress commands were attempted using exactly the assigned Python executable and `mesh.py progress --issue 24 --agent momansy`. Both returned `ResourceUnavailable`: Python could not start because access was denied. Neither command posted an issue comment. No credentials were inspected, copied or modified.

Initial inherited-context subagent startup failed with a thread-store error. A fresh-context review subagent subsequently succeeded. It independently checked palette arithmetic and acceptance coverage. It identified weak Ocean-on-navy and panel/canvas contrast, status-fill text restrictions, and the need to distinguish gold celebration from amber warnings. Those restrictions are incorporated in the guide. Its final-file review found no blocking art-direction defect or broken Markdown links. Its requests for explicit numeric semantics, finalized evidence prose, and verifier exit behavior that never awards media acceptance from file existence alone were applied. The reviewer did not independently execute the verifier or observe provider history.

## Verification

Run from checkout root: `node orchestration/evidence/T005/verify-preproduction.mjs`. Exit 0 means all source, decoded-media and recorded visual-acceptance checks pass; exit 1 means at least one check failed. `node --check orchestration/evidence/T005/verify-preproduction.mjs` passed syntax validation.

Final result: **14/14 checks passed; 0 missing media; media acceptance PASS.** The verifier checks manifest completion, prompt/source coverage, palette contrast, all still dimensions/codecs, both key-art sizes, silent H.264 duration/resolution, contact-sheet decoding, recorded visual acceptance and file-size limits. `ffmpeg` also decoded the final cinematic end to end without errors. Arithmetic remains a design-token check rather than a colour-vision simulation.

There is no Unity, client or server build required for T005 and no game code changed. All stills and the contact sheet decode at their recorded dimensions. The cinematic decodes as 1280×720 H.264/yuv420p at 24 fps for 10.000000 s with no audio stream. Five representative frames were visually inspected for satellite continuity, camera motion, negative space, text/logos and morphing; the contact sheet was also inspected.

## Decisions

- Preserve credits with already-available covered unlimited settings; do not start a trial or make a purchase.
- Still targets: 2048 × 1152 px landscape and 2048 × 2048 px square. Cinematic target: 1280 × 720 px, 8–15 s, silent H.264. The delivered source was 10.026667 s and contained quiet but audible AAC; FFmpeg removed the audio by stream copy, leaving a 10.000000 s video without re-encoding.
- One coherent warm-sun/cool-Earth style; Earth Watch's observation satellite is the shared hardware anchor. General capsule reentry frame does not imply C1 returns a capsule.
- Produce no substitute media when the requested Higgsfield tools are blocked. Retain complete prompts for a permitted execution environment.

## Interface changes

The reserved C1 cinematic path now contains the accepted asset. No game-code interface changed.

## Next

T005 is complete. Integration requires review of this branch and merge through the normal pull-request process; no direct push to `main` or unattended deployment was performed.
