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
| `cinematics/c1-earth-watch-briefing.mp4` | Google Gemini user-supplied export; exact model not provided; local FFmpeg remux | `c1_briefing` visual intent; original generation prompt not provided | Delivered and approved 2026-11-14; source and derivative details below |
| `../../orchestration/evidence/T005/contact-sheet.jpg` | Local FFmpeg contact-sheet assembly | All eight approved stills plus cinematic frames at 0.5, 5.5 and 9.5 s | Produced and visually inspected; 1920×810 JPEG; 531,927 bytes |

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
| `cinematics/c1-earth-watch-briefing.mp4` | completed after T018 from a user-supplied Gemini export; audio removed by lossless video remux; approved as T005's 10 s C1 briefing |

Credits: start 10, spent 10 = 8 approved stills (1 each) + 1 rejected mission-control attempt + 1 timed-out key-art submission whose output could not be recovered. Exact sequence in `GENERATION_LOG.json`. All approved stills were paid with credits (`use_unlim` false); none used unlimited generation. No AI-generated media contains logos or text by inspection; generated-media licence terms are the provider's and have not been reviewed here.

## T005 completion — C1 Earth Watch briefing (2026-11-14)

- Delivered source: `gemini_generated_video_b4f75240.mp4`, supplied by the project owner. Generation tool is identified by the filename as Google Gemini; the exact Gemini model, original prompt and generation job ID were not provided and are not invented here.
- Source inspection: 4,761,918 bytes; SHA-256 `C208723F403282307458FEA7AD286B8715872890A49318494B768E25730AC407`; MP4 with 1280×720 H.264/yuv420p video at 24 fps, 10.026667 s container duration, plus an audible AAC track (mean −44.2 dB, peak −29.7 dB).
- Final file: `assets/media/cinematics/c1-earth-watch-briefing.mp4`; FFmpeg stream-copy remux (`-map 0:v:0 -c:v copy -an -movflags +faststart`) removed the audio without re-encoding video. Final: 3,574,783 bytes; SHA-256 `8D70D08D5413ACDE132F1A3F8FEA450ACA15CB2006AD0028238C0B58B46B8F66`; 1280×720 H.264/yuv420p, 24 fps, 10.000000 s, no audio stream.
- Gate: APPROVED. Five representative frames and the full decode were inspected. The compact Earth-observation satellite keeps a coherent bus, two intact solar wings, nadir camera and separate antenna; the continuous camera eases back to useful overlay space; there is no baked-in text, logo, cut, deployment morph or visible beam. The 10 s duration is inside the brief's accepted 8–15 s range.
- Contact sheet: `orchestration/evidence/T005/contact-sheet.jpg`, 1920×810 JPEG, assembled locally with FFmpeg from all eight approved stills plus frames at 0.5, 5.5 and 9.5 s of the cinematic.

Lost attempt: key_art_landscape, first submission, client timeout, charged 1 credit at 2026-11-14T13:26:41Z, job id unknown, output not downloaded.
Rejected attempt: mission_control job `d747694a-f33a-42ac-b4e7-721e3efca9ce` (big screen showed the title-frame rocket instead of the satellite); file not committed.

## T053 — marketing trailer (2026-11-15)

Files: `submission/trailer/missionforge-trailer-16x9.mp4` and `submission/trailer/missionforge-trailer-9x16.mp4`. The edit scripts are in `submission/trailer/scripts/` and the full shot list is in `submission/trailer/README.md`.

- **Music: original, no licence needed.** I could not download a royalty-free track with a clear licence from this machine. Pixabay returned HTTP 403 to the command-line client, and the public-domain fallback page (FreePD) returned 404. So the soundtrack, "MissionForge Trailer Beat", was synthesized from scratch by `submission/trailer/scripts/music.mjs`. It is 120 BPM in A minor (Am-F-C-G) with kick, clap, hats, sub and saw bass, a 16th-note arpeggio, a detuned saw pad, noise risers and impacts, all generated sample by sample in Node.js. An AI coding agent (Claude Code, T053) wrote the notes, patterns and sound design. No samples, loops, presets, third-party recordings or AI audio models were used. There are two arrangements: 28 bars (56 s) for the 16:9 cut and 13 bars (26 s) for the 9:16 cut. The team may reuse it freely.
- **No AI images or video were generated by T053.** The trailer reuses AI material that is credited elsewhere in this file: the T056 Higgsfield clips `trailer-ai/01-rocket-liftoff.mp4` (the "LAUNCH." beat) and `trailer-ai/04-satellite-glide.mp4` (the "REACH ORBIT." beat), and the 16:9 key art, the style frames `03-ascent.png`, `04-orbit-operations.png` and `06-mission-control.png`, and the C1 briefing cinematic. Each one has an "AI-generated" label in the corner while it is on screen.
- **Gameplay:** the T054 1080p60 GPU captures of the Unity WebGL host (`assets/media/trailer-captures/`), one T031 Build Bay still (`orchestration/evidence/T031/after/buildbay-beauty-no-ui-after-1920x1080.png`), two T027 pre-flight host renders (`orchestration/evidence/T027/briefing_frame1.png`, `frr_go.png`), and real phone-client screen recordings. The phone recordings come from the scripted demo session (`?mock=1`) and the minigame labs; see `submission/video/README.md` and `submission/trailer/scripts/record-minigames.mjs`.
- **Fonts:** Oxanium 700 and IBM Plex Sans, both SIL OFL. These are the game's own copies in `client/src/assets/fonts/`.
- **QR code:** generated locally with the `qrcode` npm package (MIT licence) for https://missionforge-spaceapps.onrender.com/play/.

## T056 — rocket liftoff (2026-11-15)

- File: `assets/media/trailer-ai/01-rocket-liftoff.mp4` (1280×720 H.264/yuv420p, 24 fps, 4.041667 s, no audio, 2,055,346 bytes, SHA-256 `0e192edf2d74081ced1e45ca95ee75b41565d5ccca825aa652ade27af2f6a24b`).
- Tool/model: Higgsfield `generate_video`, `seedance_2_0_mini`, 720p/standard, genre `epic`, native audio off, paid with 4 credits. Image reference: `style/frames/01-title.png`. Seed was not exposed.
- Prompt: “One continuous cinematic tracking shot: a generic unbranded two-stage ceramic-white launch vehicle with restrained teal bands lifts off at blue-hour dusk from a coastal pad. Low camera near wet reflective concrete, slow dolly backward as warm orange-white engine light blooms and clean vapor rolls outward; ocean and deep navy sky behind. Premium stylized realism matching the reference, satin white hardware, teal accents, warm 4500 K rim light, cool fill, navy shadows with detail, calm optimistic expensive tone. Physically plausible attached exhaust and stable rocket geometry. No text, no letters, no numbers, no logos, no insignia, no flags, no recognizable real launch vehicle, no watermark, no audio.”
- Job id: `03706a7e-3baf-470a-81b3-70f39da32f6b`; UTC date 2026-11-15; provider output retained unchanged.
- Gate: APPROVED. Opening, midpoint and closing frames show a coherent generic two-stage vehicle, coastal dusk palette, warm exhaust and teal trim. No text, logos, watermark, real-person likenesses or insignia.

## T056 — fairing separation (2026-11-15)

- File: `assets/media/trailer-ai/03-fairing-separation.mp4` (1280×720 H.264/yuv420p, 24 fps, 4.041667 s, no audio, 2,166,165 bytes, SHA-256 `63f8379d5cb4b75eb39347d8f6ae2c2a13faea035e164d996f412089ace9ee9f`).
- Tool/model: Higgsfield `generate_video`, `seedance_2_0_mini`, 720p/standard, genre `epic`, native audio off, paid with 4 credits. Image reference: `style/frames/01-title.png`. Seed was not exposed.
- Prompt: “One continuous cinematic telephoto shot in the upper atmosphere: the pointed white payload fairing of a generic ceramic-white launch vehicle splits cleanly along its center seam into exactly two symmetrical halves. Both halves hinge outward and drift away while a compact gold-and-white observation satellite remains securely attached to the upper stage. Thin blue Earth limb below, navy space above, warm sunlight orange rim, cool fill, restrained teal bands, realistic separation motion and unchanged rigid geometry. Premium stylized realism, calm and precise. No text, no logos, no insignia, no flags, no recognizable real vehicle, no debris, no watermark, no audio.”
- Job id: `213b1caa-b306-40d6-897d-8d481d7aa436`; UTC date 2026-11-15; provider output retained unchanged.
- Gate: APPROVED. Exactly two clean fairing halves reveal a compact satellite over the Earth limb; no text, logos, watermark, likenesses or insignia.

## T056 — satellite glide (2026-11-15)

- File: `assets/media/trailer-ai/04-satellite-glide.mp4` (1280×720 H.264/yuv420p, true average 24 fps, 4.083333 s, no audio, 803,898 bytes, SHA-256 `fdc0ecc88504dc1520ba2d12e5fd0fa1b193cde69ddbb55a948768f97fe34457`).
- Tool/model: Higgsfield Genjutsu `hf_mult_motion_control`, 720p, one free generation, native audio off. Image reference: `style/frames/04-orbit-operations.png`. Motion reference: a temporary silent 4 s excerpt (0.5–4.5 s) of the already disclosed `cinematics/c1-earth-watch-briefing.mp4`. Seed was not exposed.
- Prompt: “Transfer only the smooth orbital glide and slow camera pullback from the driving video to the referenced generic Earth-observation satellite. Preserve the reference satellite's ceramic-white bus, restrained teal trim, gold thermal blanket, small dish, nadir camera and two rigid dark-blue solar wings. Premium stylized realism, deep navy space, warm sunrise rim, cool cyan Earth fill, stable rigid geometry. No text, logos, insignia, flags, watermark or audio.”
- Job id: `be0bdbc5-57ea-4411-a9ca-7334606cd974`; UTC date 2026-11-15. The 3,608,420-byte provider output (SHA-256 `22dd0d1cadb0713f190d33d9522a9763f07a5cf849667cf75aa71a8c59a30063`) was locally graded with FFmpeg into the requested city-lit night side. A feathered quadratic mask follows the actual tilted cyan Earth limb (approximately y=510 px left, y=460 px center, y=420 px right) so the satellite remains entirely foreground. A second mask begins 30 px inside the limb and feathers over 70 px before screen-blending the existing `unity/MissionForge/Assets/MissionForge/Art/Textures/Earth/earth_night_2k.jpg` city lights, preventing texture in space or on hardware. That texture's NASA source/licence is recorded in `submission/NASA_RESOURCES.md`. Final H.264/yuv420p encode is true average 24 fps and silent. Temporary references/intermediates are not shipped.
- Gate: APPROVED after the documented night-side grade. The reference satellite stays rigid and readable over dark Earth and city lights; no text, logos, watermark, likenesses or insignia.

## T056 — stage separation (2026-11-15)

- File: `assets/media/trailer-ai/06-stage-separation.mp4` (1280×720 H.264/yuv420p, true average 24 fps, 3.000000 s, no audio, 642,226 bytes, SHA-256 `05f18a8358d9aee7083223dfceac8d3bf2562c182fdbe29c9b7d40ccacb67f97`).
- Tool/model: Higgsfield `generate_video`, `seedance_2_0_mini`, requested 480p/standard, genre `epic`, native audio off, paid with 2 credits. Image reference: `style/frames/01-title.png`. Seed was not exposed.
- Prompt: “One continuous cinematic high-altitude tracking shot: a generic ceramic-white two-stage launch vehicle with restrained teal bands performs clean stage separation above Earth's curved blue limb. The spent first stage falls away intact while the upper-stage engine ignites with a compact warm orange-white glow; the two stages remain rigid, coherent and clearly separated, with physically plausible motion and no explosion. Slow lateral camera track, deep navy space, warm sunlight rim, cool Earth fill, premium stylized realism matching the reference. No text, no logos, no insignia, no flags, no recognizable real rocket, no debris, no watermark, no audio.”
- Job id: `8754064a-f625-4ade-8868-be7590f2737d`; UTC date 2026-11-15. The 864×496, 4.041667 s provider result was edited with FFmpeg: source time 2.2 s to end, 640×320 crop at x=224/y=0 to isolate the two stages, deep-navy padding to 640×360, 1.7× duration slowdown, motion interpolation to a true average 24 fps, Lanczos scale to 1280×720, H.264/yuv420p CRF 18, no audio. This is an editorial trailer simplification, not a physical timing model.
- Gate: APPROVED after the documented crop. Two rigid generic stages separate over the Earth limb with restrained engine glow; no explosion, text, logo, watermark, likeness or insignia.

## T056 — generation balance and pending attempt (2026-11-15)

- Starting paid balance: 10 credits. Spent: 10 credits (4 + 4 + 2) on the three `seedance_2_0_mini` jobs above. The Genjutsu satellite glide used the one available free generation. Ending paid balance: 0 credits.
- Pending, not delivered: `t056_02_solar_array_deployment`, Seedance 2.5 job `99387e9b-70f2-45b8-b60d-1a9e115a30b2`, accepted under the unlimited allowance but still in the provider queue when the four-shot delivery was finalized. No output is claimed and no file is associated with it.
- 1080p was available technically but not within the balance: the observed preflight quote was 64 credits for one 4 s Seedance 2.5 reference-driven shot. T056 therefore used the highest viable 720p path for three delivered shots and transparently upscaled the documented 480p editorial derivative for the fourth.
