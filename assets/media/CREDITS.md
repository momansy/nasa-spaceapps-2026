# MissionForge media provenance — T005

Date: 2026-11-14. **Preproduction only; no generated images or video delivered.**

## Tools, authorization and balance

The task author authorized the whole available Higgsfield balance for this game. The read-only Higgsfield `balance` call reported **10 credits**, Ultra plan, with unlimited generations available until **2026-11-16T22:23:50Z**. Its trial lifecycle field was `cancelled_by_user`; the tool nevertheless explicitly reported `unlim_available: true`. No trial was started or subscription changed. A separate Genjutsu free-generation entitlement was present and unused.

Decision: use covered 2K/medium GPT Image 2.6 stills and 720p Seedance 2.5 video, preserving paid credits. This is a prepared configuration, not evidence of a completed generation or free charge. Both `estimate_image_cost` and the first `generate_image` call returned: `MCP tool call requires approval, but approval policy is never`. No job ID or output URL was returned; neither request was submitted. No paid generation was submitted. The final read-only balance is recorded in the evidence README.

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

## Planned media — not generated, not credited as completed

Exact prompts and proposed model parameters: [style/PROMPT_PACK.json](style/PROMPT_PACK.json). The following entries reserve filenames only. They are not assets and do not claim a provider output date, job ID, licence, resolution or successful visual inspection.

| Planned file | Planned tool / model | Prompt ID | Observed state |
|---|---|---|---|
| `style/frames/01-title.png` | Higgsfield / `gpt_image_2_6` | `title` | Approval-policy rejection before submission |
| `style/frames/02-build-bay.png` | Higgsfield / `gpt_image_2_6` | `build_bay` | Not submitted |
| `style/frames/03-ascent.png` | Higgsfield / `gpt_image_2_6` | `ascent` | Not submitted |
| `style/frames/04-orbit-operations.png` | Higgsfield / `gpt_image_2_6` | `orbit` | Not submitted |
| `style/frames/05-reentry.png` | Higgsfield / `gpt_image_2_6` | `reentry` | Not submitted |
| `style/frames/06-mission-control.png` | Higgsfield / `gpt_image_2_6` | `mission_control` | Not submitted |
| `key-art/missionforge-16x9.png` | Higgsfield / `gpt_image_2_6` | `key_art_landscape` | Not submitted |
| `key-art/missionforge-1x1.png` | Higgsfield / `gpt_image_2_6` | `key_art_square` | Not submitted |
| `cinematics/c1-earth-watch-briefing.mp4` | Higgsfield / `seedance_2_5` | `c1_briefing` | Not submitted |
| `../../orchestration/evidence/T005/contact-sheet.jpg` | Local contact-sheet assembly, tool to be recorded | Arrange all eight finished stills plus representative cinematic frames | Not produced; no finished media available |

When resumed, replace each planned row with actual tool/model, exact prompt or immutable prompt reference, UTC generation date, job ID, source/result URL where safe to retain, downloaded path, dimensions, duration/codec when relevant, file hash, edits/encoding and inspection result. Record both source and derivative for any crop, resize or video transcode. Do not overwrite this blocked attempt's history or claim a new generation is the earlier rejected call.

## T018 — title (2026-11-14)

- File: `assets/media/style/frames/01-title.png` (2048×1152 px PNG, 2705026 bytes, SHA-256 `7315ca0070683125a74b8dc39c6fa6cee2c0a3563cec56a1589b9cf5f76a3cdd`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `title`.
- Prompt: PROMPT_PACK.json id `title` unchanged
- Job id: `c578d0b0-a545-455c-a719-70e5d6a637ea`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED. Logo safe region (upper-left 45%x35%) is empty navy (overlay: orchestration/evidence/T018/overlay-01-title.png); two-stage vehicle with clean engine bells; no text/logos/watermark.

## T018 — orbit (2026-11-14)

- File: `assets/media/style/frames/04-orbit-operations.png` (2048×1152 px PNG, 2934002 bytes, SHA-256 `f25f7fb825f9e5faa796932d67f0705944bb120f05ef8eb2936a60b5d6cf2a39`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `orbit`.
- Prompt: PROMPT_PACK.json id `orbit` unchanged
- Job id: `c87d4db0-ada3-4cf0-9e4e-e47b0e905489`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED (design anchor). Coherent bus with gold blanket, two symmetric hinged wings, nadir aperture, separate dish antenna; no text/logos/watermark; all wing tips in frame. Title frame job c578d0b0 passed as image_references (style only).

## T018 — build_bay (2026-11-14)

- File: `assets/media/style/frames/02-build-bay.png` (2048×1152 px PNG, 2720112 bytes, SHA-256 `eaddb8b53768883914b4cbab3203d5a1bd8b837927279066bd84b26dd6c87048`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `build_bay`.
- Prompt: PROMPT_PACK.json id `build_bay` unchanged
- Job id: `722adfe7-b970-4ce3-a84b-341320d09a17`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED. Overlay orchestration/evidence/T018/overlay-02-build-bay.png: gantry, rocket, cranes and sun inside middle 52%; outer 24% each side is dark low-contrast navy vignette (faint distant hills only); two-stage vehicle coherent, clean bells, no text/logos/watermark. Title job c578d0b0 used as image_references. First attempt hit ECONNRESET before submission (verified no charge via balance/transactions) and was resubmitted unchanged.

## T018 — key_art_landscape (2026-11-14)

- File: `assets/media/key-art/missionforge-16x9.png` (2048×1152 px PNG, 2909186 bytes, SHA-256 `f0a2850dc7ded2979669c6255b3e3b8248c76228bc700dc47eb6b801f990d0b9`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `key_art_landscape`.
- Prompt: PROMPT_PACK.json id `key_art_landscape` unchanged
- Job id: `ba83b33e-e8a9-4601-bb1f-58ea4e22f907`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED. Satellite identical in design to approved orbit anchor (job c87d4db0, passed as image_references); small distant rocket with exhaust trail upper right, not connected to satellite; upper-left quiet navy; no text/logos/watermark. Composition is close to the orbit frame by design of the reference. Note: the first submission of this prompt timed out client-side but was charged (1 credit, 2026-11-14T13:26:41Z); its job id and output were not recoverable (generation history tool returned nothing), so that attempt is logged as lost.

## T018 — key_art_square (2026-11-14)

- File: `assets/media/key-art/missionforge-1x1.png` (2048×2048 px PNG, 4891337 bytes, SHA-256 `b0500e383988a5f2a19c4636745db69262312de2806140797498b964ce40824d`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `key_art_square`.
- Prompt: PROMPT_PACK.json id `key_art_square` unchanged
- Job id: `18335653-753e-407e-bd2b-1c29dae484cd`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED with noted flaw: satellite matches anchor, both wing tips and antenna fully inside frame, no text/logos/watermark; the sun halo (upper right) shows visible contour banding and the render is slightly more posterised than the landscape art. Not retried to keep the last spare credit for the three remaining stills. Landscape key art job ba83b33e passed as image_references.

## T018 — ascent (2026-11-14)

- File: `assets/media/style/frames/03-ascent.png` (2048×1152 px PNG, 2837889 bytes, SHA-256 `703b806f014d55fd2c3de26fe84bea594191df2e45deaa905587347220543f93`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `ascent`.
- Prompt: PROMPT_PACK.json id `ascent` unchanged
- Job id: `0e16ce39-9ee5-4363-9faa-b40069d335a7`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED. Intact two-stage vehicle matching title-frame rocket (teal band/strakes, two bells), plume attached to bells, pad far below, no extra boosters/text/logos/watermark. Camera is a high oblique rather than a pure telephoto view; rocket appears large relative to the pad because it is high above it (acceptable). Title job c578d0b0 used as image_references.

## T018 — reentry (2026-11-14)

- File: `assets/media/style/frames/05-reentry.png` (2048×1152 px PNG, 2751581 bytes, SHA-256 `582e01b1254adf782e741568165b9375bcff047ad15fa33b3a8cbe46c0f9f55c`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `reentry`.
- Prompt: PROMPT_PACK.json id `reentry` unchanged
- Job id: `815101d9-3c78-4adc-b8e8-7f15c8eee770`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED. Blunt capsule with dark segmented heat shield, ceramic-white back shell, teal band, gold blanket; amber plasma restrained so geometry stays readable; no exhaust, parachute, crew, text, logos or watermark. Not an Earth Watch return. Title job c578d0b0 used as image_references.

## T018 — mission_control (2026-11-14)

- File: `assets/media/style/frames/06-mission-control.png` (2048×1152 px PNG, 3113350 bytes, SHA-256 `47e6c99f2c848286ed9c6917c2ac079c266cfdafc2c1a61d058095def831ab76`)
- Tool/model: Higgsfield `generate_image`, `gpt_image_2_6`, 2k/medium, paid by credits (1 credit; unlimited not available from Claude Code). Supersedes T005 planned row `mission_control`.
- Prompt: PROMPT_PACK.json id `mission_control` unchanged
- Job id: `c45c310d-801e-459e-8f0f-f21cc13d19ae`; UTC date 2026-11-14; no edits after download.
- Gate: APPROVED on retry. PROMPT CHANGED (pack entry unchanged): pack prompt plus final sentence 'The large forward screen shows the referenced compact observation satellite (bus with two solar wings) above Earth, not a rocket.' Reference changed from title frame to the approved orbit frame (job c87d4db0) as image_references so the screen shows the anchor satellite. Satellite on screen matches anchor; console screens abstract (charts, rings, arcs) with no letters or digits; no logos, insignia or watermark. Style is more cartoon-like than the other frames (people rendered stylised) but readable. Rejected attempt 1 (job d747694a-f33a-42ac-b4e7-721e3efca9ce, title frame as reference): big screen showed the title-frame rocket instead of the observation satellite; file not committed.

## T018 — summary and status of T005 planned rows (2026-11-14)

Appended by T018; T005's history above is unchanged.

| T005 planned row | T018 status |
|---|---|
| `style/frames/01-title.png` | superseded by T018: generated and approved |
| `style/frames/02-build-bay.png` | superseded by T018: generated and approved |
| `style/frames/03-ascent.png` | superseded by T018: generated and approved |
| `style/frames/04-orbit-operations.png` | superseded by T018: generated and approved (satellite design anchor) |
| `style/frames/05-reentry.png` | superseded by T018: generated and approved |
| `style/frames/06-mission-control.png` | superseded by T018: generated and approved on retry (changed prompt and reference recorded above) |
| `key-art/missionforge-16x9.png` | superseded by T018: generated and approved |
| `key-art/missionforge-1x1.png` | superseded by T018: generated and approved with a noted banding flaw |
| `cinematics/c1-earth-watch-briefing.mp4` | **NOT GENERATED.** No file exists. Seedance 2.5 cost preflight: 84 credits (12 s, 720p, as in the pack) and 24 credits (8 s, 480p); 8 credits were available at that point (0 now). Unlimited generation is not available from Claude Code (tool error: "unlimited generations are not available" there). |

Credits: start 10, spent 10 = 8 approved stills (1 each) + 1 rejected mission-control attempt + 1 timed-out key-art submission whose output could not be recovered. Exact sequence in `GENERATION_LOG.json`. All approved stills were paid with credits (`use_unlim` false); none used unlimited generation. No AI-generated media contains logos or text by inspection; generated-media licence terms are the provider's and have not been reviewed here.

Lost attempt: key_art_landscape, first submission, client timeout, charged 1 credit at 2026-11-14T13:26:41Z, job id unknown, output not downloaded.
Rejected attempt: mission_control job `d747694a-f33a-42ac-b4e7-721e3efca9ce` (big screen showed the title-frame rocket instead of the satellite); file not committed.
