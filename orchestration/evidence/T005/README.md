# T005 evidence — blocked media generation

Date: 2026-11-14. This directory is evidence of completed preproduction and an actual tool-access blocker. It is not visual proof of finished assets.

## Done

- `assets/media/style/STYLE_GUIDE.md`: palette, accessible status design, type/layout guidance, Blender/Unity material recipes, lighting/camera direction, scene descriptions, physical/game boundaries, C1 shot plan and acceptance gates.
- `assets/media/style/PROMPT_PACK.json`: complete prompts and proposed parameters for six style frames, landscape/square key art and a silent 12 s C1 cinematic, in brief order.
- `assets/media/CREDITS.md`: authored-file provenance and explicitly ungenerated media register.

## Tool evidence and blockers

Read-only Higgsfield balance succeeded: 10 credits, Ultra plan, unlimited available through 2026-11-16T22:23:50Z. Read-only model discovery confirmed GPT Image 2.6 supports 2K/medium under the allowance, and Seedance 2.5 supports 720p under it. User preferences said no automatic project creation. No project was created. `open_home` was called once as the provider requested.

`estimate_image_cost` rejected the prepared 2K/medium configuration with `MCP tool call requires approval, but approval policy is never`. The actual first title-frame `generate_image` request then returned the identical rejection. No job ID or output URL exists. Calls were not retried through other models, identities or interfaces to bypass the approval restriction. The missing capability is permission for Higgsfield generation tools in this worker execution environment; it is **not** an established shortage of credits or a missing personal login.

Initial and final milestone progress commands were attempted using exactly the assigned Python executable and `mesh.py progress --issue 24 --agent momansy`. Both returned `ResourceUnavailable`: Python could not start because access was denied. Neither command posted an issue comment. No credentials were inspected, copied or modified.

Initial inherited-context subagent startup failed with a thread-store error. A fresh-context review subagent subsequently succeeded. It independently checked palette arithmetic and acceptance coverage. It identified weak Ocean-on-navy and panel/canvas contrast, status-fill text restrictions, and the need to distinguish gold celebration from amber warnings. Those restrictions are incorporated in the guide. Its final-file review found no blocking art-direction defect or broken Markdown links. Its requests for explicit numeric semantics, finalized evidence prose, and verifier exit behavior that never awards media acceptance from file existence alone were applied. The reviewer did not independently execute the verifier or observe provider history.

## Verification

Run from checkout root: `node orchestration/evidence/T005/verify-preproduction.mjs`. Exit 1 means failed source checks or missing assets; exit 2 would mean files exist but still require separate decoded-media and visual acceptance. This script never awards full media acceptance. `node --check orchestration/evidence/T005/verify-preproduction.mjs` passed syntax validation.

Observed result: **10/10 preproduction checks passed; all 9 required media files and the contact sheet are missing.** The script checks the JSON request count/order-related formats, complete prompts, credits mapping, file-size limits, required direction topics and foreground/background contrast arithmetic. It writes `verification.json` and deliberately exits nonzero while requested media/contact sheet are absent. Arithmetic is not a colour-vision simulation or end-to-end accessibility test. Final Higgsfield balance check remained **10 credits**, with unlimited still available; no credits were spent by this task. `git diff --check` reported no issues in tracked changes; the newly authored files are untracked and were checked by the local verifier.

There is no Unity project, client build, server build or media build pipeline in this checkout to run for T005. No game code changed. Image opening, native dimensions, codec, duration, video decode, visual consistency, hardware correctness, and actual UI-overlay readability remain **unverified** because no media was generated. No contact sheet is created from blanks or placeholder art. No rendered screenshot is claimed.

## Decisions

- Preserve credits with already-available covered unlimited settings; do not start a trial or make a purchase.
- Still targets: 2048 × 1152 px landscape and 2048 × 2048 px square. Cinematic target: 1280 × 720 px, 12 s, silent; final H.264 must be inspected and transcoded if needed after download.
- One coherent warm-sun/cool-Earth style; Earth Watch's observation satellite is the shared hardware anchor. General capsule reentry frame does not imply C1 returns a capsule.
- Produce no substitute media when the requested Higgsfield tools are blocked. Retain complete prompts for a permitted execution environment.

## Interface changes

None. Only T005-owned media/evidence paths are authored. Proposed asset paths are reserved in the prompt pack; no consumer should load them until real files exist.

## Next

Run the prepared requests in a worker with Higgsfield tool calls permitted, rechecking balance/allowance first. Generate in brief order and reuse approved references. Download every actual result into its planned path, inspect it, record provenance, and keep each file below 50 MB. Validate still sizes and H.264 video duration/decoding. Assemble `contact-sheet.jpg` from all eight finished images and representative cinematic frames, inspect it and rerun acceptance. Do not treat the current preproduction checks as full T005 acceptance.
