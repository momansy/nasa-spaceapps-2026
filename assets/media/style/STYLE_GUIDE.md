# MissionForge — art direction v1

Status: production direction complete; generated visual references **blocked**, not approved.
Date: 2026-11-14. Authority: `GAME_DESIGN.md` §§5.3, 14.4, 15, 16 and 19; task T005.

## Visual promise

An optimistic engineering game: a small team builds understandable machines to observe a beautiful Earth. Use stylised realism, clean silhouettes and credible assembly. Broad readable shapes come first, material response second, fine surface detail last. The identifying contrast is ceramic-white hardware against ocean navy, with restrained teal construction accents and warm sunlight. Avoid a military command bunker, distressed industrial horror, or neon science fiction.

Images are mood and composition references, not simulation outputs or assembly blueprints. Do not derive dimensions, orbital trajectories, performance or component counts from generated art.

## Palette and accessible status language

Hex values are sRGB. These colours are artistic `game_value` choices, not measured surface reflectances.

| Token | Hex | Use |
|---|---|---|
| Space | `#071522` | Background, title negative space, dark scrims |
| Console | `#112B40` | Opaque HUD and phone card surfaces |
| Ocean | `#176887` | Earth water and secondary environment accents |
| Ceramic | `#E8EEF0` | Rocket paint, main UI text, readable silhouette |
| Signal | `#55C5CD` | Selection, focus, solar-wing edge accents; never success alone |
| Sunlight | `#FFCE83` | Sun rims, small practical lights, celebration highlights |
| Muted text | `#B6C7D3` | Secondary text on Space or Console |
| Meets | `#77D6A1` | Green + check inside circle + solid border + “Meets” |
| Marginal | `#FFD166` | Amber + exclamation inside triangle + dashed border + “Marginal” |
| Fails | `#FF8F8F` | Red + cross inside octagon + double border + “Fails” |

The green/amber/red mapping follows §14.4. It is **not** a claim that those hues alone are distinguishable for every colour-vision deficiency. Always pair status with its shape, localized label and border treatment; in dense charts use fill patterns as well. Preserve these distinctions in grayscale. Do not use green versus red to encode an unlabeled good/bad delta. Add a direction arrow and an explicit signed value with its unit.

Use status hues as text/icons on Console or Space. For filled status chips use Space-coloured text. Never put white text on the pale status fills. Ocean is decorative, not small text or a sole essential control boundary on navy. Draw focus with a visible Signal outline plus a shape change; selection is distinct from requirement status. Panel and canvas colours alone do not establish an accessible boundary: add spacing, labels and a contrasting outline where grouping carries meaning. Distinguish gold celebration effects from amber warnings through placement and shape. Keep HUD backgrounds opaque enough that a bright cloud or plume cannot wash out contrast. High-contrast mode removes background imagery behind text entirely. Actual colour-vision and device checks remain required on the integrated UI.

## Typography and composition

Use the host/client's existing licensed sans-serif family if available; otherwise use system sans-serif with a broad-script fallback. Prefer open counters, clearly different I/l/1 glyphs, a true minus sign and tabular numerals for telemetry. Do not bake any typography into generated imagery. A future display face must include a documented redistribution licence before font files are committed.

At a 1920 × 1080 px host composition, start with 32 px body, 24 px secondary labels and 64 px screen titles (`game_value` layout targets). On phones start at 16 CSS px body. Test text at 200% scaling, long translations and right-to-left layout. Use sentence case; reserve capitals for short identifiers. Keep units attached to values and do not invent telemetry in art.

Safe regions are layout guides, all `game_value`: keep essential art inside a 5% inset; reserve the upper-left 45% width × 35% height of the title frame for a live logo. Build Bay reserves the outer 24% of width on **each** side for dashboard/vote panels. Keep central rocket and gantry within the middle 52%; side regions can contain low-contrast scenery but no focal cranes, bright exhaust or critical hardware. Allow those panels to exchange sides for RTL. Key art leaves a quiet upper region for separately rendered project titles.

## Materials: Blender and Unity URP starting recipes

Use metal/roughness authoring. Blender roughness and Unity smoothness have opposite direction; for these initial values use smoothness = 1 − roughness. All ranges below are dimensionless artistic `game_value` settings. Tune under the same reference illumination before adding bloom or grading. They are not measured material constants.

| Surface | Base colour direction | Metallic | Roughness | Unity smoothness | Notes |
|---|---|---|---|---|---|
| Painted rocket shell | Ceramic | 0.0 | 0.40–0.55 | 0.45–0.60 | Broad soft highlight; paint is not bare metal |
| Structural aluminium | Desaturated cool silver | 0.85–1.0 | 0.28–0.42 | 0.58–0.72 | Subtle directional brushing, readable ribs |
| Engine bell | Dark warm graphite/metal | 0.70–0.90 | 0.40–0.60 | 0.40–0.60 | Restrained heat tint, no chrome mirror |
| Solar cells | Deep blue-black | 0.15–0.35 | 0.20–0.35 | 0.65–0.80 | Stylised approximation of coated layered cells; fine grid at close range only |
| Insulation blanket | Muted warm gold | 0.65–0.85 | 0.35–0.50 | 0.50–0.65 | Broad folds, avoid crumpled glitter noise |
| Heat shield | Charcoal brown | 0.0 | 0.75–0.90 | 0.10–0.25 | Matte blunt face; plasma is a separate effect |
| Gantry/console housing | Console navy | 0.10–0.30 | 0.55–0.70 | 0.30–0.45 | Separate primary beams from secondary cables |

Keep bevels small enough to preserve engineering proportions; exaggerate only enough to catch a readable edge. Use restrained wear at handling points, no universal grime layer. Separate radiator panels, instrument apertures, solar cells and antenna faces by shape and material. Solar cells do not emit light. Screens may emit softly but should not dominate operators' faces. Avoid dense greebles and random glowing seams.

## Lighting, camera and post-processing

Use one legible key direction per shot. Dusk: warm low sun plus a cool sky fill. Orbit: crisp sunlight plus restrained blue Earth fill, with genuinely dark occluded regions. Mission Control: broad ceiling practicals, small warm work lights and controlled cool screen bounce. Keep highlights below clipping on white shells and cloud tops.

Starting art settings (`game_value`, not physical measurements): warm key at 4500 K; cool environment at 8000 K; key-to-fill contribution around 4:1; mid/wide camera at 35–50 mm equivalent focal length. Ascent tracking can use 85–120 mm equivalent to compress the range. Maintain stable exposure across a sequence rather than brightening every shadow. These are initial matching targets, not promises that engines share identical light units.

Use a filmic tone curve and subtle bloom confined to sun, flame and plasma. No chromatic aberration, heavy vignette or crushed navy shadows. Avoid motion blur that hides staging boundaries. Earth should have a thin atmospheric rim, cloud shadows and clear day/night separation; no luminous ocean or huge fluorescent halo. Star density stays low and stars may disappear in sunlit exposures.

Reduced-motion delivery uses a static approved frame, no shake, no rapid exposure changes, and fewer particles. UI text remains crisp and independent of post-processing. The generated cinematic must not autoplay with flashes; the host supplies skip/pause and a reduced-motion fallback.

## Hardware continuity and physical boundaries

The reference launch vehicle is unbranded, slender and serially staged: lower propulsion stage, clear interstage, smaller upper-stage propulsion system, and a tapered fairing. Keep attachments aligned and supported. Engine bells converge at the throat and expand toward the exit; atmospheric first-stage bells should not look like oversized vacuum nozzles. Never show deployed solar panels protruding through a closed fairing. Use generic paint bands, not recognisable corporate liveries.

The observation satellite uses one compact insulated bus, two balanced solar wings on credible hinges, a nadir-facing instrument aperture and a distinct communications antenna. Maintain the same bus and wing layout in orbit art, key art and the briefing. No giant visible laser beam: imaging and radio communications are not illustrated as visible light in space. Runtime instrument pointing, solar incidence and link availability must come from the simulation, not the illustration.

Reentry uses a blunt capsule with the heat-shield face upstream and plasma wrapping around the shoulder into the wake; no engine flame masquerading as atmospheric heating. It is a general game style frame, **not a C1 mission phase**. C1 is an Earth-observation mission and its briefing must not imply a capsule return requirement.

Plume expansion with decreasing ambient pressure, solar illumination and entry heating motivate effects qualitatively. Exact plume shape, brightness, atmospheric thickness and time compression in generated art are `game_value` visual simplifications. None of these assets verifies physical performance. No new player-facing scientific claims are introduced; any later facts or numeric overlays must follow `data/facts.json` sourcing and simulation-owned values.

## Shot direction

| Frame | Composition and subject | Artist acceptance |
|---|---|---|
| Title | Earth at terminator below, rocket silhouette on right, quiet navy above-left | Earth and rocket read at thumbnail scale; live logo fits |
| Build Bay | Central rocket on launch-pad gantry at dusk; cranes behind central structure | Both panel regions remain quiet; complete vehicle silhouette visible |
| Ascent | Distant tracking-camera view; intact serial vehicle climbing through blue dusk | Exhaust starts at bells; staging seams remain plausible; no disaster imagery |
| Orbit operations | Three-quarter satellite over curved Earth; solar wings spread clearly | Bus, camera aperture and communications antenna distinguishable |
| Reentry | Oblique capsule close-up against thin atmospheric limb | Blunt shield leads, plasma trails, capsule readable |
| Mission Control | Human-scale rows of consoles; large Earth/satellite image ahead | Calm collaborative room; abstract nonverbal displays, no fake text |

Key art: use the same spacecraft design and warm/cool split. A compact satellite in the foreground and Earth's curved horizon supply the hero image; a restrained distant launch motif may connect build and flight. Produce a landscape composition and a separately composed square variant rather than blindly cropping away solar wings. Both remain free of embedded titles, emblems and watermarks.

## C1 Earth Watch briefing

Target: 12 s (`game_value` editorial duration), 16:9, silent H.264 MP4, no text. A 720p generated source is acceptable for this first-pass brief; still style frames must be at least 1920 × 1080 px. Do not upscale and label it native 1080p. Silence follows the exterior-space direction and avoids unlocalized speech.

Shot plan (`game_value` timing): 0–4 s introduce the illuminated Earth limb and coastline; 4–8 s gently reveal the approved satellite with deployed solar wings, its imaging aperture pointed toward Earth; 8–12 s ease back into a calm establishing composition with clear negative space for runtime briefing UI. Prefer one continuous restrained camera move, rigid hardware, no teleportation and no deployment morphing. Cloud and terrain movement is editorial and must not imply a full orbit takes seconds. Briefing strings and exact C1 targets remain runtime overlays sourced from game data.

## Do / don't

- Do show one clear stage joint and useful material separation; don't add arbitrary fins, exposed gears or impossible intersections.
- Do protect UI space with low-contrast navy scenery; don't park a bright crane behind vote text.
- Do pair a red failure state with a cross, label and border; don't rely on hue alone.
- Do preserve readable dark-side forms with restrained reflected light; don't rim-light every edge with neon.
- Do show realistic imaging orientation and silent space; don't paint visible radio beams or explosive exterior sound into the cinematic.
- Do use fictional generic hardware; don't use NASA logos, real mission patches, company liveries, text or watermarks.

## Approval gate for generated references

Inspect every full-resolution image plus the combined contact sheet. Reject malformed bells, floating attachments, incoherent staging, text-like marks and mismatched satellite geometry. Check the title and Build Bay with live overlays before treating them as shipping backgrounds. Decode the full video and inspect opening, middle and closing frames for continuity and text. Confirm H.264, 8–15 s duration and every file below 50 MB. Record model, exact prompt, date, job ID and any derivation in `assets/media/CREDITS.md`.

This checkout currently has no generated media. See [PROMPT_PACK.json](PROMPT_PACK.json) for prepared requests and the [blocked-generation record](../../../orchestration/evidence/T005/README.md). The art direction has not yet been matched to a Unity scene, Blender render or approved generated frame.

## Approved references (T018) — 2026-11-14

Generated with Higgsfield `gpt_image_2_6` (2K, medium). Match these in 3D, Unity and UI work. Full provenance: `assets/media/CREDITS.md`, `assets/media/GENERATION_LOG.json`.

| File | Size (px) | Use as reference for |
|---|---|---|
| `assets/media/style/frames/01-title.png` | 2048 × 1152 | palette, lighting, launch vehicle (two-stage, teal band and strakes, two bells); upper-left 45 % × 35 % is clear for the logo |
| `assets/media/style/frames/02-build-bay.png` | 2048 × 1152 | Build Bay mood; hardware in the middle 52 %, outer 24 % each side quiet |
| `assets/media/style/frames/03-ascent.png` | 2048 × 1152 | ascent look and plume attached to the bells |
| `assets/media/style/frames/04-orbit-operations.png` | 2048 × 1152 | **satellite design anchor** (bus with gold blanket, two symmetric hinged wings, nadir aperture, separate dish) |
| `assets/media/style/frames/05-reentry.png` | 2048 × 1152 | capsule and restrained plasma look |
| `assets/media/style/frames/06-mission-control.png` | 2048 × 1152 | room mood; abstract screens only; characters are more stylised than the other frames |
| `assets/media/key-art/missionforge-16x9.png` | 2048 × 1152 | hero key art |
| `assets/media/key-art/missionforge-1x1.png` | 2048 × 2048 | square key art (sun halo shows slight banding) |

Not available: `assets/media/cinematics/c1-earth-watch-briefing.mp4` was not generated (credits ran out); use the orbit frame as the C1 look until it exists.
