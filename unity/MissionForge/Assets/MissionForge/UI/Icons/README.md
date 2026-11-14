# MissionForge icons (Lucide subset)

One open-licence outline family for host and phone (VISUAL_TARGET.md section 3.1): **Lucide**,
ISC licence (29 of the icons below derive from Feather, MIT; both licences are in
`LICENSE-lucide.txt`).

- Version: **lucide-static 1.73.0** (Lucide repo tag `1.73.0`)
- Tarball: https://registry.npmjs.org/lucide-static/-/lucide-static-1.73.0.tgz
  (sha1 `76a095f7cffc01db82e977591d850659a2cf1b48`)
- Repo: https://github.com/lucide-icons/lucide/tree/1.73.0/icons
- Downloaded: 2026-11-14

No SVG or texture is imported. The SVG elements are converted to path data at generation time
(`LucideIcons.g.cs`), parsed once at runtime by `SvgPath` (arcs become cubic Beziers) and stroked
with UI Toolkit `Painter2D` by `MfIcon`. Icons are therefore resolution independent and take any
tint.

## Files

| File | Purpose |
|---|---|
| `LucideIcons.g.cs` | Generated path data (`LucideIcons.Paths`). Do not edit. |
| `LucideIcons.cs` | Name and alias lookup plus the parsed-path cache (`LucideIcons.TryGetPath`). |
| `SvgPath.cs` | SVG path data parser and allocation-free `Painter2D` replay. |
| `MfIcons.uss` | `.mf-icon`, size classes and colour helpers. |
| `Tools~/generate-lucide-icons.mjs` | Generator (Unity ignores `Tools~`). |
| `LICENSE-lucide.txt` | Lucide ISC licence and Feather MIT notice, verbatim. |

## Using it

```xml
<mf:MfIcon kind="rocket" size="32" />
<mf:MfIcon kind="meets" class="mf-icon--meets mf-icon--24" />
```

```csharp
var icon = new MfIcon { kind = "fails", Tint = MfPalette.Fails };
```

- `kind`: any name below, an alias, or a legacy kind. `dot` is a filled disc (not Lucide).
- Colour: `Tint` when set from C# (`ClearTint()` reverts), otherwise USS `color`
  (`.mf-icon` defaults to `--mf-ceramic`; helpers `--signal`, `--muted`, `--meets`,
  `--marginal`, `--fails`, `--sunlight`, `--space`).
- Size: `size="24|32|48"` is written inline and always wins. Otherwise, with `MfIcons.uss`
  loaded, USS `width`/`height` decide (`.mf-icon` = 26 px, `.mf-icon--24/32/48`, or any more
  specific rule). Without the sheet MfIcon falls back to an inline 26 x 26 px. MfIcon detects
  the sheet through the custom property `--mf-icon-uss-sized` declared on `.mf-icon`.
- Stroke: 2 px at 24 px, scaled with size, round caps and joins.
- `MfIcons.uss` must be imported by the theme (`@import url("../Icons/MfIcons.uss");` in
  `UI/Theme/MissionForgeTheme.tss`) for the classes to work.

### Status shapes (never colour alone)

| Kind | Icon | Shape |
|---|---|---|
| `meets` | `circle-check` | check in a circle |
| `marginal` | `triangle-exclamation-point` | exclamation in a triangle |
| `fails` | `octagon-x` | cross in an octagon |

### Aliases

Legacy MfIcon kinds: `check` → `check`, `warn` → `triangle-exclamation-point`, `cross` → `x`,
`ring` → `circle`, `signal` → `signal`, `dot` (custom filled disc).

Upstream Lucide renames: `triangle-alert`, `alert-triangle` → `triangle-exclamation-point`;
`circle-alert`, `alert-circle` → `circle-exclamation-point`; `check-circle-2` → `circle-check`;
`x-octagon` → `octagon-x`; `unlock` → `lock-open`; `more-horizontal` → `ellipsis`;
`layers-3` → `layers`; `stars` → `sparkles`.

## Icon list (86)

check, x, circle, circle-check, triangle-exclamation-point, octagon-x, circle-dot,
circle-exclamation-point, info, signal, wifi, wifi-off, users, user, user-plus, qr-code, settings,
book-open, rocket, play, pause, chevron-right, chevron-left, chevron-up, chevron-down, arrow-up,
arrow-down, arrow-right, clock, timer, hourglass, git-compare, expand, ruler, crosshair, lock,
lock-open, gauge, flag, zap, satellite, radio, eye, eye-off, loader, sparkles, dollar-sign,
calendar, calendar-clock, weight, fuel, sun, contrast, type, languages, smartphone, monitor,
wrench, layers, vote, hand, crown, star, award, target, orbit, globe, battery, cpu, thermometer,
wind, mountain, flame, shield, shield-check, trending-up, trending-down, minus, plus, ellipsis,
list-checks, construction, package, cable, scan-line, link.

Feather-derived (MIT) among them: arrow-down, arrow-right, arrow-up, calendar, check,
chevron-down, chevron-left, chevron-right, chevron-up, circle, circle-exclamation-point, clock,
crosshair, dollar-sign, ellipsis, info, link, loader, lock, minus, monitor, octagon-x, plus,
radio, smartphone, target, triangle-exclamation-point, type, x.

## Regenerating or adding icons

1. Add the icon name to `ICONS` in `Tools~/generate-lucide-icons.mjs` (to change version, also
   update `LUCIDE_VERSION`; the script refuses SVGs whose licence header has another version).
2. Download and unpack the tarball into a fresh, empty directory outside the repo:

   ```sh
   mkdir -p /tmp/lucide && cd /tmp/lucide
   curl -sSLO https://registry.npmjs.org/lucide-static/-/lucide-static-1.73.0.tgz
   shasum lucide-static-1.73.0.tgz   # expect 76a095f7cffc01db82e977591d850659a2cf1b48
   tar xzf lucide-static-1.73.0.tgz
   ```

3. Run the generator (Node 18+, no npm install) with the icons folder as an argument:

   ```sh
   node unity/MissionForge/Assets/MissionForge/UI/Icons/Tools~/generate-lucide-icons.mjs /tmp/lucide/package/icons
   ```

4. Add new names to the list above and to `RequestedNames` in `UI/Tests/IconTests.cs`, then run
   the EditMode tests (every icon must parse inside the 24 x 24 box). If upstream renamed an
   icon, use the new name and add the old one to `Aliases` in `LucideIcons.cs`.
