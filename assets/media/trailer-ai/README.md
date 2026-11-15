# T056 — MissionForge cinematic trailer shots

Four silent 16:9 Higgsfield shots were approved on 2026-11-15 (UTC) for the MissionForge marketing trailer. They are cinematic mood inserts, not gameplay footage. The model APIs did not expose deterministic seeds; `seed: not exposed` is recorded instead of inventing one.

The approved reference target is premium stylized realism: deep space navy, satin ceramic white, restrained teal accents, cool Earth fill and warm sunlight-orange rims. Every shot was checked at its opening, midpoint and closing frames for stable geometry, text, logos, watermarks, real-person likenesses and agency insignia.

## 01 — Rocket liftoff

- File: `01-rocket-liftoff.mp4`
- Job: `03706a7e-3baf-470a-81b3-70f39da32f6b`
- Model: Higgsfield `seedance_2_0_mini`
- Settings: 4 s requested; 16:9; 720p; 24 fps result; high-level genre `epic`; standard bitrate; native audio disabled; one image reference (`assets/media/style/frames/01-title.png`); paid generation, 4 credits; seed not exposed
- Date: 2026-11-15 UTC
- Prompt:

  > One continuous cinematic tracking shot: a generic unbranded two-stage ceramic-white launch vehicle with restrained teal bands lifts off at blue-hour dusk from a coastal pad. Low camera near wet reflective concrete, slow dolly backward as warm orange-white engine light blooms and clean vapor rolls outward; ocean and deep navy sky behind. Premium stylized realism matching the reference, satin white hardware, teal accents, warm 4500 K rim light, cool fill, navy shadows with detail, calm optimistic expensive tone. Physically plausible attached exhaust and stable rocket geometry. No text, no letters, no numbers, no logos, no insignia, no flags, no recognizable real launch vehicle, no watermark, no audio.
- Processing: provider H.264 output retained unchanged.
- Gate: approved. Coherent two-stage vehicle, restrained teal trim, dusk coastal pad, warm exhaust and wet-ground reflection; no prohibited marks or people.

## 03 — Fairing separation

- File: `03-fairing-separation.mp4`
- Job: `213b1caa-b306-40d6-897d-8d481d7aa436`
- Model: Higgsfield `seedance_2_0_mini`
- Settings: 4 s requested; 16:9; 720p; 24 fps result; high-level genre `epic`; standard bitrate; native audio disabled; one image reference (`assets/media/style/frames/01-title.png`); paid generation, 4 credits; seed not exposed
- Date: 2026-11-15 UTC
- Prompt:

  > One continuous cinematic telephoto shot in the upper atmosphere: the pointed white payload fairing of a generic ceramic-white launch vehicle splits cleanly along its center seam into exactly two symmetrical halves. Both halves hinge outward and drift away while a compact gold-and-white observation satellite remains securely attached to the upper stage. Thin blue Earth limb below, navy space above, warm sunlight orange rim, cool fill, restrained teal bands, realistic separation motion and unchanged rigid geometry. Premium stylized realism, calm and precise. No text, no logos, no insignia, no flags, no recognizable real vehicle, no debris, no watermark, no audio.
- Processing: provider H.264 output retained unchanged.
- Gate: approved. Exactly two clean fairing halves reveal a compact satellite over the Earth limb; no text, logos, watermark or uncontrolled debris.

## 04 — Satellite glide

- File: `04-satellite-glide.mp4`
- Job: `be0bdbc5-57ea-4411-a9ca-7334606cd974`
- Model: Higgsfield Genjutsu `hf_mult_motion_control`
- Settings: 720p; 24 fps result; native audio disabled; one free generation; image reference `assets/media/style/frames/04-orbit-operations.png`; motion reference was a local 4 s, silent H.264 excerpt (0.5–4.5 s) of the already disclosed `assets/media/cinematics/c1-earth-watch-briefing.mp4`; seed not exposed
- Date: 2026-11-15 UTC
- Prompt:

  > Transfer only the smooth orbital glide and slow camera pullback from the driving video to the referenced generic Earth-observation satellite. Preserve the reference satellite's ceramic-white bus, restrained teal trim, gold thermal blanket, small dish, nadir camera and two rigid dark-blue solar wings. Premium stylized realism, deep navy space, warm sunrise rim, cool cyan Earth fill, stable rigid geometry. No text, logos, insignia, flags, watermark or audio.
- Processing: the provider H.264 output was locally graded into the requested city-lit night-side pass. FFmpeg used a feathered quadratic mask fitted to the actual tilted cyan Earth limb (approximately y=510 px at the left edge, y=460 px at center and y=420 px at the right edge) to darken only the Earth disc, preserving the complete satellite and warm atmospheric rim. A second mask begins 30 px inside that limb and feathers over 70 px before screen-blending the repository's existing `unity/MissionForge/Assets/MissionForge/Art/Textures/Earth/earth_night_2k.jpg` city lights, preventing texture in space or on the spacecraft. The texture's NASA source/licence is already recorded in `submission/NASA_RESOURCES.md`. Final encoding is H.264/yuv420p at a true average 24 fps with no audio. The temporary motion-reference excerpt and intermediate provider file are not shipped.
- Gate: approved after the documented night-side grade. The approved satellite design stays rigid and readable during a smooth glide over a dark Earth with city lights; no text, logos, watermark, likenesses or insignia.

## 06 — Stage separation

- File: `06-stage-separation.mp4`
- Job: `8754064a-f625-4ade-8868-be7590f2737d`
- Model: Higgsfield `seedance_2_0_mini`
- Settings: 4 s requested; 16:9; 480p; 24 fps result; high-level genre `epic`; standard bitrate; native audio disabled; one image reference (`assets/media/style/frames/01-title.png`); paid generation, 2 credits; seed not exposed
- Date: 2026-11-15 UTC
- Prompt:

  > One continuous cinematic high-altitude tracking shot: a generic ceramic-white two-stage launch vehicle with restrained teal bands performs clean stage separation above Earth's curved blue limb. The spent first stage falls away intact while the upper-stage engine ignites with a compact warm orange-white glow; the two stages remain rigid, coherent and clearly separated, with physically plausible motion and no explosion. Slow lateral camera track, deep navy space, warm sunlight rim, cool Earth fill, premium stylized realism matching the reference. No text, no logos, no insignia, no flags, no recognizable real rocket, no debris, no watermark, no audio.
- Processing: the provider result was 864×496 H.264. FFmpeg selected the clean 2.2–4.0 s separation portion, cropped to isolate the two separating stages, added a navy letterbox to preserve a 16:9 composition, slowed it to 3.000 s, motion-interpolated it to a true average 24 fps, and encoded 1280×720 H.264/yuv420p at CRF 18 with no audio. This is an editorial game-trailer simplification, not a physical timing model.
- Gate: approved after the documented editorial crop. Two rigid generic stages separate over the Earth limb with restrained engine glow; no explosion, text, logo, watermark or insignia.

## Technical delivery

All four files are H.264/yuv420p at a true average 24 fps, contain one video stream and zero audio streams, are 16:9, run for 3.000–4.084 s, and are below 8 MB. Exact byte counts and SHA-256 hashes are in `assets/media/GENERATION_LOG.json` and `assets/media/CREDITS.md`.

Higgsfield accepted one additional unlimited `seedance_2_5` solar-array-deployment job (`99387e9b-70f2-45b8-b60d-1a9e115a30b2`), but it remained queued when the four-shot delivery was finalized. It is recorded as a pending attempt and is not represented as a delivered file.
