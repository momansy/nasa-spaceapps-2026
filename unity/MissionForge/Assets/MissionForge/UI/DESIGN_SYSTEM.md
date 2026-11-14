# MissionForge host design system (T031)

The host UI (Unity UI Toolkit, 1920 × 1080 reference) has one design system. Every host screen (T016 Flight,
T023 Mission Control, T024 end screens, T026 minigame host and anything later) builds on it. The quality bar is
`orchestration/VISUAL_TARGET.md` section 3, and the art direction is `assets/media/style/STYLE_GUIDE.md`.
Every number in this system is a `game_value` art or layout choice, not a physical value.

## Rule: do not fork the theme

- Colours, type sizes, spacing, radii and motion durations live in **`UI/Theme/tokens.json`**. Nowhere else.
- `UI/Theme/Tokens.uss` and `UI/Motion/Motion.uss` are generated from that file
  (*MissionForge ▸ Design System ▸ Generate Token USS*). Never edit them by hand.
- `TokenSyncTests` fails if the USS, the motion classes or `MfPalette` drift from `tokens.json`. It also fails if a
  theme sheet redefines a token in `:root`.
- A screen sheet (`UI/Theme/Title.uss`, `Lobby.uss`, `Screens/BuildBay/UI/BuildBay.uss`) only places regions and
  styles its own pieces, using `var(--mf-…)` tokens and the component classes. Do not copy component rules into a
  screen sheet, and do not hard-code hex colours or font files there. If a component is missing something, change the
  component.
- The phone client (React) reads the same `tokens.json` (VISUAL_TARGET 4).

## Files

| Path | What |
|---|---|
| `Theme/tokens.json` | Single source of the tokens (palette, alpha variants, fonts, type scale, spacing, radii, elevation, motion, data viz, icons) |
| `Theme/Tokens.uss` | Generated custom properties (`--mf-<colour>`, `--mf-fs-<type>`, `--mf-sp-<n>`, `--mf-radius-<name>`, `--mf-dur-<motion>`) |
| `Theme/MissionForgeTheme.uss` | Base, type classes, layout helpers, accessibility-mode rules, legacy aliases |
| `Theme/MissionForgeTheme.tss` | The theme the PanelSettings uses. It imports everything in order |
| `Components/*.uss` + `*.cs` | Controls, surfaces, glass, data viz, navigation, crew |
| `Icons/` | Lucide (ISC) subset as SVG path data, drawn by `MfIcon` (see `Icons/README.md`) |
| `Motion/` | Generated transition classes, `MfMotion` helpers, `MfAccessibility` modes |
| `Sprites/` | 9-slice elevation shadows e1–e4 (`Sprites/Tools~/make_shadows.py` regenerates them) |
| `Specimen/` | `MfDesignSystemSpecimen`, the page shown by `Scenes/Dev/MF_DesignSystem.unity` |

## Type

| Class | Face | Size (px) | Use |
|---|---|---|---|
| `mf-display` | Oxanium 700 | 96 | Title lockup, end-screen hero |
| `mf-h1` | Oxanium 700 | 64 | Screen title |
| `mf-h2` | Oxanium 700 | 44 | Panel title |
| `mf-h3` | Plex Sans 600 | 36 | Card title, option name |
| `mf-kpi` / `mf-kpi--l` | Plex Sans 600 | 56 / 72 | Key numbers |
| `mf-body` | Plex Sans 400 | 32 | Default |
| `mf-label` | Plex Sans 500 | 24 | **Minimum for any text a player must read** |
| `mf-meta` | Plex Sans 400 | 20 | Dense table heads and ticks only, never essential |
| `mf-unit` | Plex Sans 500 | ~70 % | Units, in Muted |
| `mf-code` | Plex Mono 600 | — | Room codes and identifiers only |

- Use sentence case. Capitals are only for identifiers of three words or fewer (PDR, LIVE, a room code).
- There are no monospace labels.
- Plex Sans figures are already tabular: every digit advances 600 units, which a test checks. No derivative font is
  needed.
- Format numbers with units through `MfText.WithUnit(value, unit)`. It adds a thin space, renders the unit at 70 %
  in Muted on the same baseline, and replaces a leading hyphen with a true minus (U+2212). For signed numbers, use
  `MfText.Signed`.
- UI Toolkit has no `line-height`, so the line heights in `tokens.json` serve the React client.

## Surfaces (elevation)

| Level | How |
|---|---|
| e0 | The 3D scene |
| e1 card | `.mf-card`, or `MfCard` (adds the 9-slice shadow): Console 88 %, 1 px Ceramic-10 % border, radius 16 |
| e2 glass | `MfGlassPanel` + `.mf-glass`: blurred scene copy, Console 76 % tint, 1 px Ceramic-16 % top highlight, radius 24 |
| e3 modal | `MfOverlays.Modal`: Space-92 % scrim and a panel with the e3 shadow |
| e4 toast | `MfOverlays.Toast` (bottom-right stack), tooltip / explain popover `MfOverlays.Explain` |

- **Glass.** The URP renderer feature `MfBlurredSceneFeature` (`Art/Shaders/Rendering/`) writes a ¼-resolution
  dual-Kawase blur of the graded scene to `_MfBlurredSceneTex` every frame. `MfGlassPanel` samples it, aligned to its
  screen rect.
- **Glass falls back to opaque Console** in high contrast, on the `Mobile` quality tier, or when the feature is
  missing.
- **Never put glass on glass.** Inside a glass panel, use `.mf-card--flat` surfaces.
- **Shadows are sprites.** UI Toolkit has no box-shadow, so `MfElevation.Attach(element, level)` adds a 9-slice
  shadow child. The sprite has the surface shape cut out, so it never darkens the surface.

## Components (`UI/Components/`)

| Component | API | States |
|---|---|---|
| Button | `.mf-btn` + `--primary/--secondary/--ghost/--danger`, sizes `--l` 72 / `--m` 56 / `--s` 44; icon via `MfButtons.WithIcon` | default, hover, focus (3 px Signal ring), pressed, disabled |
| Chip / tag | `.mf-chip` (`--role`, `--muted`), `.mf-tag` (`--key`, `--live`) | |
| Status badge | `MfStatusBadge.Set(MfStatus, label)` | Meets (check in circle, solid), Marginal (exclamation in triangle, notched), Fails (cross in octagon, heavy), Pending, Info |
| Segmented control | `MfSegmented` or `.mf-segmented` + `.mf-segmented__item(--on)` | default, hover, focus, selected, disabled |
| Toggle | `MfToggle` | off, on, hover, focus, disabled |
| Text field | `TextField.mf-textfield` (`--invalid`) + `.mf-field__label/__error` | default, hover, focus, invalid |
| Card / panel | `MfCard`, `.mf-card` (`--interactive`, `--selected`, `--flat`), `.mf-panel` + header classes | |
| Seat / avatar card | `MfSeatCard.SetPlayer(...)` / `SetEmpty(waitingText)` | occupied, away, designed empty |
| Metric bar | `MfMetricBar.Set(value01, status, requirement01, reqText, ghost01, ghostText, band…)` | Meets solid, Marginal hatch, Fails cross-hatch, requirement marker, "if chosen" ghost |
| Radial gauge / timer ring | `MfRadialGauge.Set(value01, status, text, caption, threshold01)` | 270° arc, threshold tick, status glyph at the arc end; `MfMotion.Pulse` in the last 5 s |
| Gantt | `MfGanttChart.Set(rows, bars, axisDays, launchReady, deadline, …)` | Critical path (solid, Sunlight outline, chevrons), slack dotted, deadline line, now marker |
| Tally bar | `MfTallyBar.Set(segments)` | Letter badge and voter dots per option, empty message |
| Phase stepper / top navigation | `MfPhaseStepper.SetSteps/SetCurrent/SetState` | done (check), current (plate), locked (lock) |
| Toast, modal, tooltip | `MfOverlays.Toast/Modal/Close/Explain` | enter, exit |
| Skeleton, empty state | `MfSkeleton`, `MfEmptyState { text, icon }` | Never show "—", "_" or grey stand-in bars |
| Key/value row | `MfKeyValue.Set(key, value, unit)` | |

Status is never shown by hue alone. Always combine colour, shape (`MfIcon` kinds `meets`/`marginal`/`fails`), a word
and a border or pattern.

UI Toolkit pitfalls found while building these (keep to the workarounds):

- **Pills.** UI Toolkit clamps `border-radius` per axis, so the `--mf-radius-pill` token (999 px) draws an ellipse on
  anything wider than it is tall. Pill-shaped components set the radius to half their fixed height instead (chips,
  status badges and steps 40 px tall use 20 px; the Build Bay tool chips use 24 px). The token stays in
  `tokens.json` for the phone client, where CSS clamps correctly.
- **Buttons with icons.** A `Button` (a `TextElement`) that has child elements is sized from its children, not its
  text, so it collapses to its padding and clips the label. Always add icons with `MfButtons.WithIcon`, which keeps a
  measured `min-width`; for any other child added to a button, call `MfButtons.FitToText`.
- **Empty metric rows** carry `.mf-metric--empty`: the localised reason sits under the name and no bar is drawn.

## Icons

Use `MfIcon kind="<lucide-name>"` at sizes `mf-icon--24/32/48`. Colour comes from USS `color` or `Tint` in C#.

- Status shapes: `meets`, `marginal`, `fails`.
- Do not use letters, dashes or underscores as icons. Keyboard-shortcut hints (the Build Bay tool keys) are real
  keys, not icons.
- The subset and how to add icons are in `Icons/README.md`.

## Motion

Use only the tokens. Add `.mf-motion` (enter/exit) or `.mf-motion-<token>` next to a `transition-property` list. From
C#:

- `MfMotion.Enter(element, index)`: 40 ms stagger, capped at 8 items.
- `MfMotion.Exit`.
- `MfMotion.CountUp(label, from, to, format)`: ease-out-quart over 1 s.
- `MfMotion.Pulse(element, active)`: 1600 ms sine, timer warning only.

Reduced motion (`MfMotion.Reduced`, the `.mf-reduced-motion` root class) turns movement into a fade of 150 ms or
less, removes the pulse, and makes count-ups jump straight to the value.

## Accessibility modes

`MfAccessibility.Set(rtl, text200, highContrast, reducedMotion)` puts these classes on every panel root:

- `.mf-rtl`: rows mirror and panels swap sides.
- `.mf-text-200`: every token size doubles, rows wrap, panels scroll.
- `.mf-hc`: opaque Console panels, no imagery behind text, Muted text becomes Ceramic.
- `.mf-reduced-motion`.

The Build Bay maps its `BayAccessibility` onto the same classes. For demos and evidence, the command-line flags
`-mfRtl -mfText200 -mfHighContrast -mfReducedMotion` switch the modes on at start-up.

## Rigs and volumes (3D look)

A new scene does not tune URP itself. It takes one lighting rig prefab and the volumes from `Art/Lighting/`. See
`Art/Lighting/README.md` for which rig each scene uses:

- `MF_Rig_DuskPad` for ground scenes at dusk.
- `MF_Rig_Orbit` for space.
- `MF_Rig_Interior` for rooms.
- Close-ups add `MF_Volume_CloseUp` (depth of field).

The quality tiers and renderers (SSAO and the blur feature) are shared settings. Only the task holding the settings
lock may change them.

## Adding a new screen (checklist)

1. Write a UXML using the type classes and components. Leave player text empty and set it from `data/strings` in the
   controller.
2. Write a screen sheet that only positions regions, using tokens.
3. Panels over the scene: `MfGlassPanel` in the outer 24 % columns. Keep the middle 52 % for the 3D scene.
4. Provide empty and loading states with `MfEmptyState`/`MfSkeleton` and a localised message.
5. Check 100 % text, 200 % text, RTL, high contrast and reduced motion. Also check the 33 % downscale (640 × 360):
   the title, every KPI and every status word must stay legible.
6. Add the screen to the specimen page if it introduces a new component.
