# MissionForge media provenance — T005

Date: 2026-11-14. **Production resumed; one generated style frame is delivered and verified below.**

## Tools, authorization and balance

The task author authorized the whole available Higgsfield balance for this game. The read-only Higgsfield `balance` call reported **10 credits**, Ultra plan, with unlimited generations available until **2026-11-16T22:23:50Z**. Its trial lifecycle field was `cancelled_by_user`; the tool nevertheless explicitly reported `unlim_available: true`. No trial was started or subscription changed. A separate Genjutsu free-generation entitlement was present and unused.

Decision: use covered 2K/medium GPT Image 2.6 stills and 720p Seedance 2.5 video, preserving paid credits. The original unattended worker's `estimate_image_cost` and `generate_image` calls were rejected before submission by its approval policy. A later interactive Codex session submitted the title frame successfully under the same approved allowance. The balance remained 10 credits after submission. Subsequent batch submission accepted Mission Control but returned explicit rate-limit failures before submission for four other frames; those rejected calls created no job IDs and are not credited as outputs.

No external photographs, real mission patches, NASA logos, corporate liveries or font binaries were downloaded. Model/provider names here identify intended AI tools, not third-party artwork licences. Generated-media licensing and competition disclosure must be completed against actual outputs when generation is permitted.

## Authored files

| File | Tool / model | Prompt or source instruction | Date |
|---|---|---|---|
| `assets/media/style/STYLE_GUIDE.md` | Codex text authoring and local `apply_patch`; assistant model exact variant not exposed | Orchestrator T005: “produce the art direction for MissionForge: a specific style guide (palette with hex values, lighting and material notes)” plus `GAME_DESIGN.md` §§5.3, 14.4, 15, 16, 19; independent subagent palette review | 2026-11-14 |
| `assets/media/style/PROMPT_PACK.json` | Codex text authoring and local `apply_patch`; assistant model exact variant not exposed | Orchestrator T005's six named scenes, both key-art ratios and C1 briefing; each complete generation prompt is stored in its request's `params.prompt` | 2026-11-14 |
| `assets/media/CREDITS.md` | Codex text authoring and local `apply_patch`; assistant model exact variant not exposed | Orchestrator T005: “for every file: tool, model, prompt, date”; record only observed calls and actual files | 2026-11-14 |
| `orchestration/evidence/T005/README.md` | Codex text authoring and local `apply_patch`; assistant model exact variant not exposed | Standing orders: state completed, verified, failing and unverified work without inventing results | 2026-11-14 |
| `orchestration/evidence/T005/verify-preproduction.mjs` | Codex code authoring and local `apply_patch`; assistant model exact variant not exposed | Verify prompt manifest, palette contrast arithmetic, file-size bound and presence of all required media; report missing assets as failures | 2026-11-14 |
| `orchestration/evidence/T005/verification.json` | Node.js execution of `verify-preproduction.mjs`; no generative model | Deterministic result of the checks in the recorded verifier | 2026-11-14 |

## Media production ledger

Exact prompts and model parameters: [style/PROMPT_PACK.json](style/PROMPT_PACK.json). A row is a completed asset only when it records an actual job, downloaded file metadata and inspection result. Other rows remain planned or pending and make no completion claim.

| Planned file | Planned tool / model | Prompt ID | Observed state |
|---|---|---|---|
| `style/frames/01-title.png` | Higgsfield / `gpt_image_2_6`, 2K medium PNG, unlimited allowance | `title`; exact prompt in `style/PROMPT_PACK.json` | Generated 2026-11-14; job `a33a2929-9128-42dd-b5a4-4bde3754eb9b`; provider source `hf_20261114_110531_a33a2929-9128-42dd-b5a4-4bde3754eb9b.png`; downloaded unchanged; 2048×1152 RGB PNG; 2,641,505 bytes; SHA-256 `5F83F8D9457A080169A5C275D94CA4E2D99FB5D4675C327594CFA2A93DF8AAB1`; decoded and visually inspected: clean upper-left logo space, no text/logo/watermark, coherent palette and plausible generic vehicle |
| `style/frames/02-build-bay.png` | Higgsfield / `gpt_image_2_6` | `build_bay` | Not submitted |
| `style/frames/03-ascent.png` | Higgsfield / `gpt_image_2_6` | `ascent` | Not submitted |
| `style/frames/04-orbit-operations.png` | Higgsfield / `gpt_image_2_6` | `orbit` | Not submitted |
| `style/frames/05-reentry.png` | Higgsfield / `gpt_image_2_6` | `reentry` | Not submitted |
| `style/frames/06-mission-control.png` | Higgsfield / `gpt_image_2_6` | `mission_control` | Submitted as job `1d0620fe-ce79-4805-be7a-51837011921b`; awaiting result, not yet delivered |
| `key-art/missionforge-16x9.png` | Higgsfield / `gpt_image_2_6` | `key_art_landscape` | Not submitted |
| `key-art/missionforge-1x1.png` | Higgsfield / `gpt_image_2_6` | `key_art_square` | Not submitted |
| `cinematics/c1-earth-watch-briefing.mp4` | Higgsfield / `seedance_2_5` | `c1_briefing` | Not submitted |
| `../../orchestration/evidence/T005/contact-sheet.jpg` | Local contact-sheet assembly, tool to be recorded | Arrange all eight finished stills plus representative cinematic frames | Not produced; no finished media available |

When resumed, replace each planned row with actual tool/model, exact prompt or immutable prompt reference, UTC generation date, job ID, source/result URL where safe to retain, downloaded path, dimensions, duration/codec when relevant, file hash, edits/encoding and inspection result. Record both source and derivative for any crop, resize or video transcode. Do not overwrite this blocked attempt's history or claim a new generation is the earlier rejected call.
